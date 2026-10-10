"""Lab runs must never overwrite the archived studies in results/ or the app config in public/.

Run with:  python -m unittest discover -s hpc/tests
"""
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "hpc"))

from output_guard import (INSTALL_TARGET, OutputGuardError, check_not_finished, check_output_dir,  # noqa: E402
                          install_target, resolve_output_dir)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def archived_hashes() -> dict:
    """Raw-byte SHA-256 of every archived file listed in results/provenance.json, plus the app config."""
    manifest = json.loads((REPO / "results" / "provenance.json").read_text(encoding="utf-8"))
    paths = {a["path"] for e in manifest["experiments"] for a in e["artifacts"]}
    paths.add("public/breakingpoint_detector_config.json")
    return {p: sha256(REPO / p) for p in sorted(paths)}


class OutputFolderRules(unittest.TestCase):
    def test_refuses_archived_and_app_folders(self):
        for rel in ["results", "results/figures", "results/archive", "results/archive/2026-10-04_local_50k",
                    "results/real_data_v02", "public", "public/lab/figures", ".", "src", "lab", "hpc", "shared"]:
            with self.subTest(rel=rel), self.assertRaises(OutputGuardError):
                check_output_dir(REPO / rel)

    def test_refuses_the_runs_folder_itself(self):
        with self.assertRaises(OutputGuardError):
            check_output_dir(REPO / "results" / "runs")

    def test_allows_named_runs_scratch_folders_and_outside_paths(self):
        self.assertEqual(check_output_dir(REPO / "results" / "runs" / "exp1"), (REPO / "results" / "runs" / "exp1").resolve())
        check_output_dir(REPO / "results_smoke")
        with tempfile.TemporaryDirectory() as d:
            check_output_dir(Path(d) / "run")

    def test_default_is_a_new_named_run_folder(self):
        out = resolve_output_dir(None, None)
        self.assertEqual(out.parent, (REPO / "results" / "runs").resolve())
        self.assertTrue(out.name.startswith("local-"))
        self.assertEqual(resolve_output_dir(None, "abc"), (REPO / "results" / "runs" / "abc").resolve())

    def test_run_name_must_be_a_plain_name(self):
        for bad in ["../results", "a/b", "..", "."]:
            with self.subTest(bad=bad), self.assertRaises(OutputGuardError):
                resolve_output_dir(None, bad)
        with self.assertRaises(OutputGuardError):
            resolve_output_dir(Path("x"), "y")

    def test_finished_run_needs_explicit_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            check_not_finished(Path(d))  # empty folder: fine
            (Path(d) / "VALIDATION_REPORT.md").write_text("done", encoding="utf-8")
            with self.assertRaises(OutputGuardError):
                check_not_finished(Path(d))
            check_not_finished(Path(d), overwrite=True)

    def test_install_only_on_request(self):
        self.assertIsNone(install_target(False))
        self.assertEqual(install_target(True), INSTALL_TARGET)


class CommandLine(unittest.TestCase):
    def run_cli(self, *args):
        return subprocess.run([sys.executable, "-B", *args], cwd=REPO, capture_output=True, text=True, timeout=600,
                              env={**os.environ, "MPLBACKEND": "Agg", "PYTHONDONTWRITEBYTECODE": "1"})

    def test_cli_refuses_results_and_public_before_doing_any_work(self):
        before = archived_hashes()
        for script, out in [("hpc/run_experiment.py", "results"), ("hpc/run_experiment.py", "public"),
                            ("hpc/merge_results.py", "results"), ("hpc/merge_results.py", "results/archive")]:
            with self.subTest(script=script, out=out):
                r = self.run_cli(script, "--out", out, "--sessions", "50", "--grid", "quick") if script.endswith("run_experiment.py") \
                    else self.run_cli(script, "--out", out, "--grid", "quick")
                self.assertNotEqual(r.returncode, 0)
                self.assertIn("Refusing to write", r.stderr)
        self.assertEqual(archived_hashes(), before)

    def test_merge_requires_a_run_name(self):
        r = self.run_cli("hpc/merge_results.py", "--grid", "quick")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("--run-name", r.stderr)

    def test_full_local_run_leaves_archive_and_app_config_unchanged(self):
        before = archived_hashes()
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "run"
            r = self.run_cli("hpc/run_experiment.py", "--stage", "all", "--sessions", "160", "--seed", "3", "--grid", "quick",
                             "--workers", "1", "--block-size", "80", "--eval-sessions", "80", "--robustness-sessions", "20",
                             "--out", str(out))
            self.assertEqual(r.returncode, 0, r.stdout[-2000:] + r.stderr[-2000:])
            self.assertTrue((out / "VALIDATION_REPORT.md").exists())
            self.assertTrue((out / "breakingpoint_detector_config.json").exists())
            self.assertNotIn("installed detector config", r.stdout)
            # A second run into the same finished folder is refused.
            again = self.run_cli("hpc/run_experiment.py", "--stage", "all", "--sessions", "160", "--grid", "quick", "--out", str(out))
            self.assertNotEqual(again.returncode, 0)
            self.assertIn("already holds finished results", again.stderr)
        self.assertEqual(archived_hashes(), before)


if __name__ == "__main__":
    unittest.main()
