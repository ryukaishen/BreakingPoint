"""Phase 4B driver.

    python -I research/phase4b/run.py dev --seed 7                    one shuffled-label run (development output)
    python -I research/phase4b/run.py null-check --seeds 1-100        shuffled-label calibration across many shuffles
    python -I research/phase4b/run.py positive-control --seeds 1-5    shuffled labels plus injected known shifts
    python -I research/phase4b/run.py freeze                          write research/protocols/phase4b_analysis_freeze.json
    python -I research/phase4b/run.py actual                          the single real-label run (only after approval)

Development output goes to data/processed/phase4b_dev/ (git-ignored). Only `actual` writes
research/results/phase4b/, and only after verifying both freeze files: the protocol freeze (committed) and
the analysis freeze (this code's hashes, the protocol-freeze commit, the inputs and the verification runs).
"""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(REPO / "research" / "measurement"))
import freeze  # noqa: E402  (research/measurement/freeze.py: protocol freeze)
import stats  # noqa: E402

DEV = REPO / "data" / "processed" / "phase4b_dev"
ACTUAL_RECORDS = REPO / "data" / "processed" / "phase4b_actual"
RESULTS = REPO / "research" / "results" / "phase4b"
ANALYSIS_FREEZE = REPO / "research" / "protocols" / "phase4b_analysis_freeze.json"
ANALYSIS_CODE = ["research/phase4b/scoring.ts", "research/phase4b/compute.ts", "research/phase4b/stats.py", "research/phase4b/run.py",
                 "research/phase4b/tsconfig.json"]


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def vite_node() -> list:
    exe = REPO / "node_modules" / ".bin" / ("vite-node.cmd" if os.name == "nt" else "vite-node")
    if not exe.exists():
        sys.exit("vite-node not found; run npm install")
    return [str(exe)]


def compute(labels: str, out: Path, seed: int = 0, inject: bool = False, env: dict | None = None) -> Path:
    cmd = vite_node() + ["research/phase4b/compute.ts", "--", "--labels", labels, "--out", str(out.relative_to(REPO))]
    if labels == "shuffled":
        cmd += ["--seed", str(seed)]
    if inject:
        cmd += ["--inject"]
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, env={**os.environ, **(env or {})}, shell=(os.name == "nt"))
    if r.returncode:
        sys.exit(f"compute.ts failed:\n{r.stdout}\n{r.stderr}")
    return out / "records.json"


def parse_seeds(spec: str) -> list:
    a, _, b = spec.partition("-")
    return list(range(int(a), int(b or a) + 1))


def key_metrics(sj: dict, sr: dict) -> dict:
    """The numbers the null check and the positive control look at."""
    prim = sj["samples"]["B/primary"]
    m = {"holm_rejections_at_0.05": sum(1 for k in stats.JUMP_INTERPRETED if (prim["J-D"][k].get("holm_p") or 1) < 0.05),
         "min_raw_p": min(prim["J-D"][k].get("wilcoxon_p", 1) for k in stats.JUMP_INTERPRETED)}
    for k in stats.JUMP_INTERPRETED:
        m[f"B_mean_delta_{k}"] = prim["J-D"][k]["delta"].get("mean")
        ci = prim["J-D"][k]["dz"].get("mean_ci95")
        m[f"B_dz_ci_covers_0_{k}"] = bool(ci and ci[0] <= 0 <= ci[1])
        ci = prim["J-D"][k]["delta"].get("mean_ci95")
        m[f"B_delta_ci_covers_0_{k}"] = bool(ci and ci[0] <= 0 <= ci[1])
    for path in ("B", "A"):
        for sc in stats.JUMP_SCORES:
            ja = sj["samples"][f"{path}/primary"]["J-A"].get(sc)
            if ja:
                m[f"{path}_JA_{sc}_mean_rank"] = ja["rank"].get("mean")
                m[f"{path}_JA_{sc}_share_rank1"] = ja["share_rank_1"]
    for name, x in sr.items():
        m[f"{name}_personal_auc_mean"] = x["R-1"]["personal_auc"].get("mean")
        m[f"{name}_population_auc_mean"] = x["R-1"]["population_auc"].get("mean")
        for base in ("personal_auc", "population_auc"):
            for stat in ("mean_ci95", "median_ci95"):
                ci = x["R-1"][base].get(stat)
                m[f"{name}_{base}_{stat}_covers_0.5"] = bool(ci and ci[0] <= 0.5 <= ci[1])
        if "trunkLean" in x["R-2"]:
            m[f"{name}_stddiff_trunkLean_median"] = x["R-2"]["trunkLean"]["stddiff"].get("median")
    return m


def run_shuffled(seeds: list, inject: bool, tag: str) -> list:
    rows = []
    for s in seeds:
        out = DEV / f"{tag}_seed{s}"
        rec = compute("shuffled", out, s, inject)
        sj, sr = stats.main(str(rec), str(out))
        rows.append({"seed": s, **key_metrics(sj, sr)})
        print(f"  {tag} seed {s}: Holm rejections {rows[-1]['holm_rejections_at_0.05']}, "
              f"B S0 mean rank {rows[-1].get('B_JA_S0_mean_rank', float('nan')):.2f}, "
              f"squat personal AUC {rows[-1].get('squat_primary_personal_auc_mean', float('nan')):.3f}", flush=True)
    return rows


