#!/usr/bin/env python3
"""Merge all shard results, select the operating configuration, and produce every
validation artifact:

    results/summary.csv                         headline metrics + run metadata
    results/config_results.csv                  every (detector, drift-score variant) configuration
    results/scenario_results.csv                per-scenario metrics for the featured detectors
    results/robustness_results.csv              noise / outlier / dropout sweeps
    results/ablation_results.csv                detector-family and drift-score ablation
    results/breakingpoint_detector_config.json  config loaded by the BreakingPoint web app
    results/VALIDATION_REPORT.md                human-readable report with pitch-ready numbers
    results/figures/*.png|pdf                   publication-quality figures

Missing or corrupt shards (e.g. a failed array task) are skipped and reported;
re-run only that task with `--resume` semantics and merge again.

Usage:
    python hpc/merge_results.py --out results --workers 8
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "lab"))

from breakingpoint_lab.finalize import finalize  # noqa: E402


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out", type=Path, default=REPO / "results")
    p.add_argument("--grid", choices=["full", "quick"], default="full")
    p.add_argument("--eval-sessions", type=int, default=20000, help="per-session analysis set size")
    p.add_argument("--robustness-sessions", type=int, default=5000, help="sessions per robustness level and class")
    p.add_argument("--workers", type=int, default=int(os.environ.get("SLURM_CPUS_PER_TASK", min(8, os.cpu_count() or 1))))
    p.add_argument("--seed", type=int, default=None, help="seed for eval/robustness sets (default: sweep base seed)")
    p.add_argument("--no-install", action="store_true", help="do not copy the config into public/")
    a = p.parse_args()
    finalize(a.out, grid_name=a.grid, eval_sessions=a.eval_sessions, robustness_sessions=a.robustness_sessions,
             workers=a.workers, seed=a.seed,
             install_to=None if a.no_install else REPO / "public" / "breakingpoint_detector_config.json",
             log=lambda *x: print(*x, flush=True))


if __name__ == "__main__":
    main()
