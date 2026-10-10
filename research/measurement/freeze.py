"""Phase 4B freeze files: record and verify what the evaluation is allowed to use.

    python -I research/measurement/freeze.py protocol          write research/protocols/phase4b_protocol_freeze.json
    python -I research/measurement/freeze.py verify-protocol   check the current files against it

Files in git are recorded by their git blob id (`git hash-object`, which is what the commit stores and does not
depend on a checkout's line endings) and by the raw SHA-256 of the file at freeze time. Data files, which are
not in git, are recorded by raw SHA-256. The analysis freeze (phase4b_analysis_freeze.json) is written by the
Phase 4B code after shuffled-label development; it adds the protocol-freeze commit and the analysis code.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PROTOCOL_FREEZE = REPO / "research" / "protocols" / "phase4b_protocol_freeze.json"

#: Documents that define the evaluation.
PROTOCOL_FILES = [
    "research/protocols/jump_fatigue_v04.md",
    "research/protocols/rehab24_6_v04.md",
    "research/protocols/phase4b_preanalysis_checks.md",
    "research/protocols/phase4b_inclusion_v04.json",
]
#: Code that produced the inputs and the inclusion lists, and the app code the scores call (unchanged).
CODE_FILES = [
    "research/measurement/inclusion.py",
    "research/measurement/build_streams.py",
    "research/measurement/variants.ts",
    "research/measurement/run_variants.ts",
    "research/evaluation/offlinePipeline.ts",
    "src/pose/smoothing.ts",
    "src/biomechanics/frameMetrics.ts",
    "src/reps/segmenter.ts",
    "src/biomechanics/repFeatures.ts",
    "src/biomechanics/catalog.ts",
    "src/baseline/baseline.ts",
    "src/detection/driftScore.ts",
    "src/detection/config.ts",
    "shared/feature_catalog.json",
    "public/breakingpoint_detector_config.json",
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git_blob(rel: str) -> str:
    r = subprocess.run(["git", "hash-object", "--path", rel, rel], cwd=REPO, capture_output=True, text=True, check=True)
    return r.stdout.strip()


def describe(rel: str) -> dict:
    return {"git_blob": git_blob(rel), "sha256_raw": sha256(REPO / rel)}


def protocol() -> None:
    inclusion = json.loads((REPO / "research/protocols/phase4b_inclusion_v04.json").read_text(encoding="utf-8"))
    data = {rel: {"sha256_raw": h} for rel, h in inclusion["inputs_sha256"].items()}
    for rel, d in data.items():
        actual = sha256(REPO / rel)
        if actual != d["sha256_raw"]:
            sys.exit(f"{rel} changed since the inclusion lists were built; rebuild them first")
    freeze = {
        "what": "Phase 4B protocol freeze: protocols, pre-analysis checks, inclusion lists, input code and data. "
                "Written before any outcome analysis with the real condition or correctness labels.",
        "frozen_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "protocol_files": {rel: describe(rel) for rel in PROTOCOL_FILES},
        "code_files": {rel: describe(rel) for rel in CODE_FILES},
        "data_files": data,
        "verification": "Files in git are checked by git blob id (git hash-object). Data files by raw SHA-256.",
    }
    PROTOCOL_FREEZE.write_text(json.dumps(freeze, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {PROTOCOL_FREEZE.relative_to(REPO)}")
    for rel, d in freeze["protocol_files"].items():
        print(f"  {d['git_blob'][:12]}  {d['sha256_raw'][:16]}  {rel}")


def verify_protocol() -> list:
    """Problems found (empty list = everything matches)."""
    freeze = json.loads(PROTOCOL_FREEZE.read_text(encoding="utf-8"))
    problems = []
    for group in ("protocol_files", "code_files"):
        for rel, d in freeze[group].items():
            if not (REPO / rel).exists():
                problems.append(f"missing: {rel}")
            elif git_blob(rel) != d["git_blob"]:
                problems.append(f"changed since the freeze: {rel}")
    for rel, d in freeze["data_files"].items():
        if not (REPO / rel).exists():
            problems.append(f"missing: {rel}")
        elif sha256(REPO / rel) != d["sha256_raw"]:
            problems.append(f"changed since the freeze: {rel}")
    return problems


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "protocol":
        protocol()
    elif cmd == "verify-protocol":
        bad = verify_protocol()
        print("protocol freeze: all files match" if not bad else "\n".join(bad))
        sys.exit(1 if bad else 0)
    else:
        sys.exit(__doc__)
