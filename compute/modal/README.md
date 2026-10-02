# BioGen AI — RFdiffusion backend on Modal

Serverless-GPU implementation of [`backend/diffusion.ipynb`](../../backend/diffusion.ipynb):
**RFdiffusion → ProteinMPNN → AlphaFold2**, behind the REST API the frontend
(`frontend/`) already speaks. Click *Generate* in the studio, Modal runs the
pipeline, the structures come back and are shown in 3D.

```
browser ──HTTPS──▶ api          CPU · scales to zero · /health answers in ~2 s
                    │ spawn
                    ▼
                  run_job       CPU orchestrator, one per job: fans out, polls,
                    │           ranks, packages. Survives closed browser tabs.
                    │ spawn × num_designs
                    ▼
                  run_design    GPU worker, ONE DESIGN PER CONTAINER, in parallel:
                                RFdiffusion → ProteinMPNN → AlphaFold2 validation
```

| State | Where | Notes |
|---|---|---|
| model weights (~5 GB) | `modal.Volume` `biogen-rfdiffusion-weights` | downloaded once; also caches RFdiffusion's noise schedules |
| job records + live progress | `modal.Dict` `biogen-jobs` | expires after ~7 days idle |
| PDB / FASTA / CSV / zip | `modal.Volume` `biogen-rfdiffusion-results` | kept until you delete them |

## Why this design

- **Fast.** Each design gets its own GPU, so a job with 8 designs takes about as long as one.
  Total GPU-seconds (and cost) are about the same as running them one after another.
- **Cheap.** Nothing runs between jobs. The gateway and orchestrator are tiny CPU
  containers; GPUs exist only while a design is running.
- **Robust.** Jobs live on Modal, not in a browser tab or a single container. Refresh the page,
  the studio picks the run back up (History lists earlier ones).
- **Accurate.** Every ProteinMPNN sequence is predicted by AlphaFold2 and scored; designs are
  ranked by the RFdiffusion paper's in-silico success criteria (see below), not returned unscored.
- **Safe.** Request fields are validated against strict allow-lists and subprocesses get argv
  lists, never shell strings. Every route needs a signed session token (one admin account, no sign-up;
  HS256 JWT, pinned algorithm, 12 h by default, constant-time credential check, lockout after repeated
  failures). An active-job limit and a GPU cap bound spend.

## Setup (once)

```bash
pip install modal && modal setup                   # log in

# sign-in settings live in a .env file (see .env.example), pushed to Modal as one secret:
cp .env.example .env            # then set AUTH_EMAIL, AUTH_PASSWORD, JWT_SECRET (openssl rand -hex 32)
pip install python-dotenv
modal secret create biogen-secrets --from-dotenv .env --force

modal run compute/modal/biogen_modal_app.py::download_weights   # ~5 GB, ~5–10 min, once
modal run compute/modal/biogen_modal_app.py::selftest           # torch/jax on a GPU + real MPNN→AF2 run
modal run compute/modal/biogen_modal_app.py::smoke              # one full design, no API involved
modal deploy compute/modal/biogen_modal_app.py
```

`modal deploy` prints the gateway URL, e.g. `https://<workspace>--biogen-rfdiffusion-api.modal.run`.
Put it in `frontend/.env`. The sign-in page always uses this address (it wins over any address saved in the browser):

```
VITE_BACKEND_URL=https://<workspace>--biogen-rfdiffusion-api.modal.run
```

Sign in with `AUTH_EMAIL` / `AUTH_PASSWORD` from your `.env`. To change either, edit `.env`, run the
`modal secret create … --force` line again and redeploy. Rotating `JWT_SECRET` signs everyone out.

Redeploying after code changes keeps the same URL. Logs: `modal app logs biogen-rfdiffusion`.

## Knobs (environment variables read at `modal deploy`)

| Variable | Default | Meaning |
|---|---|---|
| `BIOGEN_GPU` | `T4` | GPU for design workers: `T4`, `L4`, `A10G`, `L40S`, `A100`… |
| `BIOGEN_MAX_PARALLEL` | `8` | most GPUs the deployment may use at once (queued designs wait) |
| `BIOGEN_MAX_ACTIVE_JOBS` | `3` | queued + running jobs before the API answers 429 |
| `BIOGEN_MAX_RESIDUES` | `400` | per-design size limit, sized for a 16 GB T4 (raise it with a bigger GPU) |

Example: `BIOGEN_GPU=A10G BIOGEN_MAX_RESIDUES=600 modal deploy compute/modal/biogen_modal_app.py`.

## API

All routes are under `/api/v1`. Everything except `GET /`, `GET /health` and `POST /auth/login` needs
`Authorization: Bearer <token>`. Scripts can use `x-api-key: $BIOGEN_API_KEY` instead (delete that variable to switch it off).

