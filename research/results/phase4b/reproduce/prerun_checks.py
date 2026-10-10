"""Pre-run checks for the single Phase 4B real-label run. Read-only. Writes one JSON record to the path given.

Run once, immediately before `python -I -B research/phase4b/run.py actual` on 2026-10-10; its output is
execution/prerun_checks.json. Kept here as a record. Run now, the checks that require no earlier results fail,
because the run has happened.

usage: python -I -B prerun_checks.py <repo> <out.json> <wip-snapshot-dir>
"""
import hashlib
import json
import platform
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(sys.argv[1]).resolve()
OUT = Path(sys.argv[2])
SNAP = Path(sys.argv[3])

EXPECT = {
    "head": "b86f22784fd4ab368c1b6e2da012018cea69ec3c",
    "branch": "redesign/breakaway",
    "protocol_freeze_commit": "0fa32fe655381d97057042678792f8fe48c9ec89",
    "research/protocols/phase4b_protocol_freeze.json": "89032a0a774dbb9d5f803e695ee95e0cd1569552e61925c1dd1dbbe286d83b1a",
    "research/protocols/jump_fatigue_v04.md": "e0699fcf120c48f93e94bb02d624707fa77c2b7185ba36c142accf7d4d27c31d",
    "research/protocols/rehab24_6_v04.md": "3a2b8307ec367341acbc0e17dab9ab8f31e1c3e703992c3491fc0b26f8d67c2f",
    "research/protocols/phase4b_preanalysis_checks.md": "e30fe0142714afa6df763e4ae0eb69cc743a61455a8006a4e16c69e78fc1922a",
    "research/protocols/phase4b_inclusion_v04.json": "d220ce4b3d45c5fbb1f7fbf2728f5f34f206ae2edbf6e7749471d2a8f7245c6d",
    "research/protocols/phase4b_analysis_freeze_v2.json": "d7442a63212a0be865d689193abf111b76443feb3f46b68eceeb609603d3a4f5",
    "research/protocols/phase4b_analysis_freeze.json": "396c3f35b05c6989248b42daf5f1e5ac1fcec0200a6709dbab900894471ea0bf",
    "detector_config_committed": "543798067d97f96efa6d98baf43d3aaabc49029cafb70cc537755af82d7e1b9e",
}
# Files the run imports or reads that are pinned by the commit but not listed in either freeze.
CLOSURE_EXTRA = ["src/utils/stats.ts", "shared/default_detector_config.json"]


def sh(*cmd, check=True):
    r = subprocess.run(list(cmd), cwd=REPO, capture_output=True, text=True)
    if check and r.returncode:
        raise RuntimeError(f"{cmd}: {r.stderr}")
    return r


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


checks, ok = [], True


def check(name, passed, detail=""):
    global ok
    ok = ok and bool(passed)
    checks.append({"check": name, "pass": bool(passed), "detail": detail})
    print(("PASS " if passed else "FAIL ") + name + (f": {detail}" if detail else ""), flush=True)


head = sh("git", "rev-parse", "HEAD").stdout.strip()
check("HEAD is the approved commit", head == EXPECT["head"], head)
branch = sh("git", "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
check("on redesign/breakaway", branch == EXPECT["branch"], branch)
sh("git", "fetch", "-q", "origin")
remote = sh("git", "rev-parse", "origin/redesign/breakaway").stdout.strip()
check("origin/redesign/breakaway equals HEAD", remote == head, remote)
anc = sh("git", "merge-base", "--is-ancestor", EXPECT["protocol_freeze_commit"], "HEAD", check=False).returncode == 0
check("protocol-freeze commit 0fa32fe is an ancestor of HEAD", anc)

for rel in ["research/protocols/phase4b_protocol_freeze.json", "research/protocols/jump_fatigue_v04.md",
            "research/protocols/rehab24_6_v04.md", "research/protocols/phase4b_preanalysis_checks.md",
            "research/protocols/phase4b_inclusion_v04.json", "research/protocols/phase4b_analysis_freeze_v2.json",
            "research/protocols/phase4b_analysis_freeze.json"]:
    h = sha(REPO / rel)
    check(f"raw SHA-256 {rel}", h == EXPECT[rel], h)

r = sh(sys.executable, "-I", "-B", "research/measurement/freeze.py", "verify-protocol", check=False)
check("freeze.py verify-protocol (protocol files, input code, 12 data files)", r.returncode == 0, r.stdout.strip())
r = sh(sys.executable, "-I", "-B", "research/phase4b/run.py", "verify", check=False)
check("run.py verify (analysis freeze v2: code, calibration labels, deviations log, v1 file)", r.returncode == 0, r.stdout.strip())

cfg = subprocess.run(["git", "show", "HEAD:public/breakingpoint_detector_config.json"], cwd=REPO, capture_output=True).stdout
check("detector config committed bytes", hashlib.sha256(cfg).hexdigest() == EXPECT["detector_config_committed"],
      hashlib.sha256(cfg).hexdigest())

stage2 = [l.strip() for l in (SNAP / "all-wip-files.txt").read_text(encoding="utf-8").splitlines() if l.strip()]
porcelain = [l for l in sh("git", "status", "--porcelain", "--untracked-files=all").stdout.splitlines() if l.strip()]
paths = [l[3:].strip() for l in porcelain]
extra = [p for p in paths if p not in stage2]
check("working tree differs from HEAD only in the 17 Stage 2 files", not extra, f"{len(paths)} changed, outside Stage 2: {extra}")
same = [p for p in stage2 if (REPO / p).read_bytes() == (SNAP / "files" / p).read_bytes()]
check("Stage 2 files byte-identical to the snapshot", len(same) == len(stage2), f"{len(same)}/{len(stage2)}")

closure = {}
for rel in CLOSURE_EXTRA:
    blob = sh("git", "hash-object", "--path", rel, rel).stdout.strip()
    head_blob = sh("git", "rev-parse", f"HEAD:{rel}").stdout.strip()
    closure[rel] = {"git_blob": blob, "sha256_raw": sha(REPO / rel)}
    check(f"{rel} equals HEAD (not in a freeze list, pinned by the commit)", blob == head_blob, blob)

results = REPO / "research/results/phase4b"
check("research/results/phase4b does not exist", not results.exists())
records = REPO / "data/processed/phase4b_actual"
check("data/processed/phase4b_actual does not exist", not records.exists())
vn = REPO / "node_modules/.bin/vite-node.cmd"
check("vite-node present", vn.exists())


def ver(*cmd):
    try:
        return subprocess.run(list(cmd), cwd=REPO, capture_output=True, text=True, shell=True).stdout.strip()
    except Exception as e:  # noqa: BLE001
        return f"unavailable: {e}"


import numpy, scipy  # noqa: E401,E402
env = {
    "checked_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    "python": sys.version.split()[0], "python_executable": sys.executable,
    "numpy": numpy.__version__, "scipy": scipy.__version__,
    "node": ver("node", "--version"),
    "vite_node": ver(str(vn), "--version"),
    "os": platform.platform(), "machine": platform.machine(), "cpu_count": __import__("os").cpu_count(),
    "git": ver("git", "--version"),
}
OUT.write_text(json.dumps({"all_pass": ok, "checks": checks, "closure_files_not_in_freeze_lists": closure,
                           "environment": env}, indent=1) + "\n", encoding="utf-8")
print("ALL PASS" if ok else "SOME CHECKS FAILED")
sys.exit(0 if ok else 1)
