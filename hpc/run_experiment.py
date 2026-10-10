#!/usr/bin/env python3
"""BreakingPoint Lab — Monte-Carlo detector validation (one shard, or a full local run).

Local, everything in one go (sweep + merge + figures + config export):
    python hpc/run_experiment.py --sessions 1000 --seed 42 --run-name my-local-run

HiPerGator array task (called by hpc/sweep.slurm; shard index = SLURM_ARRAY_TASK_ID):
    python hpc/run_experiment.py --stage sweep --sessions 10000 --seed 42 --out results/runs/<run-name>

Outputs go to results/runs/<run-name>/ (see hpc/output_guard.py). A run never writes over the
archived studies in results/ or the app files in public/; the exported config is copied into
the app only with --install.

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
sys.path.insert(0, str(REPO / "hpc"))

from breakingpoint_lab.experiment import run_shard  # noqa: E402
from breakingpoint_lab.finalize import finalize  # noqa: E402
from output_guard import OutputGuardError, check_not_finished, install_target, resolve_output_dir  # noqa: E402


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
    p.add_argument("--run-name", default=None,
                   help="name of this run; outputs go to results/runs/<run-name>/ (default: local-<UTC time>)")
    p.add_argument("--out", type=Path, default=None,
                   help="explicit output folder instead of --run-name (results/runs/<name>/ or outside the repo)")
    p.add_argument("--overwrite-run", action="store_true",
                   help="allow replacing a run folder that already holds finished results")
    p.add_argument("--grid", choices=["full", "quick"], default="full", help="hyper-parameter grid")
    p.add_argument("--block-size", type=int, default=250, help="sessions per block (seed unit)")
    p.add_argument("--resume", action="store_true", help="skip if this shard's output already exists")
    p.add_argument("--eval-sessions", type=int, default=4000, help="[all] per-session analysis set size")
    p.add_argument("--robustness-sessions", type=int, default=1000, help="[all] sessions per robustness level")
    p.add_argument("--install", action="store_true",
                   help="[all] copy the exported config and figures into public/, replacing the app's active detector")
    p.add_argument("--no-install", action="store_true",
                   help="[all] accepted for older scripts; not installing is now the default")
    a = p.parse_args()
    if a.install and a.no_install:
        p.error("--install and --no-install contradict each other")
    try:
        a.out = resolve_output_dir(a.out, a.run_name)
        check_not_finished(a.out, a.overwrite_run)
    except OutputGuardError as e:
        p.error(str(e))

    t0 = time.time()
    print(f"BreakingPoint Lab | stage={a.stage} shard={a.shard_index} sessions={a.sessions:,} seed={a.seed} "
          f"workers={a.workers} grid={a.grid}", flush=True)
    print(f"output folder: {a.out}", flush=True)
    log = lambda *x: print(*x, flush=True)  # noqa: E731
    if a.stage == "all":
        # A local run owns its run folder: clear stale shards left in that folder by an earlier attempt.
        shard_dir = a.out / "shards"
        if shard_dir.exists() and not a.resume:
            for f in shard_dir.glob("shard_*.npz"):
                f.unlink()
    run_shard(a.sessions, a.seed, a.shard_index, a.workers, a.out, a.grid, a.block_size, a.resume, log=log)
    if a.stage == "all":
        finalize(a.out, grid_name=a.grid, eval_sessions=a.eval_sessions, robustness_sessions=a.robustness_sessions,
                 workers=a.workers, seed=a.seed,
                 install_to=install_target(a.install), log=log)
    print(f"done in {time.time() - t0:.1f}s", flush=True)


if __name__ == "__main__":
    main()
