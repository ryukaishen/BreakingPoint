"""Export a cross-language parity fixture.

The Lab validates the detector in Python; the athlete runs it in TypeScript.
This script runs simulated sessions (including missing and low-confidence
features) through the Python reference implementation and writes every
intermediate result to tests/fixtures/parity_fixture.json. The TypeScript test
suite (tests/parity.test.ts) replays the same inputs through the app's code and
asserts identical baselines, drift scores, detector states and alarm reps.

    python -m breakingpoint_lab.parity          (from the lab/ directory)
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from .core import REPO_ROOT, build_baseline, drift_score, make_config, run_detector
from .simulate import KEYS, SPECS, A, B, C, D, E, F, G, H, generate_sessions

FIXTURE_PATH = REPO_ROOT / "tests" / "fixtures" / "parity_fixture.json"

PARITY_CONFIGS = [
    make_config(),
    make_config(mode="ewma", ewma_alpha=0.6, breakpoint_threshold=2.5, warning_threshold=1.0,
                minimum_persistent_reps=3, outlier_clip=3.0),
    make_config(mode="cusum", cusum_k=0.25, cusum_h=8.0, warning_threshold=1.0, minimum_persistent_reps=3,
                outlier_clip=2.5),
    make_config(mode="consecutive", breakpoint_threshold=1.0, warning_threshold=0.5, minimum_persistent_reps=4,
                outlier_clip=None),
    make_config(feature_weighting="equal", missing_feature_handling="impute"),
    make_config(feature_weighting="grouped", missing_feature_handling="skip_rep", outlier_clip=None,
                minimum_persistent_reps=0),
]


def _num(x):
    return None if x is None or (isinstance(x, float) and not math.isfinite(x)) else x


def _reps(X, Q, n):
    return [{"values": {k: (None if not np.isfinite(X[r, j]) else float(X[r, j])) for j, k in enumerate(KEYS)},
             "quality": {k: float(Q[r, j]) for j, k in enumerate(KEYS)}} for r in range(n)]


def make_fixture(path: Path = FIXTURE_PATH, seed: int = 2026) -> Path:
    rng = np.random.default_rng(seed)
    scen = [A, B, C, D, E, F, G, H] * 2
    batch = generate_sessions(rng, scen)
    sessions = []
    for i in range(batch.n):
        ncal = int(batch.ncal[i])
        if i == 0:
            ncal = 3  # exercises the default-reference branch (too few calibration reps)
        sessions.append({"scenario": int(batch.scenario[i]), "tau": int(batch.tau[i]),
                         "calibration": _reps(batch.XC[i], batch.QC[i], ncal),
                         "monitoring": _reps(batch.X[i], batch.Q[i], int(batch.T[i]))})
    expected = []
    for cfg in PARITY_CONFIGS:
        per_cfg = []
        for s in sessions:
            bl = build_baseline(s["calibration"], SPECS, cfg)
            ref = bl["reference"]
            scores = [drift_score(r, bl["features"], SPECS, cfg)["score"] for r in s["monitoring"]]
            det = run_detector(cfg, ref["mu0"], ref["sigma0"], scores)
            per_cfg.append({
                "baseline": {k: (None if v is None else {"center": v["center"], "scale": v["scale"]})
                             for k, v in bl["features"].items()},
                "mu0": ref["mu0"], "sigma0": ref["sigma0"], "reference_source": ref["source"],
                "loo_scores": ref["loo_scores"],
                "scores": [_num(x) for x in scores],
                "states": [st["state"] for st in det.steps],
                "ewma": [st["ewma"] for st in det.steps],
                "cusum": [st["cusum"] for st in det.steps],
                "alarm_rep": det.alarm_rep, "onset_rep": det.onset_rep, "first_warn_rep": det.first_warn_rep,
            })
        expected.append(per_cfg)
    payload = {"generated_by": "lab/breakingpoint_lab/parity.py", "seed": seed, "exercise": "squat",
               "configs": PARITY_CONFIGS, "sessions": sessions, "expected": expected}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, allow_nan=False), encoding="utf-8")
    return path


if __name__ == "__main__":
    print(f"wrote {make_fixture()}")
