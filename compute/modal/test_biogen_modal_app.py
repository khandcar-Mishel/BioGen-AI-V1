"""Unit tests for the pure (no GPU / no network) logic of biogen_modal_app.py.

    pip install modal numpy
    python -m unittest compute/modal/test_biogen_modal_app.py -v
"""
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import biogen_modal_app as m  # noqa: E402

PDB = (
    "ATOM      1  N   GLY A   1      11.104   6.134  -6.504  1.00  0.00           N\n"
    "ATOM      2  CA  GLY A   1      11.639   6.071  -5.147  1.00  0.00           C\n"
    "ATOM      3  C   GLY A   1      10.810   5.126  -4.337  1.00  0.00           C\n"
)


def ca_line(i, x, y, z, b=1.0):
    return f"ATOM  {i:5d}  CA  GLY A{i:4d}    {x:8.3f}{y:8.3f}{z:8.3f}  1.00{b:6.2f}           C"


class ContigTests(unittest.TestCase):
    def test_notebook_examples(self):
        cases = {
            "100": ("free", "unconditional"),
            "50:100": ("free", "unconditional"),
            "50-100": ("free", "unconditional"),
            "A:50": ("fixed", "binder"),
            "A:50-70": ("fixed", "binder"),
            "E6-155:70-100": ("fixed", "binder"),
            "A1-150/0 70-100": ("fixed", "binder"),
            "40/A163-181/40": ("fixed", "motif"),
            "A3-30/36/A33-68": ("fixed", "motif"),
            "": ("partial", "partial"),
            "A1-10": ("partial", "partial"),
            "A": ("partial", "partial"),
        }
        for contigs, (mode, protocol) in cases.items():
            info = m.analyze_contigs(contigs)
            self.assertEqual((info["mode"], info["protocol"]), (mode, protocol), contigs)

    def test_estimates(self):
        self.assertEqual(m.analyze_contigs("100")["est_len"], 100)
        self.assertEqual(m.analyze_contigs("E6-155:70-100")["est_len"], 150 + 100)
        self.assertEqual(m.analyze_contigs("40/A163-181/40")["est_len"], 40 + 19 + 40)

    def test_rejects_malformed(self):
        for bad in ("-5", "10-5", "A20-10", "5A", "1-2-3", "0-0"):
            with self.assertRaises(ValueError, msg=bad):
                m.analyze_contigs(bad)


