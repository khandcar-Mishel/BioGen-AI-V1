# -*- coding: utf-8 -*-
"""
BioGen AI - RFdiffusion backend on Modal
========================================
Serverless-GPU implementation of `backend/diffusion.ipynb` (the ColabDesign
RFdiffusion notebook): RFdiffusion -> ProteinMPNN -> AlphaFold2, driven by the
BioGen web app through a small REST API.

Architecture (why it is fast, robust and cheap)
-----------------------------------------------
  browser --HTTPS--> api            CPU, scales to zero, answers /health instantly
                      |  spawn()
                      v
                    run_job         CPU orchestrator, one per job; fans out, polls,
                      |             ranks, packages. Survives closed browser tabs.
                      |  spawn() x num_designs
                      v
                    run_design      GPU worker, ONE DESIGN PER CONTAINER, in parallel:
                                    RFdiffusion -> ProteinMPNN -> AF2 validation

  * weights ........ modal.Volume `biogen-rfdiffusion-weights` (downloaded once)
  * job state ...... modal.Dict   `biogen-jobs`                 (7-day idle expiry)
  * result files ... modal.Volume `biogen-rfdiffusion-results`  (PDB / FASTA / CSV / zip)

Quality choices on top of the notebook
--------------------------------------
  * Each design runs in its own container, so a job with N designs takes about
    as long as one design, and each design samples its own length from a range.
  * Every ProteinMPNN sequence is AF2-predicted; designs are ranked by the
    standard in-silico success criteria (pLDDT >= 80, self-consistency RMSD < 2 A,
    and interface PAE < 10 A for binders) instead of being returned unscored.
  * The AF2 prediction is Kabsch-aligned onto the RFdiffusion backbone so the
    frontend can overlay the two; the denoising trajectory is returned too.
  * `initial_guess` is only used for binder design (as recommended in the
    notebook); monomers are validated without it, which is the stricter test.
  * Inputs are validated against strict allow-lists and every subprocess gets
    an argv list (no shell), so request fields can never become shell syntax.

--------------------------------------------------------------------------
ONE-TIME SETUP
--------------------------------------------------------------------------
  pip install modal && modal setup
  modal secret create biogen-secrets BIOGEN_API_KEY=<long random string> --force
  modal run compute/modal/biogen_modal_app.py::download_weights   # ~5 GB, once
  modal run compute/modal/biogen_modal_app.py::selftest           # optional
  modal run compute/modal/biogen_modal_app.py::smoke              # 1 real design
  modal deploy compute/modal/biogen_modal_app.py

See compute/modal/README.md for the API contract and tuning knobs.
"""
import csv
import gzip
import hmac
import io
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
import zipfile

import modal

APP_NAME = "biogen-rfdiffusion"
VERSION = "3.1.0"
API_PREFIX = "/api/v1"

# Deploy-time knobs (read when `modal deploy` / `modal run` imports this file).
GPU = os.environ.get("BIOGEN_GPU", "T4")                                   # T4 | L4 | A10G | L40S | A100
MAX_PARALLEL_DESIGNS = int(os.environ.get("BIOGEN_MAX_PARALLEL", "8"))     # GPUs one deployment may use at once
MAX_ACTIVE_JOBS = int(os.environ.get("BIOGEN_MAX_ACTIVE_JOBS", "3"))       # queued+running jobs before 429
MAX_RESIDUES = int(os.environ.get("BIOGEN_MAX_RESIDUES", "400"))           # per design, sized for a 16 GB T4

WEIGHTS = "/weights"
RESULTS = "/results"

# In-silico success criteria (RFdiffusion paper / ColabDesign designability test).
PASS_PLDDT = 80.0   # AF2 pLDDT, 0-100
PASS_RMSD = 2.0     # self-consistency RMSD between the AF2 prediction and the design, A
PASS_I_PAE = 10.0   # AF2 interface PAE for binders, A

ACTIVE_STATES = ("queued", "preparing", "running", "packaging")
STALE_AFTER_S = 300   # the orchestrator rewrites its record every ~1.5 s; this long without a write means it died
MAX_PDB_CHARS = 5_000_000

# NOTE: files.ipd.uw.edu/krypton/schedules.zip and /krypton/ananas 404 upstream
# (Sep 2026). RFdiffusion re-computes + caches its IGSO3 schedules itself, and
# symmetry='auto' (AnAnaS) is therefore not offered.
BASE_CKPT_URL = "http://files.ipd.uw.edu/pub/RFdiffusion/6f5902ac237024bdd0c176cb93063dc4/Base_ckpt.pt"
COMPLEX_CKPT_URL = "http://files.ipd.uw.edu/pub/RFdiffusion/e29311f6f1bf1af907f9ef9f44b8328b/Complex_base_ckpt.pt"
COMPLEX_BETA_CKPT_URL = "http://files.ipd.uw.edu/pub/RFdiffusion/f572d396fae9206628714fb2ce00f72e/Complex_beta_ckpt.pt"
AF_PARAMS_URL = "https://storage.googleapis.com/alphafold/alphafold_params_2022-12-06.tar"

weights_volume = modal.Volume.from_name("biogen-rfdiffusion-weights", create_if_missing=True)
results_volume = modal.Volume.from_name("biogen-rfdiffusion-results", create_if_missing=True)
jobs_dict = modal.Dict.from_name("biogen-jobs", create_if_missing=True)
# Small side indexes. Every key is written by exactly one job, so concurrent submits can never overwrite each other,
# and listing them never has to read the (large) full job records.
index_dict = modal.Dict.from_name("biogen-jobs-index", create_if_missing=True)    # job_id -> brief record, for History
active_dict = modal.Dict.from_name("biogen-jobs-active", create_if_missing=True)  # job_id -> created_at, while running

# ---------------------------------------------------------------------------
# Images
# ---------------------------------------------------------------------------
# GPU image: CUDA 12.4 + torch 2.4 (RFdiffusion) + jax[cuda12] (ColabDesign).
# The layers below are kept byte-identical to the previously built image so
# Modal's layer cache is reused.
gpu_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.4.1-cudnn-devel-ubuntu22.04", add_python="3.11"
    )
    .apt_install("git", "wget", "aria2", "unzip", "build-essential", "ninja-build")
    .workdir("/root")
    # --- server deps (were installed at import-time in v5; done here instead) ---
    .pip_install(
        "fastapi==0.115.6", "uvicorn[standard]==0.34.0", "pydantic==2.10.4",
        "python-multipart==0.0.20", "nest_asyncio==1.6.0", "requests==2.32.3",
    )
    # --- torch 2.4 / cu124 (matches Colab's runtime the notebook targets) ---
    .pip_install(
        "torch==2.4.1", "torchvision==0.19.1",
        extra_options="--index-url https://download.pytorch.org/whl/cu124",
    )
    # --- RFdiffusion + its odd deps (mirrors setup_rfdiffusion() in v5) ---
    .run_commands(
        "git clone https://github.com/sokrypton/RFdiffusion.git /root/RFdiffusion",
        "pip install -q 'numpy<2' jedi omegaconf hydra-core icecream pyrsistent pynvml decorator scipy "
        "psutil networkx tqdm requests",  # dgl's transitive deps -- installed below with --no-dependencies
        "pip install -q git+https://github.com/NVIDIA/dllogger#egg=dllogger",
        "pip install -q --no-dependencies dgl -f https://data.dgl.ai/wheels/torch-2.4/cu124/repo.html",
        "pip install -q --no-dependencies e3nn==0.5.5 opt_einsum_fx",
        "cd /root/RFdiffusion/env/SE3Transformer && pip install -q --no-cache-dir .",
        # files.ipd.uw.edu/krypton/ananas 404s as of Sep 2026 (upstream removed it).
        "(wget -qO /root/ananas https://files.ipd.uw.edu/krypton/ananas && chmod +x /root/ananas) "
        "|| echo 'ananas unavailable upstream -> symmetry=auto will no-op' >&2",
        # v5 invokes ./RFdiffusion/run_inference.py directly -> needs the +x bit
        "chmod +x /root/RFdiffusion/run_inference.py /root/RFdiffusion/scripts/*.py || true",
    )
    # --- ColabDesign (ProteinMPNN + AlphaFold via jax) ---
    # jax[cuda12] and ColabDesign MUST be resolved by pip in the same invocation so
    # jax / jaxlib / jax-cuda12-plugin stay one coherent set. Both are pinned: jax to the
    # version that was validated on the T4, ColabDesign to the commit that adds SolubleMPNN
    # (it is otherwise identical to tag v1.1.1).
    .run_commands(
        "pip install -q 'jax[cuda12]==0.10.2' git+https://github.com/sokrypton/ColabDesign.git@e31a56fe1d9b4de25c8697f3a28b75892941cc72",
        # ColabDesign still calls jnp.clip(a_min=..., a_max=...); current JAX only accepts min= / max=
        # ("TypeError: clip() got an unexpected keyword argument 'a_max'" in AlphaFold's evoformer).
        # The notebook does `ln -s .../dist-packages/colabdesign colabdesign`; do that after patching.
        """CD="$(python -c 'import os,colabdesign;print(os.path.dirname(colabdesign.__file__))')" && """
        """sed -i 's/a_min=/min=/g; s/a_max=/max=/g' "$CD/af/alphafold/model/modules.py" "$CD/af/alphafold/model/modules_multimer.py" && """
        """! grep -rnE 'a_(min|max)=' "$CD/af" && ln -s "$CD" /root/colabdesign""",
    )
    .env({"DGLBACKEND": "pytorch", "PYTHONUNBUFFERED": "1"})
)

# CPU image for the API gateway and the job orchestrator: tiny, boots in ~1-2 s.
web_image = modal.Image.debian_slim(python_version="3.11").pip_install("fastapi[standard]==0.115.6", "PyJWT==2.10.1")

# Weight download only needs aria2 + tar.
download_image = modal.Image.debian_slim(python_version="3.11").apt_install("aria2")

app = modal.App(APP_NAME)


