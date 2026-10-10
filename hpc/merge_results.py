#!/usr/bin/env python3
"""Merge all shard results, select the operating configuration, and produce every
validation artifact in the run folder (results/runs/<run-name>/):

    summary.csv                         headline metrics + run metadata
    config_results.csv                  every (detector, drift-score variant) configuration
    scenario_results.csv                per-scenario metrics for the featured detectors
    robustness_results.csv              noise / outlier / dropout sweeps
    ablation_results.csv                detector-family and drift-score ablation
    breakingpoint_detector_config.json  exported detector config (copied into the app only with --install)
    VALIDATION_REPORT.md                human-readable report
    figures/*.png|pdf                   figures

Missing or corrupt shards (e.g. a failed array task) are skipped and reported;
re-run only that task with `--resume` semantics and merge again.

Usage:
    python hpc/merge_results.py --run-name <run-name> --workers 8

The archived studies in results/ and the app files in public/ are never written to (see
hpc/output_guard.py).
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "lab"))
sys.path.insert(0, str(REPO / "hpc"))

from breakingpoint_lab.finalize import finalize  # noqa: E402
from output_guard import OutputGuardError, check_not_finished, install_target, resolve_output_dir  # noqa: E402


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--run-name", default=None, help="the run to merge: results/runs/<run-name>/")
    p.add_argument("--out", type=Path, default=None, help="explicit run folder instead of --run-name")
    p.add_argument("--overwrite-run", action="store_true", help="allow replacing finished results in the run folder")
    p.add_argument("--grid", choices=["full", "quick"], default="full")
    p.add_argument("--eval-sessions", type=int, default=20000, help="per-session analysis set size")
    p.add_argument("--robustness-sessions", type=int, default=5000, help="sessions per robustness level and class")
    p.add_argument("--workers", type=int, default=int(os.environ.get("SLURM_CPUS_PER_TASK", min(8, os.cpu_count() or 1))))
    p.add_argument("--seed", type=int, default=None, help="seed for eval/robustness sets (default: sweep base seed)")
    p.add_argument("--install", action="store_true",
                   help="copy the exported config and figures into public/, replacing the app's active detector")
    p.add_argument("--no-install", action="store_true", help="accepted for older scripts; not installing is the default")
    a = p.parse_args()
    if a.install and a.no_install:
        p.error("--install and --no-install contradict each other")
    if a.out is None and a.run_name is None:
        p.error("name the run to merge with --run-name (or --out)")
    try:
        a.out = resolve_output_dir(a.out, a.run_name)
        check_not_finished(a.out, a.overwrite_run)
    except OutputGuardError as e:
        p.error(str(e))
    print(f"run folder: {a.out}", flush=True)
    finalize(a.out, grid_name=a.grid, eval_sessions=a.eval_sessions, robustness_sessions=a.robustness_sessions,
             workers=a.workers, seed=a.seed,
             install_to=install_target(a.install),
             log=lambda *x: print(*x, flush=True))


if __name__ == "__main__":
    main()