| Route | |
|---|---|
| `POST /auth/login` | `{email, password}` → `{access_token, token_type, expires_in, email}`. 401 for wrong credentials, 429 after 5 failures in 10 min (locks that client for 5 min) |
| `GET /auth/me` | `{email, expires_at}` for the current token |
| `GET /health` | public: `{status, gpu_name, rfdiffusion_ready, message, …}` |
| `POST /jobs` | submit; returns `201 {job_id}`. 422 with a readable `detail` for bad input, 429 when busy |
| `GET /jobs` | recent jobs (no per-sequence tables) |
| `GET /jobs/{id}` | full record, see below |
| `POST /jobs/{id}/cancel` | stops the orchestrator and the GPU workers |
| `GET /jobs/{id}/results/{file}` | one result file (PDB, FASTA, CSV, JSON) |
| `GET /jobs/{id}/results_zip` | everything, zipped |
| `POST /pdb/fetch` | `{pdb_id}` → RCSB entry info + text |

**Request** (`POST /jobs`), all optional except what the contigs imply:

| Field | Default | |
|---|---|---|
| `name` | `biogen_design` | sanitised to `[A-Za-z0-9_-]` |
| `contigs` | `100` | RFdiffusion contig syntax: `100`, `A:50-70`, `40/A163-181/40`, `""` (partial diffusion) |
| `pdb` / `pdb_content` | | PDB ID or UniProt accession, or uploaded PDB text (≤ 5 MB); required for binder / motif / partial |
| `hotspot`, `chains` | | `E64,E88,E96`; `A,B` |
| `iterations` | `50` | diffusion steps `T` (15–300; RFdiffusion needs T ≥ 15). Partial diffusion denoises `int(80 · T / 200)` = 40 % of the schedule, like the notebook's auto value |
| `num_designs` | `1` | 1–32, one GPU each |
| `symmetry`, `order`, `add_potential` | `none`, `1`, `false` | `none` / `cyclic` / `dihedral` (`auto` is not offered: AnAnaS is no longer distributed) |
| `validate` | `true` | run ProteinMPNN + AlphaFold2 |
| `num_seqs` | `8` | sequences per design (multiples of 8 above 8) |
| `num_recycles` | `3` | AlphaFold recycles |
| `mpnn_sampling_temp`, `rm_aa` | `0.1`, `C` | |
| `initial_guess` | auto | `true` for binders, `false` otherwise (the strict test for monomers) |
| `use_multimer`, `use_beta_model`, `use_soluble` | `false` | AF-Multimer, the β-biased RFdiffusion checkpoint, SolubleMPNN |
| `noise_scale` | `1.0` | `0`–`1`; lower trades diversity for in-silico success |
| `preset` | `custom` | label only: `fast` / `balanced` / `accurate` |

**Job record** (`GET /jobs/{id}`): the fields the frontend has always used (`status`, `progress_pct`,
`status_message`, `output_files`, `has_results_zip`, …) plus

- `designs_progress[]` — per-design `{index, phase, pct, msg, step, total}` while running
- `designs[]` — when completed, best first: `{rank, label, length, passed, validated, metrics{plddt, rmsd, ptm, pae, i_pae, mpnn}, sequence, sequences[], backbone_file, prediction_file, trajectory_file, sequences_file, scores_file}`
- `warnings[]`, `protocol` (`unconditional` / `binder` / `motif` / `partial`), `params` (echo, no structure text)

`status` is one of `queued`, `preparing`, `running`, `packaging`, `completed`, `failed`, `cancelled`.

## What comes back

Per design `k` (0-based): `d{k}_backbone.pdb` (RFdiffusion), `d{k}_prediction.pdb` (best AF2 model, pLDDT in
the B-factor, **Kabsch-aligned onto the backbone** so the two overlay), `d{k}_trajectory.pdb` (≤ 40 denoising
frames, noise → final), `d{k}_sequences.fasta`, `d{k}_scores.csv`; plus `summary.json` and `<name>.result.zip`.

### How designs are ranked