class ValidationTests(unittest.TestCase):
    def test_defaults(self):
        p = m.validate_params({})
        self.assertEqual((p["contigs"], p["mode"], p["protocol"]), ("100", "free", "unconditional"))
        self.assertEqual((p["iterations"], p["num_designs"], p["num_seqs"], p["num_recycles"]), (50, 1, 8, 3))
        self.assertTrue(p["validate"])
        self.assertFalse(p["use_soluble"])
        self.assertFalse(p["initial_guess"])          # strict test for monomers
        self.assertEqual(p["total_steps"], 50)

    def test_binder_defaults_to_initial_guess(self):
        p = m.validate_params({"contigs": "A:50-70", "pdb": "4n5t"})
        self.assertEqual((p["mode"], p["protocol"], p["pdb"]), ("fixed", "binder", "4N5T"))
        self.assertTrue(p["initial_guess"])
        self.assertFalse(m.validate_params({"contigs": "A:50-70", "pdb": "4N5T", "initial_guess": False})["initial_guess"])

    def test_partial_total_steps(self):
        p = m.validate_params({"contigs": "", "pdb": "6MRR", "iterations": 100})
        self.assertEqual((p["mode"], p["total_steps"]), ("partial", 40))

    def test_target_required(self):
        with self.assertRaises(ValueError):
            m.validate_params({"contigs": "A:50-70"})
        m.validate_params({"contigs": "A:50-70", "pdb_content": PDB})

    def test_shell_metacharacters_are_rejected(self):
        for field, value in [
            ("contigs", "100; rm -rf /"), ("contigs", "$(id)"), ("contigs", "100`id`"),
            ("pdb", "1ABC;id"), ("pdb", "../../etc/passwd"), ("hotspot", "E64;id"),
            ("chains", "A;id"), ("rm_aa", "C;id"),
        ]:
            with self.assertRaises(ValueError, msg=f"{field}={value}"):
                m.validate_params({"contigs": "A:50", "pdb": "4N5T", field: value})

    def test_name_is_sanitised(self):
        self.assertEqual(m.validate_params({"name": "my design/../x"})["name"], "my_design____x")
        self.assertEqual(m.validate_params({"name": "///"})["name"], "___")
        self.assertEqual(m.validate_params({"name": "   "})["name"], "biogen_design")

    def test_ranges(self):
        for bad in ({"iterations": 5}, {"iterations": 14}, {"iterations": 1000}, {"num_designs": 0}, {"num_designs": 99},
                    {"num_recycles": 13}, {"noise_scale": 2}, {"mpnn_sampling_temp": 9}, {"symmetry": "weird"},
                    {"symmetry": "auto"}, {"symmetry": "dihedral", "order": 1}, {"validate": "maybe"}):
            with self.assertRaises(ValueError, msg=str(bad)):
                m.validate_params(bad)

    def test_num_seqs_is_batch_aligned(self):
        # designability_test.py samples in batches of 8; 12 would index past the 8 sampled sequences
        self.assertEqual(m.validate_params({"num_seqs": 12})["num_seqs"], 8)
        self.assertEqual(m.validate_params({"num_seqs": 5})["num_seqs"], 5)
        self.assertEqual(m.validate_params({"num_seqs": 40})["num_seqs"], 40)

    def test_hotspot_normalised(self):
        self.assertEqual(m.validate_params({"contigs": "A:50", "pdb": "4N5T", "hotspot": " A64, A88 "})["hotspot"], "A64,A88")

    def test_hotspot_rules(self):
        # only binder-style contigs, and only on the target chain(s) named in Contigs
        with self.assertRaises(ValueError) as cm:
            m.validate_params({"contigs": "A:50-70", "pdb": "4N5T", "hotspot": "E64,E88"})
        self.assertIn("chain E", str(cm.exception))
        with self.assertRaises(ValueError):
            m.validate_params({"contigs": "100", "hotspot": "A64"})                       # de novo: no target
        with self.assertRaises(ValueError):
            m.validate_params({"contigs": "", "pdb": "1UBQ", "hotspot": "A10"})           # partial diffusion
        m.validate_params({"contigs": "E6-155:70-100", "pdb": "5KQV", "hotspot": "E64,E88,E96"})  # the notebook example

    def test_symmetry_cyclic_order_one_is_none(self):
        self.assertEqual(m.validate_params({"symmetry": "cyclic", "order": 1})["symmetry"], "none")

    def test_size_limits(self):
        with self.assertRaises(ValueError):
            m.validate_params({"contigs": str(m.MAX_RESIDUES + 1)})
        with self.assertRaises(ValueError):
            m.validate_params({"contigs": "300", "symmetry": "cyclic", "order": 2})
        with self.assertRaises(ValueError):
            m.validate_params({"contigs": "A:50", "pdb_content": "x" * (m.MAX_PDB_CHARS + 1)})

    def test_public_params_hide_structure(self):
        p = m.validate_params({"contigs": "A:50", "pdb_content": PDB})
        self.assertNotIn("pdb_content", m.public_params(p))


class HydraArgsTests(unittest.TestCase):
    def args(self, **raw):
        p = m.validate_params(raw)
        return m.build_rfdiffusion_args(
            p, contigs=["60-60"], run_dir="/tmp/r", dump_dir="/dev/shm/x", design_idx=3, steps=p["total_steps"],
            input_pdb=None, sym=None, copies=1, rfdiffusion_dir="/root/RFdiffusion")

    def test_basic(self):
        a = self.args(contigs="60", iterations=25)
        for want in ("inference.output_prefix=/tmp/r/design", "inference.num_designs=1", "inference.design_startnum=3",
                     "diffuser.T=25", "contigmap.contigs=[60-60]", "inference.dump_pdb=True",
                     "inference.dump_pdb_path=/dev/shm/x"):
            self.assertIn(want, a)
        self.assertFalse(any("noise_scale" in x or "ckpt_override" in x or "hotspot" in x for x in a))
        self.assertTrue(all(isinstance(x, str) for x in a))

    def test_options(self):
        a = self.args(contigs="A:50", pdb="4N5T", hotspot="A64,A88", noise_scale=0.5, use_beta_model=True)
        self.assertIn("ppi.hotspot_res=[A64,A88]", a)
        self.assertIn("denoiser.noise_scale_ca=0.5", a)
        self.assertIn("denoiser.noise_scale_frame=0.5", a)
        self.assertIn("inference.ckpt_override_path=/root/RFdiffusion/models/Complex_beta_ckpt.pt", a)

    def test_partial_uses_partial_T(self):
        a = self.args(contigs="", pdb="6MRR", iterations=100)
        # T must be set as well: partial_T (40) <= T, and partial_T / T keeps the intended 0.4 noise level
        self.assertIn("diffuser.partial_T=40", a)
        self.assertIn("diffuser.T=100", a)
        self.assertNotIn("diffuser.T=40", a)

    def test_symmetry(self):
        p = m.validate_params({"contigs": "60", "symmetry": "cyclic", "order": 2, "add_potential": True})
        a = m.build_rfdiffusion_args(p, contigs=["60-60", "60-60"], run_dir="/r", dump_dir="/d", design_idx=0,
                                     steps=50, input_pdb=None, sym="c2", copies=2, rfdiffusion_dir="/x")
        self.assertEqual(a[:3], ["--config-name", "symmetry", "inference.symmetry=c2"])
        self.assertIn("potentials.guide_decay=quadratic", a)
        self.assertIn("contigmap.contigs=[60-60 60-60]", a)


