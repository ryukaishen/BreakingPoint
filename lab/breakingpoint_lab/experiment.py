"""Monte-Carlo sweep shard runner.

One *shard* = `sessions` simulated sessions, split into fixed-size *blocks*.
Each block is generated from its own seed, SeedSequence([base_seed, shard_index, block_index]),
so results are bit-for-bit reproducible and independent of how many worker
processes are used. Even-numbered blocks form the SELECTION split, odd-numbered
blocks the held-out EVALUATION split.

Each block: generate sessions -> for every drift-score variant compute the
personalized drift sequences once -> evaluate every detector configuration on
those same sessions (common random numbers) -> accumulate counts/histograms.
The shard result is written atomically to results/shards/shard_XXXXX.npz so a
failed Slurm array task never corrupts other shards.
"""
from __future__ import annotations

import json
import math
import os
import time
from multiprocessing import get_context
from pathlib import Path
from typing import Dict, Optional

import numpy as np

from . import __version__
from .core import make_config
from .evaluate import StatsAccumulator
from .grid import MODE_COMPLEXITY, VARIANTS, build_grid, config_id, grid_hash, group_by_mode, variant_name
from .simulate import GENERATOR_VERSION, SPECS, balanced_scenarios, generate_sessions
from .vectorized import config_to_params, personal_drift, run_detector_batch, spec_arrays

MAX_ELEMS = 1_500_000  # configs x sessions per detector batch (memory bound)


def process_block(job: Dict) -> StatsAccumulator:
    base_seed, shard, block, size, offset, grid_name = (job[k] for k in
                                                         ("base_seed", "shard", "block", "size", "offset", "grid"))
    rng = np.random.default_rng(np.random.SeedSequence([base_seed, shard, block]))
    batch = generate_sessions(rng, balanced_scenarios(size, offset=offset))
    split = block % 2
    grid = build_grid(grid_name)
    groups = group_by_mode(grid)
    sa = spec_arrays(SPECS)
    acc = StatsAccumulator(len(VARIANTS), len(grid))
    acc.add_counts(split, batch.scenario)
    chunk = max(1, MAX_ELEMS // max(1, batch.n))
    for v, (weighting, missing) in enumerate(VARIANTS):
        cfg = make_config(feature_weighting=weighting, missing_feature_handling=missing)
        D, mu0, sigma0 = personal_drift(batch.XC, batch.QC, batch.ncal, batch.X, batch.Q, sa, cfg)
        acc.add_unscored(split, v, D, batch.T)
        for mode, idxs in groups:
            for i0 in range(0, len(idxs), chunk):
                sel = np.asarray(idxs[i0:i0 + chunk])
                params = config_to_params([grid[i] for i in sel])
                alarm, onset, _ = run_detector_batch(D, mu0, sigma0, params, mode)
                acc.add(split, v, sel, alarm, onset, batch.scenario, batch.tau)
    return acc


def shard_path(out_dir: Path, shard: int) -> Path:
    return Path(out_dir) / "shards" / f"shard_{shard:05d}.npz"


def run_shard(sessions: int, base_seed: int, shard: int = 0, workers: int = 1, out_dir: Path = Path("results"),
              grid_name: str = "full", block_size: int = 250, resume: bool = False, log=print) -> Path:
    out = shard_path(out_dir, shard)
    if resume and out.exists():
        log(f"[shard {shard}] exists, skipping (--resume)")
        return out
    out.parent.mkdir(parents=True, exist_ok=True)
    grid = build_grid(grid_name)
    n_blocks = max(1, math.ceil(sessions / block_size))
    jobs = []
    for b in range(n_blocks):
        size = min(block_size, sessions - b * block_size)
        if size <= 0:
            break
        jobs.append({"base_seed": base_seed, "shard": shard, "block": b, "size": size,
                     "offset": b * block_size, "grid": grid_name})
    log(f"[shard {shard}] {sessions} sessions in {len(jobs)} blocks x {len(grid)} configs x {len(VARIANTS)} variants "
        f"on {workers} worker(s)")
    t0 = time.time()
    total = StatsAccumulator(len(VARIANTS), len(grid))
    done = 0
    if workers > 1 and len(jobs) > 1:
        ctx = get_context("spawn" if os.name == "nt" else "fork")
        with ctx.Pool(processes=min(workers, len(jobs))) as pool:
            for acc in pool.imap_unordered(process_block, jobs):
                total.merge(acc)
                done += 1
                if done % max(1, len(jobs) // 10) == 0 or done == len(jobs):
                    log(f"[shard {shard}] {done}/{len(jobs)} blocks ({time.time() - t0:.1f}s)")
    else:
        for job in jobs:
            total.merge(process_block(job))
            done += 1
            if done % max(1, len(jobs) // 10) == 0 or done == len(jobs):
                log(f"[shard {shard}] {done}/{len(jobs)} blocks ({time.time() - t0:.1f}s)")
    meta = {
        "shard": shard, "sessions": sessions, "base_seed": base_seed, "block_size": block_size,
        "grid": grid_name, "grid_hash": grid_hash(grid), "n_configs": len(grid),
        "variants": [variant_name(v) for v in VARIANTS], "generator_version": GENERATOR_VERSION,
        "lab_version": __version__, "seconds": round(time.time() - t0, 2), "workers": workers,
        "created": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    tmp = out.with_name(out.stem + ".tmp.npz")
    np.savez_compressed(tmp, meta=np.array(json.dumps(meta)), **total.to_dict())
    os.replace(tmp, out)
    log(f"[shard {shard}] wrote {out} in {meta['seconds']}s")
    return out


def load_shards(out_dir: Path, expected_hash: Optional[str] = None, log=print):
    paths = sorted((Path(out_dir) / "shards").glob("shard_*.npz"))
    paths = [p for p in paths if ".tmp" not in p.name]
    if not paths:
        raise FileNotFoundError(f"No shard files in {Path(out_dir) / 'shards'}")
    total: Optional[StatsAccumulator] = None
    metas = []
    for p in paths:
        try:
            with np.load(p, allow_pickle=False) as z:
                meta = json.loads(str(z["meta"]))
                if expected_hash and meta["grid_hash"] != expected_hash:
                    log(f"  ! {p.name}: grid hash {meta['grid_hash']} != {expected_hash}, skipped")
                    continue
                acc = StatsAccumulator.from_dict({k: z[k] for k in StatsAccumulator.FIELDS})
        except Exception as exc:  # corrupt / partial file from a failed task
            log(f"  ! {p.name}: unreadable ({exc}), skipped")
            continue
        if total is None:
            total = acc
            ref_hash = meta["grid_hash"]
        else:
            if meta["grid_hash"] != ref_hash:
                log(f"  ! {p.name}: grid hash mismatch, skipped")
                continue
            total.merge(acc)
        metas.append(meta)
    if total is None:
        raise RuntimeError("No usable shards.")
    return total, metas


def describe_grid(grid_name: str = "full"):
    grid = build_grid(grid_name)
    complexity = np.array([MODE_COMPLEXITY[c["mode"]] for c in grid])
    ids = [config_id(c) for c in grid]
    return grid, complexity, ids
