"""Detector hyper-parameter grid and drift-score variants for the sweep."""
from __future__ import annotations

import hashlib
import itertools
import json
from typing import Dict, List, Sequence, Tuple

GRIDS: Dict[str, Dict[str, Dict[str, list]]] = {
    "full": {
        "ewma": {"alpha": [0.2, 0.3, 0.4, 0.5, 0.6], "bp": [1.5, 2.0, 2.5, 3.0, 3.5],
                 "warn": [1.0, 1.5, 2.0], "m": [0, 1, 2, 3], "clip": [2.5, 3.0, 4.0, None]},
        "cusum": {"k": [0.25, 0.5, 0.75, 1.0], "h": [2.0, 3.0, 4.0, 5.0, 6.0, 8.0],
                  "warn": [1.0, 1.5, 2.0], "m": [0, 1, 2, 3], "clip": [2.5, 3.0, 4.0, None]},
        "combined": {"alpha": [0.3, 0.4, 0.5], "bp": [1.5, 2.0, 2.5, 3.0], "k": [0.25, 0.5, 0.75],
                     "h": [2.0, 3.0, 4.0, 5.0], "warn": [1.0, 1.5, 2.0], "m": [0, 1, 2], "clip": [3.0, 4.0, None]},
        "consecutive": {"bp": [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0], "m": [1, 2, 3, 4]},
    },
    # Small grid for unit tests / smoke runs.
    "quick": {
        "ewma": {"alpha": [0.3, 0.5], "bp": [2.0, 3.0], "warn": [1.5], "m": [0, 2], "clip": [3.0, None]},
        "cusum": {"k": [0.5, 1.0], "h": [3.0, 5.0], "warn": [1.5], "m": [0, 2], "clip": [3.0, None]},
        "combined": {"alpha": [0.4], "bp": [2.0, 2.5], "k": [0.5], "h": [3.0, 4.0], "warn": [1.5], "m": [0, 2],
                     "clip": [4.0]},
        "consecutive": {"bp": [2.0, 3.0], "m": [1, 2, 3]},
    },
}

# (feature_weighting, missing_feature_handling). The first entry is the primary variant.
VARIANTS: List[Tuple[str, str]] = [
    ("grouped_quality", "drop"),
    ("equal", "drop"),
    ("grouped", "drop"),
    ("grouped_quality", "impute"),
    ("grouped_quality", "skip_rep"),
]

MODE_COMPLEXITY = {"consecutive": 0, "ewma": 1, "cusum": 1, "combined": 2}


def variant_name(v: Tuple[str, str]) -> str:
    return f"{v[0]}+{v[1]}"


def _det(mode, alpha=0.4, k=0.5, h=4.0, warn=1.5, bp=2.5, m=0, clip=None) -> dict:
    return {
        "mode": mode, "ewma_alpha": float(alpha), "cusum_k": float(k), "cusum_h": float(h),
        "warning_threshold": float(warn), "breakpoint_threshold": float(bp),
        "minimum_persistent_reps": int(m), "outlier_clip": None if clip is None else float(clip),
    }


def build_grid(name: str = "full") -> List[dict]:
    g = GRIDS[name]
    out: List[dict] = []
    e = g["ewma"]
    for a, bp, w, m, cl in itertools.product(e["alpha"], e["bp"], e["warn"], e["m"], e["clip"]):
        if w < bp:
            out.append(_det("ewma", alpha=a, warn=w, bp=bp, m=m, clip=cl))
    c = g["cusum"]
    for k, h, w, m, cl in itertools.product(c["k"], c["h"], c["warn"], c["m"], c["clip"]):
        out.append(_det("cusum", k=k, h=h, warn=w, m=m, clip=cl))
    b = g["combined"]
    for a, bp, k, h, w, m, cl in itertools.product(b["alpha"], b["bp"], b["k"], b["h"], b["warn"], b["m"], b["clip"]):
        if w < bp:
            out.append(_det("combined", alpha=a, k=k, h=h, warn=w, bp=bp, m=m, clip=cl))
    s = g["consecutive"]
    for bp, m in itertools.product(s["bp"], s["m"]):
        out.append(_det("consecutive", warn=max(0.5, bp - 0.5), bp=bp, m=m, clip=None))
    return out


def config_id(c: dict) -> str:
    clip = "none" if c["outlier_clip"] is None else f"{c['outlier_clip']:g}"
    mode = c["mode"]
    if mode == "ewma":
        return f"ewma|a={c['ewma_alpha']:g}|bp={c['breakpoint_threshold']:g}|w={c['warning_threshold']:g}|m={c['minimum_persistent_reps']}|clip={clip}"
    if mode == "cusum":
        return f"cusum|k={c['cusum_k']:g}|h={c['cusum_h']:g}|w={c['warning_threshold']:g}|m={c['minimum_persistent_reps']}|clip={clip}"
    if mode == "consecutive":
        return f"consecutive|bp={c['breakpoint_threshold']:g}|n={max(1, c['minimum_persistent_reps'])}"
    return (f"combined|a={c['ewma_alpha']:g}|bp={c['breakpoint_threshold']:g}|k={c['cusum_k']:g}|h={c['cusum_h']:g}"
            f"|w={c['warning_threshold']:g}|m={c['minimum_persistent_reps']}|clip={clip}")


def group_by_mode(grid: Sequence[dict]) -> List[Tuple[str, List[int]]]:
    groups: Dict[str, List[int]] = {}
    for i, c in enumerate(grid):
        groups.setdefault(c["mode"], []).append(i)
    return list(groups.items())


def grid_hash(grid: Sequence[dict], variants: Sequence[Tuple[str, str]] = VARIANTS, extra: str = "") -> str:
    payload = json.dumps({"grid": list(grid), "variants": list(variants), "extra": extra}, sort_keys=True)
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:16]
