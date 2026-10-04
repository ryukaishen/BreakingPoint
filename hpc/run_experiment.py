#!/usr/bin/env python3
"""BreakingPoint Lab — Monte-Carlo detector validation (one shard, or a full local run).

Local, everything in one go (sweep + merge + figures + config export):
    python hpc/run_experiment.py --sessions 1000 --seed 42

HiPerGator array task (called by hpc/sweep.slurm; shard index = SLURM_ARRAY_TASK_ID):
    python hpc/run_experiment.py --stage sweep --sessions 10000 --seed 42

Seeds: every block of sessions is generated from SeedSequence([seed, shard_index, block_index]),
so any shard can be re-run independently and reproduces bit-for-bit.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "lab"))

from breakingpoint_lab.experiment import run_shard  # noqa: E402
from breakingpoint_lab.finalize import finalize  # noqa: E402


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except ValueError:
        return default


def main() -> None:
    in_array = "SLURM_ARRAY_TASK_ID" in os.environ
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--sessions", type=int, default=1000, help="simulated sessions in this shard (default 1000)")
    p.add_argument("--seed", type=int, default=42, help="base random seed shared by all shards (default 42)")
    p.add_argument("--shard-index", type=int, default=env_int("SLURM_ARRAY_TASK_ID", 0),
                   help="shard id (defaults to $SLURM_ARRAY_TASK_ID, else 0)")
    p.add_argument("--workers", type=int,
                   default=env_int("SLURM_CPUS_PER_TASK", min(8, os.cpu_count() or 1)),
                   help="worker processes (defaults to $SLURM_CPUS_PER_TASK, else min(8, cores))")
    p.add_argument("--stage", choices=["all", "sweep"], default="sweep" if in_array else "all",
                   help="'sweep' = write one shard only; 'all' = sweep + merge + figures + export")
    p.add_argument("--out", type=Path, default=REPO / "results", help="results directory")
    p.add_argument("--grid", choices=["full", "quick"], default="full", help="hyper-parameter grid")
    p.add_argument("--block-size", type=int, default=250, help="sessions per block (seed unit)")
    p.add_argument("--resume", action="store_true", help="skip if this shard's output already exists")
    p.add_argument("--eval-sessions", type=int, default=4000, help="[all] per-session analysis set size")
    p.add_argument("--robustness-sessions", type=int, default=1000, help="[all] sessions per robustness level")
    p.add_argument("--no-install", action="store_true",
                   help="[all] do not copy the exported config into public/ for the web app")
    a = p.parse_args()

    t0 = time.time()
    print(f"BreakingPoint Lab | stage={a.stage} shard={a.shard_index} sessions={a.sessions:,} seed={a.seed} "
          f"workers={a.workers} grid={a.grid}", flush=True)
    log = lambda *x: print(*x, flush=True)  # noqa: E731
    if a.stage == "all":
        # A local run owns the results directory: clear stale shards from earlier runs first.
        shard_dir = a.out / "shards"
        if shard_dir.exists() and not a.resume:
            for f in shard_dir.glob("shard_*.npz"):
                f.unlink()
    run_shard(a.sessions, a.seed, a.shard_index, a.workers, a.out, a.grid, a.block_size, a.resume, log=log)
    if a.stage == "all":
        finalize(a.out, grid_name=a.grid, eval_sessions=a.eval_sessions, robustness_sessions=a.robustness_sessions,
                 workers=a.workers, seed=a.seed,
                 install_to=None if a.no_install else REPO / "public" / "breakingpoint_detector_config.json", log=log)
    print(f"done in {time.time() - t0:.1f}s", flush=True)


if __name__ == "__main__":
    main()