CSV_MONOMER = """,design,n,mpnn,plddt,ptm,pae,rmsd,seq
0,0,0,1.2,0.91,0.8,6.0,1.1,AAAA
1,0,1,1.1,0.85,0.7,7.0,0.7,CCCC
2,0,2,1.3,0.60,0.4,15.0,0.5,DDDD
3,0,3,1.0,0.88,0.8,6.5,3.5,EEEE
"""
CSV_BINDER = """,design,n,mpnn,plddt,i_ptm,i_pae,rmsd,seq
0,0,0,1.2,0.91,0.6,12.0,0.8,AAAA/BB
1,0,1,1.1,0.86,0.7,8.0,1.4,CCCC/DD
2,0,2,1.1,0.95,0.7,6.0,2.9,EEEE/FF
"""


class ScoringTests(unittest.TestCase):
    def test_parse_rescales_plddt(self):
        rows = m.parse_scores_csv(CSV_MONOMER)
        self.assertEqual(len(rows), 4)
        self.assertAlmostEqual(rows[0]["plddt"], 91.0)
        self.assertIsNone(rows[0]["i_pae"])
        self.assertEqual(rows[1]["seq"], "CCCC")

    def test_monomer_pass_and_best(self):
        rows = m.parse_scores_csv(CSV_MONOMER)
        self.assertEqual([m.is_pass(r, "unconditional") for r in rows], [True, True, False, False])
        # both of the first two pass; the lower self-consistency RMSD wins
        self.assertEqual(m.pick_best_sequence(rows, "unconditional")["n"], 1)

    def test_binder_uses_interface_pae(self):
        rows = m.parse_scores_csv(CSV_BINDER)
        self.assertEqual([m.is_pass(r, "binder") for r in rows], [False, True, False])
        self.assertEqual(m.pick_best_sequence(rows, "binder")["n"], 1)

    def test_nothing_passes_still_returns_best_effort(self):
        rows = m.parse_scores_csv(CSV_MONOMER)[2:]
        self.assertEqual(m.pick_best_sequence(rows, "unconditional")["n"], 2)

    def test_rank_designs(self):
        def d(i, plddt, rmsd, validated=True):
            return {"index": i, "metrics": {"plddt": plddt, "rmsd": rmsd, "i_pae": None} if validated else None}
        ranked = m.rank_designs([d(0, 70, 0.5), d(1, 90, 1.5), d(2, 92, 0.9), d(3, 0, 0, validated=False)], "unconditional")
        self.assertEqual([x["index"] for x in ranked], [2, 1, 0, 3])
        self.assertEqual([x["rank"] for x in ranked], [1, 2, 3, 4])
        unval = m.rank_designs([d(2, 0, 0, False), d(0, 0, 0, False)], "unconditional")
        self.assertEqual([x["index"] for x in unval], [0, 2])

    def test_outputs(self):
        rows = m.parse_scores_csv(CSV_MONOMER)
        csv_text = m.scores_csv_text(rows, "unconditional")
        self.assertTrue(csv_text.startswith("n,mpnn,plddt,ptm,pae,i_ptm,i_pae,rmsd,passed,seq"))
        self.assertIn(">demo_d1_s2 pLDDT=85.0 RMSD=0.70 pass\nCCCC", m.fasta_text(rows, "unconditional", "demo", 0))