def aggregate(rows: list) -> dict:
    out = {"runs": len(rows)}
    for k in rows[0]:
        if k == "seed":
            continue
        v = [r[k] for r in rows if r[k] is not None]
        if v and isinstance(v[0], bool):
            out[k] = {"share_true": float(np.mean(v))}
        elif v:
            out[k] = {"mean": float(np.mean(v)), "min": float(np.min(v)), "max": float(np.max(v))}
    out["share_of_runs_with_any_holm_rejection"] = float(np.mean([r["holm_rejections_at_0.05"] > 0 for r in rows]))
    return out


def cmd_freeze() -> None:
    bad = freeze.verify_protocol()
    if bad:
        sys.exit("protocol freeze does not verify:\n" + "\n".join(bad))
    commit = subprocess.run(["git", "log", "-1", "--format=%H", "--", "research/protocols/phase4b_protocol_freeze.json"],
                            cwd=REPO, capture_output=True, text=True, check=True).stdout.strip()
    null = json.loads((DEV / "null_check.json").read_text(encoding="utf-8"))
    pos = json.loads((DEV / "positive_control.json").read_text(encoding="utf-8"))
    data = {
        "what": "Phase 4B analysis freeze: the analysis code as verified on shuffled labels, before the single real-label run.",
        "frozen_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "protocol_freeze_commit": commit,
        "protocol_freeze_file": {"git_blob": freeze.git_blob("research/protocols/phase4b_protocol_freeze.json"),
                                 "sha256_raw": sha256(freeze.PROTOCOL_FREEZE)},
        "analysis_code": {rel: freeze.describe(rel) for rel in ANALYSIS_CODE},
        "bootstrap": {"resamples": stats.BOOT, "seed": stats.SEED},
        "shuffled_label_verification": {"null_check": null["aggregate"], "null_check_seeds": [r["seed"] for r in null["rows"]],
                                        "positive_control": pos["aggregate"], "positive_control_injected": pos["injected"],
                                        "positive_control_seeds": [r["seed"] for r in pos["rows"]]},
    }
    ANALYSIS_FREEZE.write_text(json.dumps(data, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {ANALYSIS_FREEZE.relative_to(REPO)} (protocol-freeze commit {commit[:12]})")


def verify_analysis() -> list:
    if not ANALYSIS_FREEZE.exists():
        return ["no analysis freeze"]
    a = json.loads(ANALYSIS_FREEZE.read_text(encoding="utf-8"))
    bad = freeze.verify_protocol()
    if freeze.git_blob("research/protocols/phase4b_protocol_freeze.json") != a["protocol_freeze_file"]["git_blob"]:
        bad.append("protocol freeze file changed")
    for rel, d in a["analysis_code"].items():
        if freeze.git_blob(rel) != d["git_blob"]:
            bad.append(f"analysis code changed: {rel}")
    anc = subprocess.run(["git", "merge-base", "--is-ancestor", a["protocol_freeze_commit"], "HEAD"], cwd=REPO)
    if anc.returncode:
        bad.append("the protocol-freeze commit is not in this branch's history")
    return bad


def cmd_actual() -> None:
    bad = verify_analysis()
    if bad:
        sys.exit("refusing the real-label run:\n" + "\n".join(bad))
    a = json.loads(ANALYSIS_FREEZE.read_text(encoding="utf-8"))
    env = {"PHASE4B_ANALYSIS_FREEZE_SHA256": sha256(ANALYSIS_FREEZE)}
    if RESULTS.exists() and any(RESULTS.iterdir()):
        sys.exit(f"{RESULTS.relative_to(REPO)} already holds results; the real-label run happens once")
    rec = compute("actual", ACTUAL_RECORDS, env=env)
    stats.main(str(rec), str(RESULTS), {"freeze": {"protocol_freeze_commit": a["protocol_freeze_commit"],
                                                   "analysis_freeze_sha256": env["PHASE4B_ANALYSIS_FREEZE_SHA256"]}})
    print(f"wrote {RESULTS.relative_to(REPO)}")


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cmd = sys.argv[1]
    opt = dict(zip(sys.argv[2::2], sys.argv[3::2]))
    if cmd == "dev":
        rows = run_shuffled([int(opt.get("--seed", 1))], "--inject" in sys.argv, "dev")
        print(json.dumps(rows[0], indent=1))
    elif cmd == "null-check":
        rows = run_shuffled(parse_seeds(opt.get("--seeds", "1-100")), False, "null")
        (DEV / "null_check.json").write_text(json.dumps({"rows": rows, "aggregate": aggregate(rows)}, indent=1), encoding="utf-8")
        for p in DEV.glob("null_seed*"):
            shutil.rmtree(p)  # keep only the summary; every run is reproducible from its seed
        print(f"wrote {(DEV / 'null_check.json').relative_to(REPO)}")
    elif cmd == "positive-control":
        rows = run_shuffled(parse_seeds(opt.get("--seeds", "1-5")), True, "positive")
        rec = json.loads((DEV / f"positive_seed{rows[0]['seed']}" / "records.json").read_text(encoding="utf-8"))
        (DEV / "positive_control.json").write_text(json.dumps({"injected": rec["inject"], "rows": rows, "aggregate": aggregate(rows)},
                                                              indent=1), encoding="utf-8")
        print(f"wrote {(DEV / 'positive_control.json').relative_to(REPO)}")
    elif cmd == "freeze":
        cmd_freeze()
    elif cmd == "verify":
        bad = verify_analysis()
        print("analysis freeze: all files match" if not bad else "\n".join(bad))
        sys.exit(1 if bad else 0)
    elif cmd == "actual":
        cmd_actual()
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