# ===========================================================================
# Pure helpers (stdlib only, so they can be unit-tested without Modal or a GPU)
# ===========================================================================
_NAME_RE = re.compile(r"[^A-Za-z0-9_\-]")
_CONTIG_RE = re.compile(r"^[A-Za-z0-9:/,\- ]*$")
_HOTSPOT_RE = re.compile(r"^[A-Za-z][0-9]{1,5}$")
_CHAINS_RE = re.compile(r"^[A-Za-z0-9](,[A-Za-z0-9])*$")
_RM_AA_RE = re.compile(r"^[ACDEFGHIKLMNPQRSTVWY]*$")
_PDB_CODE_RE = re.compile(r"^[A-Za-z0-9]{4}$")
_UNIPROT_RE = re.compile(r"^[A-Za-z0-9]{6,10}$")
_JOB_ID_RE = re.compile(r"^[a-f0-9]{32}$")
_FILENAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._\-]{0,127}$")


def _as_int(raw, key, lo, hi, default):
    v = raw.get(key)
    if v is None or v == "":
        return default
    try:
        n = int(v)
    except (TypeError, ValueError):
        raise ValueError(f"'{key}' must be an integer")
    if not lo <= n <= hi:
        raise ValueError(f"'{key}' must be between {lo} and {hi}")
    return n


def _as_float(raw, key, lo, hi, default):
    v = raw.get(key)
    if v is None or v == "":
        return default
    try:
        x = float(v)
    except (TypeError, ValueError):
        raise ValueError(f"'{key}' must be a number")
    if not lo <= x <= hi:
        raise ValueError(f"'{key}' must be between {lo} and {hi}")
    return x


def _as_bool(raw, key, default):
    v = raw.get(key)
    if v is None or v == "":
        return default
    if isinstance(v, bool):
        return v
    if isinstance(v, str) and v.lower() in ("true", "false"):
        return v.lower() == "true"
    raise ValueError(f"'{key}' must be true or false")


def analyze_contigs(contigs: str) -> dict:
    """Mode detection from the notebook, plus a residue estimate and protocol hint.

    mode:     free (unconditional) | fixed (binder / motif scaffolding) | partial
    protocol: unconditional | binder | motif | partial
    """
    tokens = contigs.replace(",", " ").replace(":", " ").split()
    is_fixed = is_free = False
    fixed_chains, kinds, est_len = [], [], 0
    for tok in tokens:
        has_fixed = has_free = False
        for seg in tok.split("/"):
            head = seg.split("-")[0]
            if not head:
                raise ValueError(f"Malformed contig segment '{seg}'")
            if head[0].isalpha():
                is_fixed = has_fixed = True
                if head[0] not in fixed_chains:
                    fixed_chains.append(head[0])
                m = re.fullmatch(r"[A-Za-z](\d+)-(\d+)", seg)
                if m:
                    lo, hi = int(m.group(1)), int(m.group(2))
                    if hi < lo:
                        raise ValueError(f"Contig range '{seg}' is reversed")
                    est_len += hi - lo + 1
                elif not re.fullmatch(r"[A-Za-z](\d+)?(-\d*)?", seg):
                    raise ValueError(f"Malformed contig segment '{seg}'")
            elif head.isnumeric():
                is_free = True
                if seg != "0":                     # "0" is just a chain break
                    has_free = True
                    parts = seg.split("-")
                    if len(parts) > 2 or not all(x.isnumeric() for x in parts):
                        raise ValueError(f"Malformed contig segment '{seg}'")
                    if len(parts) == 2 and int(parts[1]) < int(parts[0]):
                        raise ValueError(f"Contig range '{seg}' is reversed")
                    if int(parts[-1]) < 1:
                        raise ValueError(f"Contig segment '{seg}' must be at least 1 residue")
                    est_len += int(parts[-1])
            else:
                raise ValueError(f"Malformed contig segment '{seg}'")
        kinds.append("both" if has_fixed and has_free else "fixed" if has_fixed else "free")

    if not tokens or not is_free:
        mode = "partial"
    elif is_fixed:
        mode = "fixed"
    else:
        mode = "free"

    if mode == "partial":
        protocol = "partial"
    elif mode == "free":
        protocol = "unconditional"
    elif "fixed" in kinds and "free" in kinds and "both" not in kinds:
        protocol = "binder"
    else:
        protocol = "motif"
    return {"mode": mode, "protocol": protocol, "fixed_chains": fixed_chains, "est_len": est_len}