class GeometryTests(unittest.TestCase):
    def setUp(self):
        try:
            import numpy  # noqa: F401
        except ImportError:
            self.skipTest("numpy not installed")

    def test_kabsch_recovers_rigid_motion(self):
        import numpy as np
        rng = np.random.default_rng(0)
        pts = rng.normal(size=(30, 3)) * 8
        th = 0.7
        R = np.array([[math.cos(th), -math.sin(th), 0], [math.sin(th), math.cos(th), 0], [0, 0, 1]])
        moved = pts @ R.T + np.array([5.0, -3.0, 2.0])
        ref = "\n".join(ca_line(i + 1, *p) for i, p in enumerate(pts))
        mob = "\n".join(ca_line(i + 1, *p, b=87.5) for i, p in enumerate(moved))
        out, rmsd = m.align_pdb(mob, ref)
        self.assertLess(rmsd, 0.02)
        back = np.array(m._ca_coords(out))
        self.assertLess(np.abs(back - pts).max(), 0.01)
        self.assertIn(" 87.50 ", out)                      # B-factors (pLDDT) preserved

    def test_length_mismatch_is_left_alone(self):
        out, rmsd = m.align_pdb(ca_line(1, 0, 0, 0) + "\n" + ca_line(2, 1, 0, 0), ca_line(1, 0, 0, 0))
        self.assertIsNone(rmsd)
        self.assertEqual(out.count("ATOM"), 2)

    def test_bfactor_rescale(self):
        low = "\n".join(ca_line(i, i, 0, 0, b=0.5) for i in range(1, 4))
        self.assertIn(" 50.00", m.normalize_bfactors(low))
        high = "\n".join(ca_line(i, i, 0, 0, b=75.0) for i in range(1, 4))
        self.assertEqual(m.normalize_bfactors(high), high)


class TrajectoryTests(unittest.TestCase):
    def make(self, n, model_records=True):
        out = []
        for i in range(n):
            out += ([f"MODEL     {i + 1:>4}"] if model_records else []) + [ca_line(1, float(i), 0, 0), "TER", "ENDMDL"]
        return "\n".join(out) + "\n"

    def test_rfdiffusion_format_has_endmdl_only(self):
        # RFdiffusion's writepdb_multi separates frames with ENDMDL and writes no MODEL records
        text = m.thin_trajectory(self.make(25, model_records=False), max_frames=10)
        self.assertEqual(text.count("MODEL"), 10)
        self.assertEqual(text.count("ENDMDL"), 10)
        xs = [float(l[30:38]) for l in text.splitlines() if l.startswith("ATOM")]
        self.assertEqual((xs[0], xs[-1]), (24.0, 0.0))

    def test_thin_and_reverse(self):
        text = m.thin_trajectory(self.make(100), max_frames=10)
        self.assertEqual(text.count("MODEL"), 10)
        xs = [float(l[30:38]) for l in text.splitlines() if l.startswith("ATOM")]
        self.assertEqual((xs[0], xs[-1]), (99.0, 0.0))     # file order is final->noise; output is noise->final
        self.assertEqual(xs, sorted(xs, reverse=True))

    def test_short_trajectory_kept_whole(self):
        self.assertEqual(m.thin_trajectory(self.make(5), max_frames=40).count("MODEL"), 5)

    def test_non_trajectory_passthrough(self):
        self.assertEqual(m.thin_trajectory(PDB), PDB)


def chain_pdb(spec):
    """spec: {chain: [residue numbers]} -> minimal PDB text with one CA per residue."""
    lines, i = [], 1
    for chain, nums in spec.items():
        for n in nums:
            lines.append(f"ATOM  {i:5d}  CA  GLY {chain}{n:4d}    {0.0:8.3f}{0.0:8.3f}{float(i):8.3f}  1.00  0.00           C")
            i += 1
    return "\n".join(lines) + "\nEND\n"