A design **passes** when its best sequence has **pLDDT ≥ 80** and self-consistency **RMSD < 2 Å**, and for
binders an interface **PAE < 10 Å** (the RFdiffusion paper's in-silico success criteria). Passing designs come
first, then by RMSD (interface PAE for binders), then pLDDT. This is a strong filter, not a guarantee.

### Differences from the notebook, on purpose

- Each design samples its own length from a range (`50-70`); the notebook samples once and reuses it.
- Designs run in parallel on separate GPUs instead of sequentially.
- `initial_guess` defaults on only for binders.
- Predictions, trajectory and scores are returned and shown, not just printed.
- `symmetry='auto'` is dropped (its binary 404s upstream), SolubleMPNN and the β checkpoint are exposed.

## Pinned environment

`torch 2.4.1+cu124`, `jax[cuda12] 0.10.2`, RFdiffusion fork `sokrypton/RFdiffusion` (cloned at image build;
the validated commit is `597d37f`, printed by `selftest`), ColabDesign `e31a56f` (= tag v1.1.1 + SolubleMPNN).

ColabDesign still calls `jnp.clip(a_min=, a_max=)`, which current JAX removed
(`TypeError: clip() got an unexpected keyword argument 'a_max'` inside AlphaFold). The image build patches
those three call sites and fails if any remain. If a future bump breaks something else, `selftest` runs a real
MPNN → AlphaFold2 pass on ubiquitin so it shows up there, not mid-job.

## Measured (this deployment)

Every design returns a `timings` object (`queue`, `setup`, `diffusion`, `mpnn`, `af2`, `af2_first`, `af2_each`, seconds),
so slow stages are visible per design. `BIOGEN_GPU=L4 modal run compute/modal/biogen_modal_app.py::bench --designs 4`
times N designs on any GPU without the API; `bench` also takes `--pdb`, `--hotspot`, `--noise-scale`, `--num-seqs` and more.

**100 aa monomer, T = 50, 8 sequences, 3 recycles, mean of 4 designs**

| GPU | RFdiffusion | MPNN stage | AlphaFold2 | per design | $/design* |
|---|---|---|---|---|---|
| **T4** (default) | 52 s | 16 s | 30 s (1.9 s per extra sequence) | ~101 s | ~$0.017 |
| L4 | 59 s | 18 s | 29 s | ~107 s | |
| A10G | 43 s | 15 s | 25 s | ~85 s | ~$0.026 |
| L40S | 38 s | 14 s | 20 s | ~73 s | ~$0.040 |

\* GPU time only, at list prices of $0.59 / $1.10 / $1.95 per hour. Plus ~15-25 s of container start per worker.

**Binder, 5KQV (E6-155) + a 70-100 aa binder, hotspots E64,E88,E96, 4-8 designs**

| GPU | RFdiffusion | AlphaFold2 | per design | $/design* |
|---|---|---|---|---|
| T4 | 151 s | 122 s | ~305 s | ~$0.050 |
| L40S | 49 s | 38 s | ~105 s | ~$0.057 |

What this says:

- RFdiffusion is **not** GPU-bound at 100 aa: a GPU with 10x the FP32 throughput is only 1.4x faster, and reserving 4 or 8 CPU
  cores changed nothing. It is latency-bound, so the T4 is the cheapest per design for small proteins.
- Beyond ~150 residues the compute starts to matter: an L40S runs a binder ~3x faster than a T4 for about the same cost.
  Run it with `BIOGEN_GPU=L40S modal deploy ...` if you mostly design binders or large proteins.
- Most of the wall time is fixed: container start (~15-25 s), the JAX compile of the first AlphaFold prediction (~15 s),
  and ~1 s per diffusion step. More sequences are cheap (1.9 s each on a T4), more steps are not.
- Fan-out is the big lever: N designs take about as long as one, at the same total GPU cost.

**Binder success rate.** With hotspots, 1 of 8 designs passed pLDDT >= 80, RMSD < 2 A and iPAE < 10 A, both at noise scale 1.0 and 0
(3 of 64 sequences at noise 0 vs 1 of 64 at 1.0, which is within noise at this sample size). Plan on 8-16 designs per binder
target; the UI says so.

## Notes and limits

- First job after a long idle pays container boot + weight load (~1 min per GPU worker). The first job ever
  also builds RFdiffusion's noise-schedule cache onto the weights Volume.
- Results are not deleted automatically. Clear old ones with `modal volume rm biogen-rfdiffusion-results /<job_id> -r`.
- Binder design is much better with `hotspot` set (it also switches RFdiffusion to its complex checkpoint).
- `max_containers` on the worker caps total concurrent GPUs for the whole deployment. Your Modal plan may cap it lower.
- Change the account or rotate secrets any time: edit `.env`, `modal secret create biogen-secrets --from-dotenv .env --force`, redeploy.
- After `modal deploy`, containers that are still warm can serve the previous version for a few minutes
  (gateway: up to 5 min). If a fix does not seem to take effect, wait for them to drain.
- Job records expire from the `Dict` after ~7 days idle; the result files stay on the Volume until you remove them.
- The job list (`GET /jobs`) reads a small per-job index (`biogen-jobs-index`) instead of scanning every record, so it stays
  fast as history grows. A job whose orchestrator stops writing for 5 minutes is reported as failed rather than running forever
  (and stops counting against the active-job limit).
- The target structure is downloaded once by the orchestrator and checked (chains, residue ranges, hotspots, final size) before
  any GPU starts; a typo now fails in seconds instead of after N cold GPU boots. A stage that makes no progress for 15 minutes is
  stopped so a hang cannot burn credit for the full hour.
- Sign-in throttling keys on the **last** `X-Forwarded-For` entry (the one the platform proxy adds); earlier entries are
  caller-controlled and were being trusted before 3.1.0.

## Tests

```bash
pip install modal numpy
python -m unittest compute/modal/test_biogen_modal_app.py -v
```

Covers request validation (including injection attempts), contig mode detection, the Hydra argv, scoring and
ranking, Kabsch alignment, trajectory thinning, the target pre-flight checks, the job list helpers, the client-IP rule and auth. No GPU or network needed.