def validate_params(raw: dict) -> dict:
    """Validate + normalize a job request. Raises ValueError with a user-facing message."""
    if not isinstance(raw, dict):
        raise ValueError("Request body must be a JSON object")
    p = {}
    p["name"] = _NAME_RE.sub("_", str(raw.get("name") or "biogen_design").strip())[:48] or "biogen_design"

    contigs = str(raw.get("contigs") if raw.get("contigs") is not None else "100").strip()
    if len(contigs) > 300 or not _CONTIG_RE.match(contigs):
        raise ValueError("'contigs' may only contain letters, digits and : / , - and spaces")
    p["contigs"] = contigs
    info = analyze_contigs(contigs)

    pdb = str(raw.get("pdb") or "").strip()
    if pdb and not (_PDB_CODE_RE.match(pdb) or _UNIPROT_RE.match(pdb)):
        raise ValueError("'pdb' must be a 4-character PDB ID or a UniProt accession")
    pdb_content = raw.get("pdb_content") or ""
    if not isinstance(pdb_content, str):
        raise ValueError("'pdb_content' must be text")
    if len(pdb_content) > MAX_PDB_CHARS:
        raise ValueError("Uploaded structure is too large (limit 5 MB)")
    if pdb_content.strip() and not re.search(r"^ATOM  ", pdb_content, re.M):
        raise ValueError("'pdb_content' contains no ATOM records")
    p["pdb"] = pdb.upper() if _PDB_CODE_RE.match(pdb) else pdb
    p["pdb_content"] = pdb_content
    if info["mode"] in ("fixed", "partial") and not (pdb or pdb_content.strip()):
        raise ValueError(
            f"Contigs '{contigs}' need a target structure: provide a PDB ID or upload a PDB "
            "(or use a plain length such as '100' for de novo design)"
        )

    p["iterations"] = _as_int(raw, "iterations", 15, 300, 50)   # RFdiffusion asserts T >= 15
    p["num_designs"] = _as_int(raw, "num_designs", 1, 32, 1)

    hotspot = re.sub(r"[\s'\"\[\]]", "", str(raw.get("hotspot") or ""))
    if hotspot:
        toks = [t for t in hotspot.split(",") if t]
        if not toks or not all(_HOTSPOT_RE.match(t) for t in toks):
            raise ValueError("'hotspot' must look like E64,E88,E96")
        hotspot = ",".join(toks)
        if info["mode"] != "fixed":
            raise ValueError("Hotspot residues only apply to binder design: give Contigs a target chain plus a free "
                             "length, e.g. A:50-70 or E6-155:70-100 (or clear the Hotspot field)")
        bad = sorted({t[0] for t in toks} - set(info["fixed_chains"]))
        if bad:
            raise ValueError(f"Hotspot chain {', '.join(bad)} is not a target chain in Contigs "
                             f"(Contigs uses chain {', '.join(info['fixed_chains'])}). Fix the hotspot chain letters.")
    p["hotspot"] = hotspot

    symmetry = str(raw.get("symmetry") or "none").lower()
    if symmetry == "auto":
        raise ValueError("symmetry 'auto' is unavailable (the AnAnaS detector is no longer distributed); "
                         "choose cyclic or dihedral")
    if symmetry not in ("none", "cyclic", "dihedral"):
        raise ValueError("'symmetry' must be none, cyclic or dihedral")
    order = _as_int(raw, "order", 1, 12, 1)
    if symmetry == "cyclic" and order == 1:
        symmetry = "none"
    if symmetry == "dihedral" and order < 2:
        raise ValueError("dihedral symmetry needs order >= 2")
    p["symmetry"], p["order"] = symmetry, order

    chains = str(raw.get("chains") or "").replace(" ", "")
    if chains and not _CHAINS_RE.match(chains):
        raise ValueError("'chains' must look like A or A,B")
    p["chains"] = chains
    p["add_potential"] = _as_bool(raw, "add_potential", False)

    # ProteinMPNN + AlphaFold validation stage
    p["validate"] = _as_bool(raw, "validate", True)
    num_seqs = _as_int(raw, "num_seqs", 1, 64, 8)
    p["num_seqs"] = num_seqs if num_seqs < 8 else (num_seqs // 8) * 8   # designability_test samples in batches of 8
    p["mpnn_sampling_temp"] = _as_float(raw, "mpnn_sampling_temp", 0.0001, 1.5, 0.1)
    p["num_recycles"] = _as_int(raw, "num_recycles", 0, 12, 3)
    rm_aa = str(raw.get("rm_aa") if raw.get("rm_aa") is not None else "C").upper().replace(",", "")
    if not _RM_AA_RE.match(rm_aa):
        raise ValueError("'rm_aa' must be one-letter amino-acid codes, e.g. C")
    p["rm_aa"] = rm_aa
    p["use_multimer"] = _as_bool(raw, "use_multimer", False)
    p["use_beta_model"] = _as_bool(raw, "use_beta_model", False)
    p["use_soluble"] = _as_bool(raw, "use_soluble", False)   # ProteinMPNN trained on soluble proteins only
    p["noise_scale"] = _as_float(raw, "noise_scale", 0.0, 1.0, 1.0)
    preset = str(raw.get("preset") or "custom").lower()
    p["preset"] = preset if preset in ("fast", "balanced", "accurate", "custom") else "custom"

    # derived
    p["mode"], p["protocol"] = info["mode"], info["protocol"]
    p["fixed_chains"], p["est_len"] = info["fixed_chains"], info["est_len"]
    ig = raw.get("initial_guess")
    p["initial_guess"] = (p["protocol"] == "binder") if ig in (None, "", "auto") else _as_bool(raw, "initial_guess", False)
    p["total_steps"] = int(80 * (p["iterations"] / 200)) if info["mode"] == "partial" else p["iterations"]
    if info["est_len"] * (p["order"] if p["symmetry"] == "cyclic" else 2 * p["order"] if p["symmetry"] == "dihedral" else 1) > MAX_RESIDUES:
        raise ValueError(f"Design is longer than {MAX_RESIDUES} residues, the limit for the {GPU} GPU "
                         "this backend is deployed on")
    return p


def public_params(p: dict) -> dict:
    """Params safe to echo back to the browser (no uploaded structure text)."""
    return {k: v for k, v in p.items() if k != "pdb_content"}


def build_rfdiffusion_args(p: dict, *, contigs: list, run_dir: str, dump_dir: str, design_idx: int,
                           steps: int, input_pdb, sym, copies: int, rfdiffusion_dir: str) -> list:
    """Hydra overrides for run_inference.py as an argv list (never a shell string)."""
    opts = []
    if sym is not None:
        opts += ["--config-name", "symmetry", f"inference.symmetry={sym}"]
        if p["add_potential"]:
            opts += [
                'potentials.guiding_potentials=["type:olig_contacts,weight_intra:1,weight_inter:0.1"]',
                "potentials.olig_intra_all=True", "potentials.olig_inter_all=True",
                "potentials.guide_scale=2", "potentials.guide_decay=quadratic",
            ]
    opts += [
        f"inference.output_prefix={run_dir}/design",
        "inference.num_designs=1",
        f"inference.design_startnum={design_idx}",
    ]
    if input_pdb:
        opts.append(f"inference.input_pdb={input_pdb}")
    if p["mode"] == "partial":
        # partial_T must be <= T and is read as a fraction of T (the notebook's auto value is 80/200 = 0.4), so the
        # full schedule length has to be set too; the notebook leaves T at 50, which breaks iterations != 50.
        opts += [f"diffuser.T={p['iterations']}", f"diffuser.partial_T={steps}"]
    else:
        opts.append(f"diffuser.T={steps}")
    if p["hotspot"]:
        opts.append(f"ppi.hotspot_res=[{p['hotspot']}]")
    if p["noise_scale"] != 1.0:
        opts += [f"denoiser.noise_scale_ca={p['noise_scale']}", f"denoiser.noise_scale_frame={p['noise_scale']}"]
    opts.append(f"contigmap.contigs=[{' '.join(contigs)}]")
    opts += ["inference.dump_pdb=True", f"inference.dump_pdb_path={dump_dir}"]
    if p["use_beta_model"]:
        opts.append(f"inference.ckpt_override_path={rfdiffusion_dir}/models/Complex_beta_ckpt.pt")
    return opts


def parse_scores_csv(text: str) -> list:
    """Parse ColabDesign's mpnn_results.csv into rows; pLDDT is rescaled 0-1 -> 0-100."""
    rows = []
    for r in csv.DictReader(io.StringIO(text)):
        row = {"n": int(float(r["n"])), "seq": (r.get("seq") or "").strip()}
        for k in ("mpnn", "plddt", "ptm", "pae", "i_ptm", "i_pae", "rmsd"):
            v = r.get(k)
            row[k] = float(v) if v not in (None, "", "nan") else None
        if row["plddt"] is not None and row["plddt"] <= 1.0:
            row["plddt"] *= 100.0
        rows.append(row)
    return rows


def is_pass(row: dict, protocol: str) -> bool:
    if row.get("plddt") is None or row["plddt"] < PASS_PLDDT:
        return False
    if row.get("rmsd") is not None and row["rmsd"] >= PASS_RMSD:
        return False
    if protocol == "binder" and row.get("i_pae") is not None and row["i_pae"] >= PASS_I_PAE:
        return False
    return True


def _sort_key(row: dict, protocol: str):
    """Lower is better: passing first, then the protocol's primary metric, then pLDDT."""
    primary = row.get("i_pae") if protocol == "binder" and row.get("i_pae") is not None else row.get("rmsd")
    return (not is_pass(row, protocol), primary if primary is not None else 1e9, -(row.get("plddt") or 0.0))


def pick_best_sequence(rows: list, protocol: str) -> dict:
    return min(rows, key=lambda r: _sort_key(r, protocol))


def rank_designs(designs: list, protocol: str) -> list:
    """Order finished designs best-first and stamp `rank`. Unvalidated designs keep index order."""
    def key(d):
        m = d.get("metrics")
        if not m:
            return (1, 0, 0.0, 0.0, d["index"])
        k = _sort_key(m, protocol)
        return (0, k[0], k[1], k[2], d["index"])
    ordered = sorted(designs, key=key)
    for i, d in enumerate(ordered, 1):
        d["rank"] = i
    return ordered


def _ca_coords(pdb_text: str) -> list:
    out = []
    for line in pdb_text.splitlines():
        if line.startswith("ATOM") and line[12:16].strip() == "CA":
            out.append((float(line[30:38]), float(line[38:46]), float(line[46:54])))
    return out


def align_pdb(mobile_pdb: str, ref_pdb: str):
    """Kabsch-align `mobile_pdb` onto `ref_pdb` over CA atoms. Returns (pdb_text, rmsd or None)."""
    import numpy as np
    P, Q = _ca_coords(mobile_pdb), _ca_coords(ref_pdb)
    if len(P) != len(Q) or len(P) < 3:
        return mobile_pdb, None
    P, Q = np.asarray(P), np.asarray(Q)
    pm, qm = P.mean(0), Q.mean(0)
    H = (P - pm).T @ (Q - qm)
    U, _, Vt = np.linalg.svd(H)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    R = Vt.T @ np.diag([1.0, 1.0, d]) @ U.T
    rmsd = float(np.sqrt((((P - pm) @ R.T + qm - Q) ** 2).sum(1).mean()))
    lines = []
    for line in mobile_pdb.splitlines():
        if line.startswith(("ATOM", "HETATM")):
            x = np.array([float(line[30:38]), float(line[38:46]), float(line[46:54])])
            x = R @ (x - pm) + qm
            line = f"{line[:30]}{x[0]:8.3f}{x[1]:8.3f}{x[2]:8.3f}{line[54:]}"
        lines.append(line)
    return "\n".join(lines) + "\n", rmsd


def normalize_bfactors(pdb_text: str) -> str:
    """AF2 predictions are expected to carry pLDDT 0-100 in the B-factor column; rescale if 0-1."""
    try:
        bs = [float(l[60:66]) for l in pdb_text.splitlines() if l.startswith("ATOM") and len(l) >= 66]
    except ValueError:
        return pdb_text
    if not bs or max(bs) > 1.0:
        return pdb_text
    out = []
    for line in pdb_text.splitlines():
        if line.startswith(("ATOM", "HETATM")) and len(line) >= 66:
            line = f"{line[:60]}{float(line[60:66]) * 100.0:6.2f}{line[66:]}"
        out.append(line)
    return "\n".join(out) + "\n"


def thin_trajectory(text: str, max_frames: int = 40, reverse: bool = True) -> str:
    """Keep <= max_frames evenly spaced frames and re-emit them as MODEL/ENDMDL blocks. RFdiffusion
    separates frames with ENDMDL only (no MODEL records) and writes final->noise, so `reverse` flips it
    to noise->final, the order the viewer plays."""
    frames, cur = [], []
    for line in text.splitlines():
        if line.startswith("ENDMDL"):
            if cur:
                frames.append(cur)
            cur = []
        elif line.startswith(("ATOM", "HETATM", "TER")):
            cur.append(line)
    if cur:
        frames.append(cur)
    if len(frames) < 2:
        return text
    if reverse:
        frames.reverse()
    n = len(frames)
    idxs = list(range(n)) if n <= max_frames else sorted({round(i * (n - 1) / (max_frames - 1)) for i in range(max_frames)})
    out = []
    for i, fi in enumerate(idxs, 1):
        out.append(f"MODEL     {i:>4}")
        out += frames[fi]
        out.append("ENDMDL")
    out.append("END")
    return "\n".join(out) + "\n"


def scores_csv_text(rows: list, protocol: str) -> str:
    cols = ["n", "mpnn", "plddt", "ptm", "pae", "i_ptm", "i_pae", "rmsd", "passed", "seq"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for r in rows:
        w.writerow([("" if r.get(c) is None else (round(r[c], 3) if isinstance(r.get(c), float) else r.get(c)))
                    for c in cols[:-2]] + [is_pass(r, protocol), r["seq"]])
    return buf.getvalue()


def fasta_text(rows: list, protocol: str, name: str, idx: int) -> str:
    out = []
    for r in rows:
        bits = [f"{name}_d{idx + 1}_s{r['n'] + 1}", f"pLDDT={r['plddt']:.1f}" if r.get("plddt") is not None else None,
                f"RMSD={r['rmsd']:.2f}" if r.get("rmsd") is not None else None,
                f"iPAE={r['i_pae']:.2f}" if r.get("i_pae") is not None else None,
                "pass" if is_pass(r, protocol) else "fail"]
        out.append(">" + " ".join(b for b in bits if b) + "\n" + r["seq"])
    return "\n".join(out) + "\n"


def _fixed_segments(contigs: str) -> list:
    """(chain, lo, hi) for every target segment of the contigs. lo None = whole chain, hi None = to the chain's end."""
    out = []
    for tok in contigs.replace(",", " ").replace(":", " ").split():
        for seg in tok.split("/"):
            m = re.fullmatch(r"([A-Za-z])(\d+)?(-(\d*))?", seg)
            if m:
                lo = int(m.group(2)) if m.group(2) else None
                hi = int(m.group(4)) if m.group(4) else (lo if m.group(3) is None else None)
                out.append((m.group(1), lo, hi))
    return out


def scan_target(pdb_text: str) -> dict:
    """chain -> residue numbers (C-alpha atoms of the first model), the same view RFdiffusion has of the target."""
    chains, seen = {}, set()
    for line in pdb_text.splitlines():
        if line.startswith("ENDMDL"):
            break
        if line.startswith("ATOM  ") and len(line) > 26 and line[12:16].strip() == "CA" and line[16] in " A":
            try:
                num = int(line[22:26])
            except ValueError:
                continue
            key = (line[21], num, line[26])
            if key not in seen:
                seen.add(key)
                chains.setdefault(line[21], []).append(num)
    return chains


def preflight_target(p: dict, chains: dict, max_residues: int) -> int:
    """Check the request against the real target BEFORE any GPU starts, so a typo costs nothing.
    Returns the residue count of the finished design; raises ValueError with a message the user can act on."""
    if not chains:
        raise ValueError("The target structure has no protein residues (no C-alpha atoms found)")
    avail = sorted(chains)
    chosen = [c for c in p["chains"].split(",") if c] or avail
    gone = [c for c in chosen if c not in chains]
    if gone:
        raise ValueError(f"Input chain(s) {', '.join(gone)} are not in the target, which has chain(s) {', '.join(avail)}")

    target_len = 0
    for chain, lo, hi in _fixed_segments(p["contigs"]):
        if chain not in chosen:
            raise ValueError(f"Contigs use chain {chain}, but it is not among the input chains "
                             f"({', '.join(chosen)}); the target has chain(s) {', '.join(avail)}")
        res = chains[chain]
        if lo is None:
            target_len += len(res)
            continue
        if lo < min(res) or (hi is not None and hi > max(res)):
            raise ValueError(f"Contigs ask for {chain}{lo}-{hi if hi is not None else ''}, but chain {chain} of the "
                             f"target only covers residues {min(res)}-{max(res)}")
        target_len += len([r for r in res if r >= lo]) if hi is None else hi - lo + 1

    free_len = 0
    for tok in p["contigs"].replace(",", " ").replace(":", " ").split():
        for seg in tok.split("/"):
            if seg and seg[0].isdigit() and seg != "0":
                free_len += int(seg.split("-")[-1])
    total = target_len + free_len
    if p["mode"] == "partial" and not target_len:
        total = sum(len(chains[c]) for c in chosen)         # empty contigs = keep every chosen chain

    if p["hotspot"]:
        absent = [h for h in p["hotspot"].split(",") if int(h[1:]) not in set(chains.get(h[0], []))]
        if absent:
            raise ValueError(f"Hotspot residue(s) {', '.join(absent)} do not exist in the target "
                             f"(check the chain letter and residue numbers)")

    total *= (p["order"] if p["symmetry"] == "cyclic" else 2 * p["order"] if p["symmetry"] == "dihedral" else 1)
    if total > max_residues:
        hint = (" Contigs has no free length, so this is partial diffusion, which keeps EVERY chain of the target: "
                "limit it with 'Input chains', or for a binder add a length to Contigs (e.g. E6-155:70-100)."
                if p["mode"] == "partial" and not free_len else "")
        raise ValueError(f"Design has {total} residues; the {GPU} GPU backend allows at most {max_residues}.{hint}")
    return total


def job_brief(r: dict) -> dict:
    """A job record without the bulky parts (log lines, per-design sequence tables) - what lists need."""
    d = {k: v for k, v in r.items() if k != "recent_logs"}
    d["designs"] = [{k: v for k, v in x.items() if k != "sequences"} for x in r.get("designs", [])]
    return d


def settle_stale(r: dict, now=None) -> dict:
    """A job still marked active whose orchestrator stopped writing is reported as failed instead of spinning forever."""
    now = time.time() if now is None else now
    if r.get("status") in ACTIVE_STATES and now - r.get("updated_at", r.get("created_at", now)) > STALE_AFTER_S:
        return {**r, "status": "failed", "status_message": "Failed",
                "error_message": "This job stopped unexpectedly (its controller stopped responding). Start it again."}
    return r


def pick_client_ip(forwarded: str, peer: str) -> str:
    """Address used to throttle sign-ins. Anything a caller puts in X-Forwarded-For arrives BEFORE the entry the
    platform's proxy appends, so only the last entry can be trusted; the first is attacker-controlled."""
    hops = [h.strip() for h in (forwarded or "").split(",") if h.strip()]
    return (hops[-1] if hops else (peer or "unknown"))[:64]


# ===========================================================================
# Authentication: one admin account from the environment, JWT sessions
# ===========================================================================
JWT_ISSUER = "biogen-ai"
LOGIN_MAX_FAILURES = 5      # failed sign-ins ...
LOGIN_WINDOW_S = 600        # ... within this many seconds lock the client out ...
LOGIN_LOCK_S = 300          # ... for this long


def auth_config(env=None):
    """Sign-in settings from the environment (the Modal secret), or None when auth is not configured.
    AUTH_EMAIL / AUTH_PASSWORD are the account; JWT_SECRET (>= 32 chars) signs the sessions."""
    env = os.environ if env is None else env
    email = (env.get("AUTH_EMAIL") or "").strip().lower()
    password = env.get("AUTH_PASSWORD") or ""
    secret = env.get("JWT_SECRET") or ""
    if not email or not password or len(secret) < 32:
        return None
    try:
        ttl = float(env.get("JWT_TTL_HOURS") or 12)
    except ValueError:
        ttl = 12.0
    return {"email": email, "password": password, "secret": secret, "ttl_hours": min(max(ttl, 0.1), 24 * 30)}


def check_credentials(cfg: dict, email: str, password: str) -> bool:
    """Constant-time comparison; both fields are always compared so timing does not reveal which one was wrong."""
    ok_email = hmac.compare_digest((email or "").strip().lower().encode(), cfg["email"].encode())
    ok_pass = hmac.compare_digest((password or "").encode(), cfg["password"].encode())
    return ok_email and ok_pass


def issue_token(cfg: dict, now=None):
    """Returns (jwt, seconds_until_expiry). HS256 with iss / sub / iat / exp."""
    import jwt
    now = int(time.time() if now is None else now)
    ttl = int(cfg["ttl_hours"] * 3600)
    token = jwt.encode({"iss": JWT_ISSUER, "sub": cfg["email"], "iat": now, "exp": now + ttl},
                       cfg["secret"], algorithm="HS256")
    return token, ttl


def decode_token(token: str, secret: str):
    """Claims of a valid, unexpired token signed by us, else None. The algorithm is pinned (no 'none' / RS tricks)."""
    import jwt
    try:
        return jwt.decode(token, secret, algorithms=["HS256"], issuer=JWT_ISSUER,
                          options={"require": ["exp", "iat", "sub", "iss"]})
    except jwt.PyJWTError:
        return None


def login_retry_after(failures: list, now=None) -> int:
    """Seconds a client must still wait after too many failed sign-ins (0 = may try)."""
    now = time.time() if now is None else now
    recent = [t for t in failures if now - t < LOGIN_WINDOW_S]
    if len(recent) < LOGIN_MAX_FAILURES:
        return 0
    return max(0, int(max(recent) + LOGIN_LOCK_S - now) + 1)


# ===========================================================================
# GPU worker: one design per container
# ===========================================================================
class _Cancelled(Exception):
    pass


class _DesignError(Exception):
    pass


class _Progress:
    """Throttled progress writer for one design (single writer per key -> no races)."""

    def __init__(self, job_id: str, idx: int):
        self.key, self.last = f"prog:{job_id}:{idx}", 0.0
        self.cancel_key, self.last_cancel_check = f"cancel:{job_id}", 0.0

    def set(self, phase: str, pct: float, msg: str, step: int = 0, total: int = 0, force: bool = False):
        now = time.time()
        if not force and now - self.last < 1.0:
            return
        self.last = now
        jobs_dict.put(self.key, {"phase": phase, "pct": round(pct, 1), "msg": msg,
                                 "step": step, "total": total, "t": now})

    def check_cancel(self):
        now = time.time()
        if now - self.last_cancel_check < 3.0:
            return
        self.last_cancel_check = now
        if jobs_dict.contains(self.cancel_key):
            raise _Cancelled()


class _LogTail:
    def __init__(self, path: str):
        self.path, self.pos, self.buf = path, 0, ""

    def new_lines(self) -> list:
        try:
            with open(self.path, "rb") as f:
                f.seek(self.pos)
                chunk = f.read()
        except FileNotFoundError:
            return []
        self.pos += len(chunk)
        *lines, self.buf = (self.buf + chunk.decode("utf-8", "replace")).split("\n")
        return lines


def _tail_text(path: str, n: int = 14, maxchars: int = 1100) -> str:
    try:
        with open(path, "r", errors="replace") as f:
            return "".join(f.readlines()[-n:])[-maxchars:]
    except Exception:
        return "(no log available)"


def _kill(proc):
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except Exception:
        proc.kill()


STALL_SECONDS = 900   # a stage whose log and step counter have not moved for this long is hung -> stop billing for it


def _run_monitored(argv, *, log_path, on_tick, prog, cwd="/root", env=None, steady=lambda: 0):
    """Run argv, calling on_tick() every 0.5 s; honour cancellation; stop it if it hangs; report the log tail on failure.
    `steady()` returns any extra progress signal (e.g. the diffusion step count)."""
    with open(log_path, "wb") as log:
        proc = subprocess.Popen(argv, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT,
                                start_new_session=True)
    last_sig, last_move = None, time.time()
    try:
        while proc.poll() is None:
            prog.check_cancel()
            on_tick()
            sig = (os.path.getsize(log_path), steady())
            if sig != last_sig:
                last_sig, last_move = sig, time.time()
            elif time.time() - last_move > STALL_SECONDS:
                raise _DesignError(f"{os.path.basename(argv[1])} made no progress for {STALL_SECONDS // 60} min and was "
                                   f"stopped to protect your GPU credit:\n{_tail_text(log_path)}")
            time.sleep(0.5)
        on_tick()
    except BaseException:
        _kill(proc)
        raise
    if proc.returncode != 0:
        raise _DesignError(f"{os.path.basename(argv[1])} exited with code {proc.returncode}:\n{_tail_text(log_path)}")


def _prepare_runtime():
    """Wire the Volume weights into the paths RFdiffusion / ColabDesign expect (idempotent)."""
    os.chdir("/root")
    for d in ("params", "schedules", "rfdiffusion_models"):
        os.makedirs(f"{WEIGHTS}/{d}", exist_ok=True)
    for link, target in [
        ("/root/params", f"{WEIGHTS}/params"),
        # RFdiffusion computes + caches its IGSO3 schedules at RFdiffusion/schedules
        # (model_runners.py: cache_dir=f"{SCRIPT_DIR}/../schedules") -> keep them on the Volume.
        ("/root/RFdiffusion/schedules", f"{WEIGHTS}/schedules"),
        ("/root/RFdiffusion/models", f"{WEIGHTS}/rfdiffusion_models"),
    ]:
        if os.path.islink(link):
            os.remove(link)
        elif os.path.isdir(link):
            shutil.rmtree(link)
        elif os.path.exists(link):
            os.remove(link)
        os.symlink(target, link)
    for path in ("/root", "/root/RFdiffusion"):
        if path not in sys.path:
            sys.path.append(path)
    os.environ["DGLBACKEND"] = "pytorch"


def _import_design_deps():
    from inference.utils import parse_pdb
    from colabdesign.rf.utils import fix_contigs, fix_partial_contigs, fix_pdb, get_Ls
    from colabdesign.shared.protein import pdb_to_string
    return parse_pdb, fix_contigs, fix_partial_contigs, fix_pdb, get_Ls, pdb_to_string


def _http_get(url: str, timeout: int = 30, tries: int = 3) -> bytes:
    """GET with a short back-off for flaky upstreams (RCSB / AlphaFold DB). Client errors (404...) are final."""
    req = urllib.request.Request(url, headers={"User-Agent": "biogen-ai/3.1"})
    err = None
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code < 500 and e.code != 429:
                raise
            err = e
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            err = e
        if attempt + 1 < tries:
            time.sleep(1.5 * (attempt + 1))
    raise err


def fetch_target_text(p: dict) -> str:
    """Target structure text: the uploaded file wins, else RCSB assembly 1 (like the notebook, falling back to the
    plain entry when it has no assembly file), else the AlphaFold DB model."""
    if p["pdb_content"].strip():
        return p["pdb_content"]
    code = p["pdb"]
    try:
        if _PDB_CODE_RE.match(code):
            try:
                data = gzip.decompress(_http_get(f"https://files.rcsb.org/download/{code.upper()}.pdb1.gz"))
            except urllib.error.HTTPError as e:
                if e.code != 404:
                    raise
                data = _http_get(f"https://files.rcsb.org/download/{code.upper()}.pdb")
        else:
            meta = json.loads(_http_get(f"https://alphafold.ebi.ac.uk/api/prediction/{code}"))
            url = meta[0]["pdbUrl"]
            if not url.startswith("https://alphafold.ebi.ac.uk/"):
                raise ValueError("unexpected AlphaFold DB file URL")
            data = _http_get(url)
    except Exception as e:
        raise RuntimeError(f"Could not download target '{code}': {e}")
    return data.decode("utf-8", "replace")


def _resolve_target(p: dict, run_dir: str) -> str:
    """Write the target structure into the run directory."""
    path = f"{run_dir}/target.pdb"
    with open(path, "w") as f:
        f.write(fetch_target_text(p))      # run_job normally hands the text over already, so this rarely downloads
    return path


def _design_pipeline(job_id: str, k: int, p: dict, run_dir: str, prog: _Progress) -> dict:
    parse_pdb, fix_contigs, fix_partial_contigs, fix_pdb, get_Ls, pdb_to_string = _import_design_deps()
    t_start, timings = time.time(), {}
    mode = p["mode"]
    validate = p["validate"]
    prog.set("preparing", 2, "Preparing inputs", force=True)

    contigs = p["contigs"].replace(",", " ").replace(":", " ").split()
    sym, copies = None, 1
    if p["symmetry"] == "cyclic":
        sym, copies = f"c{p['order']}", p["order"]
    elif p["symmetry"] == "dihedral":
        sym, copies = f"d{p['order']}", 2 * p["order"]

    input_pdb = None
    if mode in ("partial", "fixed"):
        target = _resolve_target(p, run_dir)
        pdb_str = pdb_to_string(target, chains=p["chains"] or None)
        if mode == "fixed":
            pdb_str = pdb_to_string(pdb_str, chains=p["fixed_chains"])
        input_pdb = f"{run_dir}/input.pdb"
        with open(input_pdb, "w") as f:
            f.write(pdb_str)
        parsed = parse_pdb(input_pdb)
        if p["hotspot"]:
            have = {f"{c}{i}" for c, i in parsed["pdb_idx"]}
            missing = [x for x in p["hotspot"].split(",") if x not in have]
            if missing:
                raise _DesignError(f"Hotspot residue(s) {', '.join(missing)} do not exist in the target structure "
                                   f"(check the chain letter and residue numbers of {p['pdb'] or 'the uploaded file'})")
        contigs = fix_partial_contigs(contigs, parsed) if mode == "partial" else fix_contigs(contigs, parsed)
    else:
        contigs = fix_contigs(contigs, None)
    if sym is not None:
        contigs = sum([contigs] * copies, [])

    total_len = sum(get_Ls(contigs))
    if total_len > MAX_RESIDUES:
        hint = (" Contigs has no free length, so this is partial diffusion, which keeps EVERY chain of the target: "
                "limit it with 'Input chains', or for a binder add a length to Contigs (e.g. E6-155:70-100)."
                if mode == "partial" else "")
        raise _DesignError(f"Design has {total_len} residues; the {GPU} GPU backend allows at most {MAX_RESIDUES}.{hint}")

    steps = p["total_steps"]
    dump_dir = f"/dev/shm/biogen_{job_id}_{k}"
    shutil.rmtree(dump_dir, ignore_errors=True)
    os.makedirs(dump_dir, exist_ok=True)
    os.makedirs(f"{run_dir}/traj", exist_ok=True)
    ckpt = f"{WEIGHTS}/rfdiffusion_models/Complex_beta_ckpt.pt"
    if p["use_beta_model"] and not os.path.isfile(ckpt):
        raise _DesignError("Complex_beta_ckpt.pt is not on the weights Volume - run download_weights again")

    # ---- Stage 1: RFdiffusion backbone --------------------------------------------------
    d_hi = 45.0 if validate else 96.0

    def steps_done() -> int:
        try:
            done = max((int(n[:-4]) + 1 for n in os.listdir(dump_dir) if n.endswith(".pdb") and n[:-4].isdigit()),
                       default=0)
        except FileNotFoundError:
            done = 0
        return min(done, steps)

    def diffusion_tick():
        done = steps_done()
        prog.set("diffusion", 3 + (d_hi - 3) * done / steps,
                 f"RFdiffusion denoising step {done}/{steps}", done, steps)

    argv = [sys.executable, "/root/RFdiffusion/run_inference.py"] + build_rfdiffusion_args(
        p, contigs=contigs, run_dir=run_dir, dump_dir=dump_dir, design_idx=k, steps=steps,
        input_pdb=input_pdb, sym=sym, copies=copies, rfdiffusion_dir="/root/RFdiffusion")
    prog.set("diffusion", 3, "Starting RFdiffusion", 0, steps, force=True)
    print(f"[design {k}] mode={mode} contigs={' '.join(contigs)} T={steps}", flush=True)
    timings["setup"] = round(time.time() - t_start, 1)
    t_diff = time.time()
    _run_monitored(argv, log_path=f"{run_dir}/rfdiffusion.log", on_tick=diffusion_tick, prog=prog, steady=steps_done)
    timings["diffusion"] = round(time.time() - t_diff, 1)
    shutil.rmtree(dump_dir, ignore_errors=True)

    backbone_path = f"{run_dir}/design_{k}.pdb"
    if not os.path.isfile(backbone_path):
        raise _DesignError("RFdiffusion finished without writing a backbone:\n" + _tail_text(f"{run_dir}/rfdiffusion.log"))
    traj_path = f"{run_dir}/traj/design_{k}_pX0_traj.pdb"
    for path in (backbone_path, traj_path):                      # relabel chains / residue numbers
        if os.path.isfile(path):
            with open(path) as f:
                fixed = fix_pdb(f.read(), contigs)
            with open(path, "w") as f:
                f.write(fixed)
    with open(backbone_path) as f:
        backbone_text = f.read()

    result = {"ok": True, "index": k, "length": total_len, "validated": False, "files": {}, "metrics": None,
              "sequence": None, "sequences": [], "contigs": contigs}
    out_dir = f"{RESULTS}/{job_id}"
    os.makedirs(out_dir, exist_ok=True)

    def put(kind: str, text: str) -> str:
        name = f"d{k}_{kind}"
        with open(f"{out_dir}/{name}", "w") as f:
            f.write(text)
        result["files"][kind] = name
        return name

    put("backbone.pdb", backbone_text)
    if os.path.isfile(traj_path):
        with open(traj_path) as f:
            put("trajectory.pdb", thin_trajectory(f.read()))

    # ---- Stages 2+3: ProteinMPNN sequences, AlphaFold2 validation -----------------------
    if validate:
        af_dir = f"{run_dir}/af2"
        os.makedirs(af_dir, exist_ok=True)
        af_argv = [sys.executable, "/root/colabdesign/rf/designability_test.py",
                   f"--pdb={backbone_path}", f"--loc={af_dir}", f"--contigs={':'.join(contigs)}",
                   f"--copies={copies}", f"--num_seqs={p['num_seqs']}", f"--num_recycles={p['num_recycles']}",
                   f"--rm_aa={p['rm_aa']}", f"--mpnn_sampling_temp={p['mpnn_sampling_temp']}", "--num_designs=1"]
        if p["initial_guess"]:
            af_argv.append("--initial_guess")
        if p["use_multimer"]:
            af_argv.append("--use_multimer")
        if p["use_soluble"]:
            af_argv.append("--use_soluble")
        log_path = f"{run_dir}/af2.log"
        t_af0 = time.time()
        tail, state = _LogTail(log_path), {"phase": "mpnn", "done": 0, "t_af": None, "t_first": None}
        prog.set("mpnn", 46, "ProteinMPNN: designing sequences", force=True)

        def af_tick():
            for line in tail.new_lines():
                if line.startswith("running AlphaFold"):
                    state["phase"], state["t_af"] = "af2", time.time()
                elif line.startswith("design:"):
                    state["done"] += 1
                    state["t_first"] = state["t_first"] or time.time()
            if state["phase"] == "mpnn":
                prog.set("mpnn", 47, "ProteinMPNN: designing sequences")
            else:
                n = p["num_seqs"]
                prog.set("af2", 50 + 46 * min(state["done"], n) / n,
                         f"AlphaFold2 validating sequence {min(state['done'] + 1, n)}/{n}", state["done"], n)

        _run_monitored(af_argv, log_path=log_path, on_tick=af_tick, prog=prog)
        t_end = time.time()
        if state["t_af"]:
            timings["mpnn"] = round(state["t_af"] - t_af0, 1)            # process start + model load + MPNN sampling
            timings["af2"] = round(t_end - state["t_af"], 1)
            if state["t_first"] and state["done"] > 1:
                timings["af2_first"] = round(state["t_first"] - state["t_af"], 1)    # includes the JIT compile
                timings["af2_each"] = round((t_end - state["t_first"]) / (state["done"] - 1), 1)

        csv_path = f"{af_dir}/mpnn_results.csv"
        if not os.path.isfile(csv_path):
            raise _DesignError("AlphaFold validation produced no scores:\n" + _tail_text(log_path))
        with open(csv_path) as f:
            rows = parse_scores_csv(f.read())
        if not rows:
            raise _DesignError("AlphaFold validation produced an empty score table")
        best = pick_best_sequence(rows, p["protocol"])

        pred_path = f"{af_dir}/all_pdb/design0_n{best['n']}.pdb"
        if not os.path.isfile(pred_path):
            pred_path = f"{af_dir}/best_design0.pdb"
        with open(pred_path) as f:
            pred_text = normalize_bfactors(f.read())
        pred_text, align_rmsd = align_pdb(pred_text, backbone_text)

        put("prediction.pdb", pred_text)
        put("scores.csv", scores_csv_text(rows, p["protocol"]))
        put("sequences.fasta", fasta_text(rows, p["protocol"], p["name"], k))
        result.update(
            validated=True,
            passed=is_pass(best, p["protocol"]),
            metrics={m: best.get(m) for m in ("plddt", "rmsd", "ptm", "pae", "i_ptm", "i_pae", "mpnn")},
            sequence=best["seq"],
            sequences=[{**{m: r.get(m) for m in ("n", "plddt", "rmsd", "ptm", "pae", "i_ptm", "i_pae", "mpnn")},
                        "passed": is_pass(r, p["protocol"]), "seq": r["seq"]} for r in rows],
        )
        result["metrics"]["n"] = best["n"]
        result["align_rmsd"] = align_rmsd

    results_volume.commit()
    prog.set("done", 100, "Done", force=True)
    result["timings"] = timings
    return result


@app.function(
    image=gpu_image,
    gpu=GPU,
    volumes={WEIGHTS: weights_volume, RESULTS: results_volume},
    timeout=60 * 60,
    max_containers=MAX_PARALLEL_DESIGNS,   # also the global cap on concurrent GPUs -> credit guard
    scaledown_window=30,                   # idle GPUs are billed: release quickly (queued designs still reuse a warm one)
)
def run_design(job_id: str, design_idx: int, params: dict) -> dict:
    t0 = time.time()
    queue_s = round(t0 - params["_spawned_at"], 1) if params.get("_spawned_at") else None   # GPU wait + container boot
    prog = _Progress(job_id, design_idx)
    run_dir = f"/tmp/biogen/{job_id}/d{design_idx}"
    try:
        _prepare_runtime()
        shutil.rmtree(run_dir, ignore_errors=True)
        os.makedirs(run_dir, exist_ok=True)
        out = _design_pipeline(job_id, design_idx, params, run_dir, prog)
        out["elapsed"] = round(time.time() - t0, 1)
        out["timings"] = {**out.get("timings", {}), "queue": queue_s}
        return out
    except _Cancelled:
        prog.set("cancelled", 0, "Cancelled", force=True)
        return {"ok": False, "index": design_idx, "cancelled": True, "error": "Cancelled"}
    except Exception as e:  # noqa: BLE001 - report every failure to the orchestrator
        msg = str(e)[:1200]
        print(f"[design {design_idx}] FAILED: {msg}", flush=True)
        prog.set("failed", 0, msg[:200], force=True)
        return {"ok": False, "index": design_idx, "error": msg}
    finally:
        shutil.rmtree(run_dir, ignore_errors=True)
        shutil.rmtree(f"/dev/shm/biogen_{job_id}_{design_idx}", ignore_errors=True)


# ===========================================================================
# CPU orchestrator: one per job
# ===========================================================================
def _log(rec: dict, msg: str):
    rec["recent_logs"] = (rec["recent_logs"] + [f"[{time.strftime('%H:%M:%S')}] {msg}"])[-10:]


@app.function(image=web_image, volumes={RESULTS: results_volume}, timeout=4 * 60 * 60, max_containers=20)
def run_job(job_id: str, params: dict):
    key = f"job:{job_id}"
    rec = jobs_dict.get(key)
    if rec is None:
        return
    n = params["num_designs"]
    rec.update(status="preparing", status_message="Launching GPU workers...")
    _log(rec, f"Job started: {params['name']} | contigs='{params['contigs']}' | {n} design(s) in parallel | "
              f"T={params['total_steps']} | validate={params['validate']}")
    jobs_dict[key] = rec

    calls, results, last_write = {}, {}, 0.0
    try:
        if params["mode"] in ("partial", "fixed"):
            # Download the target once and check the request against it before any GPU is started: a wrong chain,
            # hotspot or oversize design fails here in seconds instead of after N cold GPU boots.
            target = fetch_target_text(params)
            total = preflight_target(params, scan_target(target), MAX_RESIDUES)
            params = {**params, "pdb_content": target}
            _log(rec, f"Target checked: design will have {total} residues")
            jobs_dict[key] = rec
        calls = {k: run_design.spawn(job_id, k, {**params, "_spawned_at": time.time()}) for k in range(n)}
        while len(results) < n:
            if jobs_dict.contains(f"cancel:{job_id}"):
                for c in calls.values():
                    c.cancel()
                rec.update(status="cancelled", status_message="Cancelled by user", updated_at=time.time())
                _log(rec, "Job cancelled")
                jobs_dict[key] = rec
                return
            for k, call in calls.items():
                if k in results:
                    continue
                try:
                    results[k] = call.get(timeout=0)
                except TimeoutError:
                    continue
                except Exception as e:  # worker crashed / was OOM-killed
                    results[k] = {"ok": False, "index": k, "error": f"Worker crashed: {str(e)[:300]}"}
                r = results[k]
                _log(rec, f"Design {k + 1}/{n} " + ("finished" if r["ok"] else f"FAILED: {r['error'][:120]}"))

            now = time.time()
            if now - last_write >= 1.5:
                last_write = now
                per = []
                for k in range(n):
                    if k in results:
                        r = results[k]
                        per.append({"index": k, "phase": "done" if r["ok"] else "failed",
                                    "pct": 100.0 if r["ok"] else 0.0,
                                    "msg": "Done" if r["ok"] else r["error"][:200], "step": 0, "total": 0})
                    else:
                        pr = jobs_dict.get(f"prog:{job_id}:{k}") or {"phase": "queued", "pct": 0.0,
                                                                     "msg": "Waiting for a GPU", "step": 0, "total": 0}
                        per.append({"index": k, **{x: pr[x] for x in ("phase", "pct", "msg", "step", "total")}})
                active = [d for d in per if d["phase"] not in ("done", "failed", "queued")]
                head = active[0] if active else per[0]
                counts = {}
                for d in per:
                    counts[d["phase"]] = counts.get(d["phase"], 0) + 1
                summary = ", ".join(f"{v} {ph}" for ph, v in counts.items())
                rec.update(
                    status="running",
                    progress_pct=round(min(98.0, sum(d["pct"] for d in per) / n), 1),
                    current_design=len(results), designs_progress=per,
                    current_step=head["step"], total_steps=head["total"] or params["total_steps"],
                    status_message=f"{len(results)}/{n} designs done ({summary})" if n > 1 else head["msg"],
                    updated_at=now,
                )
                jobs_dict[key] = rec
            time.sleep(1.0)

        # ---- package ----------------------------------------------------------------
        rec.update(status="packaging", status_message="Ranking and packaging results...", updated_at=time.time())
        jobs_dict[key] = rec
        results_volume.reload()
        ok = [r for r in results.values() if r["ok"]]
        if not ok:
            first = next(iter(results.values()))
            raise RuntimeError(first.get("error", "All designs failed"))

        designs = []
        for r in ok:
            f = r["files"]
            designs.append({
                "index": r["index"], "label": f"Design {r['index'] + 1}", "length": r["length"],
                "backbone_file": f.get("backbone.pdb"), "prediction_file": f.get("prediction.pdb"),
                "trajectory_file": f.get("trajectory.pdb"), "sequences_file": f.get("sequences.fasta"),
                "scores_file": f.get("scores.csv"), "validated": r["validated"], "passed": r.get("passed"),
                "metrics": r["metrics"], "sequence": r["sequence"], "sequences": r["sequences"],
                "elapsed": r.get("elapsed"), "timings": r.get("timings"),
            })
        designs = rank_designs(designs, params["protocol"])

        out_dir = f"{RESULTS}/{job_id}"
        summary = {"job_id": job_id, "name": params["name"], "params": public_params(params), "designs": designs}
        with open(f"{out_dir}/summary.json", "w") as fh:
            json.dump(summary, fh)
        zip_name = f"{params['name']}.result.zip"
        with zipfile.ZipFile(f"{out_dir}/{zip_name}", "w", zipfile.ZIP_DEFLATED) as zf:
            for fn in sorted(os.listdir(out_dir)):
                if fn != zip_name:
                    zf.write(f"{out_dir}/{fn}", arcname=f"results/{fn}")
        results_volume.commit()

        failed = [r for r in results.values() if not r["ok"]]
        warnings = [f"Design {r['index'] + 1} failed: {r['error'][:200]}" for r in failed]
        files = [d["prediction_file"] or d["backbone_file"] for d in designs]
        passed = sum(1 for d in designs if d.get("passed"))
        rec.update(
            status="completed", progress_pct=100.0, current_design=n, designs=designs, warnings=warnings,
            output_files=files, generated_pdb_urls=[f"{API_PREFIX}/jobs/{job_id}/results/{x}" for x in files],
            has_results_zip=True, zip_name=zip_name, updated_at=time.time(),
            status_message=("Completed" + (f" - {passed}/{len(designs)} designs pass in-silico validation"
                                           if params["validate"] else "")),
        )
        _log(rec, f"Pipeline finished: {len(designs)} design(s) ready" + (f", {len(failed)} failed" if failed else ""))
    except Exception as e:  # noqa: BLE001
        rec.update(status="failed", status_message="Failed", error_message=str(e)[:800], updated_at=time.time())
        _log(rec, f"ERROR: {str(e)[:200]}")
    finally:
        jobs_dict[key] = rec
        index_dict[job_id] = job_brief(rec)
        try:
            active_dict.pop(job_id)
        except KeyError:
            pass
        for k in range(n):
            try:
                jobs_dict.pop(f"prog:{job_id}:{k}")
            except KeyError:
                pass


# ===========================================================================
# API gateway (CPU): what the frontend talks to
# ===========================================================================
@app.function(
    image=web_image,
    secrets=[modal.Secret.from_name("biogen-secrets")],
    volumes={RESULTS: results_volume},
    scaledown_window=300,
    min_containers=0,
)
@modal.concurrent(max_inputs=64)
@modal.asgi_app()
def api():
    from fastapi import Body, Depends, FastAPI, Header, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.middleware.gzip import GZipMiddleware
    from fastapi.responses import FileResponse

    web = FastAPI(title="BioGen AI RFdiffusion API", version=VERSION)
    web.add_middleware(GZipMiddleware, minimum_size=1024)
    web.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
                       expose_headers=["*"])

    def require_auth(authorization: str = Header(default=""), x_api_key: str = Header(default="")):
        """A valid session token (the web app), or BIOGEN_API_KEY (scripts / CI) when one is configured."""
        challenge = {"WWW-Authenticate": "Bearer"}
        cfg = auth_config()
        scheme, _, token = authorization.partition(" ")
        if cfg and scheme.lower() == "bearer" and token:
            claims = decode_token(token.strip(), cfg["secret"])
            if claims and hmac.compare_digest(str(claims["sub"]).encode(), cfg["email"].encode()):
                return claims
            raise HTTPException(401, "Your session has expired. Sign in again.", headers=challenge)
        api_key = os.environ.get("BIOGEN_API_KEY", "")
        if api_key and x_api_key and hmac.compare_digest(x_api_key.encode(), api_key.encode()):
            return {"sub": "api-key"}
        raise HTTPException(401, "Sign in to continue.", headers=challenge)

    auth = [Depends(require_auth)]

    def client_ip(request) -> str:
        return pick_client_ip(request.headers.get("x-forwarded-for", ""), request.client.host if request.client else "")

    @web.post(f"{API_PREFIX}/auth/login")
    def login(request: Request, body: dict = Body(...)):
        cfg = auth_config()
        if cfg is None:
            raise HTTPException(503, "Sign-in is not configured on the server (AUTH_EMAIL, AUTH_PASSWORD, JWT_SECRET).")
        email, password = body.get("email"), body.get("password")
        if not isinstance(email, str) or not isinstance(password, str) or len(email) > 254 or len(password) > 256:
            raise HTTPException(422, "Enter your email and password.")
        key = f"authfail:{client_ip(request)}"
        failures = jobs_dict.get(key) or []
        wait = login_retry_after(failures)
        if wait:
            raise HTTPException(429, f"Too many failed attempts. Try again in {max(1, round(wait / 60))} min.",
                                headers={"Retry-After": str(wait)})
        if not check_credentials(cfg, email, password):
            now = time.time()
            jobs_dict[key] = [t for t in failures if now - t < LOGIN_WINDOW_S] + [now]
            time.sleep(0.5)                       # slows down guessing
            raise HTTPException(401, "Incorrect email or password.")
        if failures:
            jobs_dict.pop(key)
        token, ttl = issue_token(cfg)
        return {"access_token": token, "token_type": "bearer", "expires_in": ttl, "email": cfg["email"]}

    @web.get(f"{API_PREFIX}/auth/me")
    def me(claims: dict = Depends(require_auth)):
        return {"email": claims["sub"], "expires_at": claims.get("exp")}

    def get_rec(job_id: str) -> dict:
        if not _JOB_ID_RE.match(job_id):
            raise HTTPException(404, "Job not found")
        rec = jobs_dict.get(f"job:{job_id}")
        if rec is None:
            raise HTTPException(404, "Job not found")
        rec = settle_stale(rec)
        if rec["status"] in ACTIVE_STATES:
            rec = {**rec, "runtime_seconds": time.time() - rec["created_at"]}
        return rec

    def active_recs() -> list:
        """Jobs that are really running right now (a few keys, so cheap enough for /health and the spend guard).
        Entries whose orchestrator died are dropped from the index instead of blocking new jobs forever."""
        live = []
        for jid in list(active_dict.keys()):
            r = jobs_dict.get(f"job:{jid}")
            if r is None or r["status"] not in ACTIVE_STATES or settle_stale(r)["status"] != r["status"]:
                try:
                    active_dict.pop(jid)
                except KeyError:
                    pass
                continue
            live.append(r)
        return live

    @web.get("/")
    def root():
        return {"status": "ok", "message": "BioGen AI RFdiffusion API", "version": VERSION}

    @web.get(f"{API_PREFIX}/health")
    def health():
        ready = bool(jobs_dict.get("meta:weights_ready"))
        active = len(active_recs())
        return {
            "status": "ok", "gpu_name": f"Modal {GPU}", "gpu_available": True, "cuda_available": True,
            "gpu_memory_total_mb": 0.0, "gpu_memory_free_mb": 0.0,
            "rfdiffusion_ready": ready, "models_ready": ready, "version": VERSION, "active_jobs": active,
            "message": (f"Ready - serverless {GPU} GPUs on Modal (up to {MAX_PARALLEL_DESIGNS} in parallel)"
                        if ready else "Model weights not downloaded yet: run download_weights"),
        }

    @web.post(f"{API_PREFIX}/jobs", status_code=201, dependencies=auth)
    def submit_job(body: dict = Body(...)):
        try:
            params = validate_params(body)
        except ValueError as e:
            raise HTTPException(422, str(e))
        if not jobs_dict.get("meta:weights_ready"):
            raise HTTPException(503, "Model weights are not on the Volume yet - run download_weights first")
        if len(active_recs()) >= MAX_ACTIVE_JOBS:
            raise HTTPException(429, f"Too many running jobs (limit {MAX_ACTIVE_JOBS}). Wait for one to finish.")
        job_id, now = uuid.uuid4().hex, time.time()
        rec = {
            "job_id": job_id, "name": params["name"], "status": "queued", "progress_pct": 0.0,
            "current_design": 0, "total_designs": params["num_designs"], "current_step": 0,
            "total_steps": params["total_steps"], "status_message": "Queued", "error_message": None,
            "created_at": now, "updated_at": now, "runtime_seconds": 0.0, "output_files": [],
            "generated_pdb_urls": [], "has_results_zip": False, "recent_logs": [], "designs": [],
            "designs_progress": [], "warnings": [], "validated": params["validate"],
            "protocol": params["protocol"], "params": public_params(params),
        }
        jobs_dict[f"job:{job_id}"] = rec
        index_dict[job_id] = job_brief(rec)
        active_dict[job_id] = now
        run_job.spawn(job_id, params)
        return {"job_id": job_id, "status": "queued"}

    @web.get(f"{API_PREFIX}/jobs", dependencies=auth)
    def list_jobs(limit: int = 30):
        now = time.time()
        newest = sorted(index_dict.values(), key=lambda b: b["created_at"], reverse=True)[: max(1, min(limit, 60))]
        out = []
        for b in newest:
            if b["status"] in ACTIVE_STATES:          # the index only changes at the ends of a job: refresh live ones
                fresh = jobs_dict.get(f"job:{b['job_id']}")
                b = job_brief(settle_stale(fresh, now)) if fresh else b
            out.append(b)
        return out

    @web.get(f"{API_PREFIX}/jobs/{{job_id}}", dependencies=auth)
    def get_job(job_id: str):
        return get_rec(job_id)

    @web.post(f"{API_PREFIX}/jobs/{{job_id}}/cancel", dependencies=auth)
    def cancel_job(job_id: str):
        rec = get_rec(job_id)
        if rec["status"] in ACTIVE_STATES:
            jobs_dict[f"cancel:{job_id}"] = True     # orchestrator + workers poll this flag
        return {"job_id": job_id, "status": "cancelling" if rec["status"] in ACTIVE_STATES else rec["status"]}

    def serve(job_id: str, filename: str, download_name=None):
        get_rec(job_id)
        if not _FILENAME_RE.match(filename):
            raise HTTPException(404, "Result file not found")
        path = f"{RESULTS}/{job_id}/{filename}"
        if not os.path.isfile(path):
            results_volume.reload()                  # pick up files committed by other containers
            if not os.path.isfile(path):
                raise HTTPException(404, "Result file not found")
        media = ("chemical/x-pdb" if filename.endswith(".pdb") else
                 "application/zip" if filename.endswith(".zip") else "text/plain")
        # a finished job's files never change, so let the browser keep them (re-opening a result is then instant)
        return FileResponse(path, media_type=media, filename=download_name,
                            headers={"Cache-Control": "private, max-age=3600"})

    @web.get(f"{API_PREFIX}/jobs/{{job_id}}/results/{{filename}}", dependencies=auth)
    def get_result(job_id: str, filename: str):
        return serve(job_id, filename)

    @web.get(f"{API_PREFIX}/jobs/{{job_id}}/results_zip", dependencies=auth)
    def get_results_zip(job_id: str):
        rec = get_rec(job_id)
        if not rec.get("has_results_zip"):
            raise HTTPException(404, "Results zip not available")
        return serve(job_id, rec["zip_name"], download_name=rec["zip_name"])

    @web.post(f"{API_PREFIX}/pdb/fetch", dependencies=auth)
    def fetch_pdb(body: dict = Body(...)):
        pdb_id = re.sub(r"[^A-Za-z0-9]", "", str(body.get("pdb_id", ""))).upper()
        if not _PDB_CODE_RE.match(pdb_id):
            raise HTTPException(422, "A 4-character PDB ID is required")
        try:
            content = _http_get(f"https://files.rcsb.org/download/{pdb_id}.pdb", timeout=20).decode("utf-8", "replace")
        except Exception:
            raise HTTPException(404, f"PDB entry '{pdb_id}' not found on RCSB")
        chains, residues, title = [], set(), ""
        for line in content.splitlines():
            if line.startswith("TITLE "):
                title += " " + line[10:].strip()
            if line.startswith("ATOM  ") and line[21:22].strip():
                if line[21] not in chains:
                    chains.append(line[21])
                residues.add((line[21], line[22:27]))
        return {"pdb_id": pdb_id, "title": title.strip() or f"Structure {pdb_id}", "chains": chains,
                "num_residues": len(residues), "source": "RCSB", "pdb_content": content}

    return web


# ===========================================================================
# One-time / maintenance entrypoints
# ===========================================================================
@app.function(image=download_image, volumes={WEIGHTS: weights_volume}, timeout=60 * 60)
def download_weights(force: bool = False):
    """modal run compute/modal/biogen_modal_app.py::download_weights   (~5 GB, once)"""
    for d in ("params", "schedules", "rfdiffusion_models"):
        os.makedirs(f"{WEIGHTS}/{d}", exist_ok=True)

    def sh(cmd: list):
        print("+", " ".join(cmd), flush=True)
        subprocess.run(cmd, check=True)

    def aria2_get(url: str, dest: str):
        # aria2c's -o is a filename resolved under -d; verify the file really landed.
        sh(["aria2c", "-x", "16", "-s", "16", "-d", os.path.dirname(dest), "-o", os.path.basename(dest),
            "--max-tries=5", "--retry-wait=5", "--continue=true", "--allow-overwrite=true", url])
        if not os.path.isfile(dest):
            raise RuntimeError(f"aria2c reported success but {dest} is missing (url: {url})")

    for url, name in [(BASE_CKPT_URL, "Base_ckpt.pt"), (COMPLEX_CKPT_URL, "Complex_base_ckpt.pt"),
                      (COMPLEX_BETA_CKPT_URL, "Complex_beta_ckpt.pt")]:
        dst = f"{WEIGHTS}/rfdiffusion_models/{name}"
        if force or not os.path.isfile(dst):
            aria2_get(url, dst)

    if force or not os.path.isfile(f"{WEIGHTS}/params/done.txt"):
        tar_path = f"{WEIGHTS}/af_params.tar"
        aria2_get(AF_PARAMS_URL, tar_path)
        sh(["tar", "-xf", tar_path, "-C", f"{WEIGHTS}/params"])
        os.remove(tar_path)
        open(f"{WEIGHTS}/params/done.txt", "w").close()

    weights_volume.commit()
    jobs_dict["meta:weights_ready"] = True
    print("weights ready:", sorted(os.listdir(WEIGHTS)), sorted(os.listdir(f"{WEIGHTS}/rfdiffusion_models")), flush=True)


@app.function(image=gpu_image, gpu=GPU, volumes={WEIGHTS: weights_volume}, timeout=1200)
def selftest(af: bool = True):
    """modal run compute/modal/biogen_modal_app.py::selftest
    Imports torch/jax/RFdiffusion/ColabDesign on a GPU, then (af=True) runs the real ProteinMPNN + AlphaFold2
    stage on ubiquitin so jax / ColabDesign incompatibilities show up here instead of mid-job."""
    _prepare_runtime()
    import torch
    print("torch", torch.__version__, "cuda?", torch.cuda.is_available(),
          torch.cuda.get_device_name(0) if torch.cuda.is_available() else "-")
    import jax
    print("jax", jax.__version__, "devices:", jax.devices())
    _import_design_deps()
    print("RFdiffusion + ColabDesign import OK")
    print("RFdiffusion commit:", subprocess.run(["git", "-C", "/root/RFdiffusion", "rev-parse", "HEAD"],
                                                capture_output=True, text=True).stdout.strip())
    for p in ("params/done.txt", "RFdiffusion/models/Base_ckpt.pt", "RFdiffusion/models/Complex_base_ckpt.pt",
              "RFdiffusion/models/Complex_beta_ckpt.pt"):
        print(f"  {p}:", "OK" if os.path.exists(f"/root/{p}") else "MISSING (run download_weights)")
    if not af:
        return

    work = "/tmp/selftest"
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(work)
    ubq = _http_get("https://files.rcsb.org/download/1UBQ.pdb").decode()
    with open(f"{work}/1ubq.pdb", "w") as f:
        f.write("\n".join(l for l in ubq.splitlines() if l.startswith("ATOM") and l[21] == "A") + "\nTER\n")
    t0 = time.time()
    r = subprocess.run(
        [sys.executable, "/root/colabdesign/rf/designability_test.py", f"--pdb={work}/1ubq.pdb",
         f"--loc={work}/af", "--contigs=76-76", "--num_seqs=2", "--num_recycles=1", "--num_designs=1"],
        cwd="/root", capture_output=True, text=True)
    print((r.stdout + r.stderr)[-1800:])
    if r.returncode != 0:
        raise RuntimeError(f"ProteinMPNN/AlphaFold stage failed (exit {r.returncode})")
    with open(f"{work}/af/mpnn_results.csv") as f:
        rows = parse_scores_csv(f.read())
    print(f"AF2 stage OK in {time.time() - t0:.0f}s:",
          [(x["n"], round(x["plddt"], 1), round(x["rmsd"], 2)) for x in rows])


# ---------------------------------------------------------------------------
# GPU containers: import the heavy stacks at container start, never inside an input
# ---------------------------------------------------------------------------
# Cancelling a job interrupts the running input. If that lands in the middle of `import jax`, Python keeps a
# half-initialised `jax` in sys.modules and every later job that Modal routes to the same (reused) container fails
# with "partially initialized module 'jax' has no attribute 'version'". Imports done here run once while the container
# boots, which no input cancellation can interrupt. /root/RFdiffusion exists only in the GPU image.
if not modal.is_local() and os.path.isdir("/root/RFdiffusion"):
    _prepare_runtime()
    import torch  # noqa: F401,E402
    import jax  # noqa: F401,E402
    _import_design_deps()


@app.local_entrypoint()
def smoke(contigs: str = "80", iterations: int = 25, num_seqs: int = 2):
    """modal run compute/modal/biogen_modal_app.py::smoke - run ONE real design end to end (no API)."""
    params = validate_params({"name": "smoke", "contigs": contigs, "iterations": iterations,
                              "num_designs": 1, "num_seqs": num_seqs, "num_recycles": 1})
    job_id = uuid.uuid4().hex
    out = run_design.remote(job_id, 0, params)
    out.pop("sequences", None)
    print(json.dumps(out, indent=2))
    if not out["ok"]:
        raise SystemExit(1)


@app.local_entrypoint()
def bench(contigs: str = "100", designs: int = 4, iterations: int = 50, num_seqs: int = 8, num_recycles: int = 3,
          noise_scale: float = 1.0, mpnn_sampling_temp: float = 0.1, pdb: str = "", hotspot: str = "",
          initial_guess: str = "auto", use_beta_model: bool = False):
    """BIOGEN_GPU=L4 modal run compute/modal/biogen_modal_app.py::bench --designs 8 - time and score N designs
    in parallel on whichever GPU BIOGEN_GPU selects, without the API. Used for R&D (GPU choice, settings)."""
    params = validate_params({"name": "bench", "contigs": contigs, "iterations": iterations, "num_designs": designs,
                              "num_seqs": num_seqs, "num_recycles": num_recycles, "noise_scale": noise_scale,
                              "mpnn_sampling_temp": mpnn_sampling_temp, "pdb": pdb, "hotspot": hotspot,
                              "initial_guess": initial_guess, "use_beta_model": use_beta_model})
    if params["mode"] in ("partial", "fixed"):
        params["pdb_content"] = fetch_target_text(params)
        print("target ok, design residues:", preflight_target(params, scan_target(params["pdb_content"]), MAX_RESIDUES))
    job_id = uuid.uuid4().hex
    t0 = time.time()
    outs = list(run_design.starmap([(job_id, k, {**params, "_spawned_at": time.time()}) for k in range(designs)]))
    wall = time.time() - t0
    rows = []
    for o in sorted(outs, key=lambda o: o["index"]):
        m = o.get("metrics") or {}
        rows.append({"design": o["index"], "ok": o["ok"], "length": o.get("length"), "passed": o.get("passed"),
                     "plddt": m.get("plddt"), "rmsd": m.get("rmsd"), "i_pae": m.get("i_pae"),
                     "elapsed": o.get("elapsed"), "timings": o.get("timings"), "error": (o.get("error") or "")[:160],
                     "per_seq": [{"plddt": s["plddt"], "rmsd": s["rmsd"], "i_pae": s.get("i_pae"), "passed": s["passed"]}
                                 for s in o.get("sequences", [])]})
    print("BENCH_JSON " + json.dumps({"gpu": GPU, "wall": round(wall, 1), "params": public_params(params), "rows": rows}))
    ok = [r for r in rows if r["ok"]]
    print(f"{GPU}: wall {wall:.0f}s, {len(ok)}/{designs} ok, {sum(1 for r in ok if r['passed'])} passed")