class PreflightTests(unittest.TestCase):
    TARGET = {"A": list(range(1, 101)), "B": list(range(10, 60)), "E": list(range(6, 156))}

    def scan(self, spec=None):
        return m.scan_target(chain_pdb(spec or self.TARGET))

    def params(self, **raw):
        raw.setdefault("pdb", "1ABC")
        return m.validate_params(raw)

    def test_scan_reads_ca_per_chain_of_first_model_only(self):
        text = chain_pdb({"A": [1, 2, 3]}) + "ENDMDL\n" + chain_pdb({"A": [9, 10]})
        self.assertEqual(m.scan_target(text), {"A": [1, 2, 3]})
        self.assertEqual(m.scan_target("HEADER only"), {})

    def test_binder_length_and_ok(self):
        n = m.preflight_target(self.params(contigs="E6-155:70-100"), self.scan(), 400)
        self.assertEqual(n, 150 + 100)

    def test_whole_chain_and_open_range(self):
        self.assertEqual(m.preflight_target(self.params(contigs="A:50-70"), self.scan(), 400), 100 + 70)
        self.assertEqual(m.preflight_target(self.params(contigs="A10-:30"), self.scan(), 400), 91 + 30)

    def test_partial_empty_contigs_keeps_every_chain_or_the_chosen_ones(self):
        self.assertEqual(m.preflight_target(self.params(contigs=""), self.scan(), 400), 100 + 50 + 150)
        self.assertEqual(m.preflight_target(self.params(contigs="", chains="B"), self.scan(), 400), 50)

    def test_oversize_message_has_partial_hint(self):
        with self.assertRaises(ValueError) as cm:
            m.preflight_target(self.params(contigs=""), self.scan({"A": list(range(1, 500))}), 400)
        self.assertIn("499 residues", str(cm.exception))
        self.assertIn("Input chains", str(cm.exception))

    def test_symmetry_multiplies(self):
        p = self.params(contigs="100", pdb="", symmetry="cyclic", order=3)
        self.assertEqual(m.preflight_target({**p, "mode": "free"}, self.scan(), 400), 300)
        with self.assertRaises(ValueError):
            m.preflight_target({**p, "mode": "free"}, self.scan(), 250)

    def test_wrong_chains_are_caught(self):
        with self.assertRaises(ValueError) as cm:
            m.preflight_target(self.params(contigs="Z10-50"), self.scan(), 400)
        self.assertIn("not among the input chains", str(cm.exception))
        with self.assertRaises(ValueError) as cm:
            m.preflight_target(self.params(contigs="A:50", chains="Q"), self.scan(), 400)
        self.assertIn("Input chain(s) Q", str(cm.exception))
        with self.assertRaises(ValueError) as cm:
            m.preflight_target(self.params(contigs="A:50", chains="B"), self.scan(), 400)
        self.assertIn("not among the input chains", str(cm.exception))

    def test_out_of_range_residues_are_caught(self):
        with self.assertRaises(ValueError) as cm:
            m.preflight_target(self.params(contigs="A90-200:60"), self.scan(), 400)
        self.assertIn("only covers residues 1-100", str(cm.exception))

    def test_hotspots_must_exist(self):
        ok = self.params(contigs="E6-155:70-100", hotspot="E64,E88")
        self.assertEqual(m.preflight_target(ok, self.scan(), 400), 250)
        bad = self.params(contigs="E6-155:70-100", hotspot="E64,E999")
        with self.assertRaises(ValueError) as cm:
            m.preflight_target(bad, self.scan(), 400)
        self.assertIn("E999", str(cm.exception))

    def test_empty_target(self):
        with self.assertRaises(ValueError):
            m.preflight_target(self.params(contigs="A:50"), {}, 400)


class JobListTests(unittest.TestCase):
    REC = {"job_id": "a" * 32, "status": "completed", "created_at": 100.0, "updated_at": 200.0,
           "recent_logs": ["x"], "designs": [{"index": 0, "sequences": [1, 2, 3], "sequence": "MKV", "rank": 1}]}

    def test_brief_drops_the_bulky_parts_and_leaves_the_record_alone(self):
        b = m.job_brief(self.REC)
        self.assertNotIn("recent_logs", b)
        self.assertNotIn("sequences", b["designs"][0])
        self.assertEqual(b["designs"][0]["sequence"], "MKV")
        self.assertIn("recent_logs", self.REC)
        self.assertIn("sequences", self.REC["designs"][0])

    def test_a_job_whose_controller_died_is_reported_failed(self):
        live = {**self.REC, "status": "running", "updated_at": 1000.0}
        self.assertEqual(m.settle_stale(live, now=1000.0 + m.STALE_AFTER_S - 1)["status"], "running")
        dead = m.settle_stale(live, now=1000.0 + m.STALE_AFTER_S + 1)
        self.assertEqual(dead["status"], "failed")
        self.assertIn("stopped unexpectedly", dead["error_message"])
        self.assertEqual(live["status"], "running")

    def test_finished_jobs_are_never_marked_stale(self):
        self.assertEqual(m.settle_stale(self.REC, now=10 ** 9)["status"], "completed")


