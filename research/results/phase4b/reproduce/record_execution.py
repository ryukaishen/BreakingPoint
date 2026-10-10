"""Execution metadata for the single Phase 4B real-label run. Computes no statistics; only records what happened.

Run once, immediately after the real-label run on 2026-10-10. Kept here as a record.

usage: python -I -B record_execution.py <repo> <run-log-dir>
Writes research/results/phase4b/EXECUTION.json and copies the run's stdout/stderr and pre-run checks next to it.
"""
import hashlib
import json
import shutil
import sys
from pathlib import Path

REPO = Path(sys.argv[1]).resolve()
LOG = Path(sys.argv[2])
RESULTS = REPO / "research/results/phase4b"
RECORDS = REPO / "data/processed/phase4b_actual/records.json"


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


txt = lambda name: (LOG / name).read_text(encoding="utf-8").strip()  # noqa: E731
pre = json.loads(txt("prerun_checks.json"))
outputs = sorted(p for p in RESULTS.rglob("*") if p.is_file())
meta = {
    "what": "Execution record of the single Phase 4B real-label run (analysis freeze v2). Approved by Adam Tang on 2026-10-10.",
    "command": "python -I -B research/phase4b/run.py actual",
    "working_directory": "repository root",
    "started_at": txt("started_at.txt"),
    "finished_at": txt("finished_at.txt"),
    "exit_code": int(txt("exit_code.txt")),
    "runs_of_the_real_label_analysis": 1,
    "repository": {"commit": "b86f22784fd4ab368c1b6e2da012018cea69ec3c", "branch": "redesign/breakaway",
                   "protocol_freeze_commit": "0fa32fe655381d97057042678792f8fe48c9ec89",
                   "remote": "https://github.com/ryukaishen/BreakingPoint"},
    "freezes": {
        "research/protocols/phase4b_protocol_freeze.json": sha(REPO / "research/protocols/phase4b_protocol_freeze.json"),
        "research/protocols/phase4b_analysis_freeze_v2.json": sha(REPO / "research/protocols/phase4b_analysis_freeze_v2.json"),
        "research/protocols/phase4b_analysis_freeze.json (v1, superseded, not used)": sha(REPO / "research/protocols/phase4b_analysis_freeze.json"),
    },
    "pre_run_checks": {"all_pass": pre["all_pass"], "checks": pre["checks"]},
    "files_used_but_pinned_only_by_the_commit": pre["closure_files_not_in_freeze_lists"],
    "environment": pre["environment"],
    "per_person_records": {"path": "data/processed/phase4b_actual/records.json (git-ignored, not committed)",
                           "sha256_raw": sha(RECORDS) if RECORDS.exists() else None,
                           "bytes": RECORDS.stat().st_size if RECORDS.exists() else None},
    "outputs_written_by_the_frozen_code": {str(p.relative_to(REPO)).replace("\\", "/"): sha(p) for p in outputs
                                            if p.parent.name in ("jump_fatigue", "rehab24_6")},
}
logs = RESULTS / "execution"
logs.mkdir(exist_ok=True)
for name in ("stdout.log", "stderr.log", "prerun_checks.json"):
    shutil.copyfile(LOG / name, logs / name)
meta["execution_logs"] = {f"research/results/phase4b/execution/{n}": sha(logs / n) for n in ("stdout.log", "stderr.log", "prerun_checks.json")}
(RESULTS / "EXECUTION.json").write_text(json.dumps(meta, indent=1) + "\n", encoding="utf-8")
print(json.dumps({k: meta[k] for k in ("started_at", "finished_at", "exit_code", "per_person_records", "outputs_written_by_the_frozen_code")}, indent=1))