class ClientIpTests(unittest.TestCase):
    def test_last_forwarded_entry_wins_so_a_spoofed_header_cannot_dodge_the_lockout(self):
        self.assertEqual(m.pick_client_ip("6.6.6.6, 9.9.9.9", "10.0.0.1"), "9.9.9.9")
        self.assertEqual(m.pick_client_ip("1.2.3.4", "10.0.0.1"), "1.2.3.4")

    def test_falls_back_to_the_peer(self):
        self.assertEqual(m.pick_client_ip("", "10.0.0.1"), "10.0.0.1")
        self.assertEqual(m.pick_client_ip(" , ", ""), "unknown")


class AuthTests(unittest.TestCase):
    ENV = {"AUTH_EMAIL": " Admin@Lab.Org ", "AUTH_PASSWORD": "correct horse battery", "JWT_SECRET": "s" * 40}

    def setUp(self):
        try:
            import jwt  # noqa: F401
        except ImportError:
            self.skipTest("PyJWT not installed")
        self.cfg = m.auth_config(self.ENV)

    def test_config_requires_everything_and_a_long_secret(self):
        self.assertEqual(self.cfg["email"], "admin@lab.org")
        for missing in ("AUTH_EMAIL", "AUTH_PASSWORD", "JWT_SECRET"):
            self.assertIsNone(m.auth_config({k: v for k, v in self.ENV.items() if k != missing}), missing)
        self.assertIsNone(m.auth_config({**self.ENV, "JWT_SECRET": "short"}))
        self.assertEqual(m.auth_config({**self.ENV, "JWT_TTL_HOURS": "2"})["ttl_hours"], 2.0)
        self.assertEqual(m.auth_config({**self.ENV, "JWT_TTL_HOURS": "junk"})["ttl_hours"], 12.0)

    def test_credentials(self):
        ok = m.check_credentials
        self.assertTrue(ok(self.cfg, "ADMIN@lab.org ", "correct horse battery"))
        self.assertFalse(ok(self.cfg, "admin@lab.org", "wrong"))
        self.assertFalse(ok(self.cfg, "other@lab.org", "correct horse battery"))
        self.assertFalse(ok(self.cfg, "", ""))

    def test_token_roundtrip_and_expiry(self):
        token, ttl = m.issue_token(self.cfg, now=1_000_000)
        self.assertEqual(ttl, 12 * 3600)
        import time
        fresh, _ = m.issue_token(self.cfg)
        claims = m.decode_token(fresh, self.cfg["secret"])
        self.assertEqual((claims["sub"], claims["iss"]), ("admin@lab.org", "biogen-ai"))
        self.assertIsNone(m.decode_token(token, self.cfg["secret"]))           # issued in 1970 -> expired
        self.assertIsNone(m.decode_token(fresh, "x" * 40))                      # wrong signing key
        self.assertIsNone(m.decode_token(fresh + "x", self.cfg["secret"]))      # tampered signature
        self.assertIsNone(m.decode_token("not.a.jwt", self.cfg["secret"]))
        self.assertGreater(claims["exp"], time.time())

    def test_unsigned_and_foreign_tokens_are_rejected(self):
        import jwt
        now = int(__import__("time").time())
        body = {"iss": "biogen-ai", "sub": "admin@lab.org", "iat": now, "exp": now + 600}
        self.assertIsNone(m.decode_token(jwt.encode(body, key=None, algorithm="none"), self.cfg["secret"]))
        self.assertIsNone(m.decode_token(jwt.encode({**body, "iss": "evil"}, self.cfg["secret"], "HS256"), self.cfg["secret"]))
        self.assertIsNone(m.decode_token(jwt.encode({k: v for k, v in body.items() if k != "exp"}, self.cfg["secret"], "HS256"), self.cfg["secret"]))
        self.assertIsNone(m.decode_token(jwt.encode(body, self.cfg["secret"], "HS512"), self.cfg["secret"]))

    def test_login_throttle(self):
        now = 10_000.0
        self.assertEqual(m.login_retry_after([], now), 0)
        self.assertEqual(m.login_retry_after([now - 5] * 4, now), 0)
        wait = m.login_retry_after([now - 5] * 5, now)
        self.assertTrue(0 < wait <= m.LOGIN_LOCK_S + 1)
        self.assertEqual(m.login_retry_after([now - 5000] * 5, now), 0)         # old failures age out


if __name__ == "__main__":
    unittest.main()
