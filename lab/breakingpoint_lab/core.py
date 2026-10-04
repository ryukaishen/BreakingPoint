"""Scalar reference implementation of the BreakingPoint statistical core.

This module mirrors the TypeScript code that runs in the browser
(src/baseline/baseline.ts, src/detection/driftScore.ts,
src/detection/detector.ts) line for line. It is deliberately written with
plain Python loops so it is easy to audit against the TypeScript source.

The Monte-Carlo sweeps use the numpy implementation in ``vectorized.py``;
tests assert that both implementations agree, and ``parity.py`` exports
fixtures that the TypeScript test-suite replays, so the Lab validates exactly
the detector that BreakingPoint Edge runs.
"""
from __future__ import annotations

import copy
import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

REPO_ROOT = Path(__file__).resolve().parents[2]
CATALOG_PATH = REPO_ROOT / "shared" / "feature_catalog.json"
DEFAULT_CONFIG_PATH = REPO_ROOT / "shared" / "default_detector_config.json"

MIN_BASELINE_VALUES = 3
MIN_CALIBRATION_REPS = 4
MAD_TO_SD = 1.4826

STABLE, DRIFT, BREAKPOINT = "STABLE", "DRIFT", "BREAKPOINT"


# --------------------------------------------------------------------------
# Catalog / config
# --------------------------------------------------------------------------
def load_catalog() -> Dict[str, Any]:
    with open(CATALOG_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


def feature_specs(exercise: str = "squat") -> List[Dict[str, Any]]:
    return load_catalog()["exercises"][exercise]["features"]


def load_default_config() -> Dict[str, Any]:
    with open(DEFAULT_CONFIG_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


def make_config(**overrides: Any) -> Dict[str, Any]:
    """Default detector config (snake_case, same schema as the exported JSON)."""
    cfg = copy.deepcopy(load_default_config())
    for k, v in overrides.items():
        cfg[k] = v
    return cfg


# --------------------------------------------------------------------------
# Small stats helpers (same arithmetic order as src/utils/stats.ts)
# --------------------------------------------------------------------------
def is_num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def clamp(x: float, lo: float, hi: float) -> float:
    return min(hi, max(lo, x))


def mean(xs: Sequence[float]) -> float:
    if not xs:
        return float("nan")
    s = 0.0
    for x in xs:
        s += x
    return s / len(xs)


def median(xs: Sequence[float]) -> float:
    if not xs:
        return float("nan")
    a = sorted(xs)
    m = len(a) >> 1
    return a[m] if len(a) % 2 else (a[m - 1] + a[m]) / 2


def sample_sd(xs: Sequence[float]) -> float:
    if len(xs) < 2:
        return 0.0
    m = mean(xs)
    s = 0.0
    for x in xs:
        s += (x - m) * (x - m)
    return math.sqrt(s / (len(xs) - 1))


def mad(xs: Sequence[float], center: Optional[float] = None) -> float:
    c = median(xs) if center is None else center
    return median([abs(x - c) for x in xs])


# --------------------------------------------------------------------------
# Baseline
# --------------------------------------------------------------------------
def feature_is_valid(rep: Dict[str, Any], key: str, quality_min: float) -> bool:
    v = rep["values"].get(key)
    q = rep.get("quality", {}).get(key, 1.0)
    return is_num(v) and q >= quality_min


def feature_baseline(values: Sequence[float], spec: Dict[str, Any]) -> Optional[Dict[str, float]]:
    if len(values) < MIN_BASELINE_VALUES:
        return None
    med = median(values)
    sd = sample_sd(values)
    m = mad(values, med)
    scale = max(sd, MAD_TO_SD * m, spec["absFloor"], spec["relFloor"] * abs(med))
    return {
        "n": len(values),
        "mean": mean(values),
        "median": med,
        "sd": sd,
        "mad": m,
        "min": min(values),
        "max": max(values),
        "center": med,
        "scale": scale,
    }


def build_feature_baselines(reps: Sequence[Dict[str, Any]], specs: Sequence[Dict[str, Any]], quality_min: float):
    out: Dict[str, Optional[Dict[str, float]]] = {}
    for spec in specs:
        vals = [r["values"][spec["key"]] for r in reps if feature_is_valid(r, spec["key"], quality_min)]
        out[spec["key"]] = feature_baseline(vals, spec)
    return out


# --------------------------------------------------------------------------
# Drift score
# --------------------------------------------------------------------------
def drift_score(rep: Dict[str, Any], baselines: Dict[str, Any], specs: Sequence[Dict[str, Any]], cfg: Dict[str, Any]):
    total_base = 0.0
    covered_base = 0.0
    sum_sq = 0.0
    wsum = 0.0
    skip_rep = False
    deviations = []
    weighting = cfg["feature_weighting"]
    missing = cfg["missing_feature_handling"]
    qmin = cfg["quality_min"]
    zclip = cfg["z_clip"]
    for spec in specs:
        key = spec["key"]
        b = baselines.get(key)
        raw = rep["values"].get(key)
        value = raw if is_num(raw) else None
        q = clamp(rep.get("quality", {}).get(key, 1.0), 0.0, 1.0)
        if not b:
            deviations.append({"key": key, "value": value, "z": None, "used": False, "reason": "no-baseline"})
            continue
        base_w = 1.0 if weighting == "equal" else spec["weight"]
        total_base += base_w
        if value is None or q < qmin:
            if missing == "skip_rep":
                skip_rep = True
            elif missing == "impute":
                wsum += base_w
            deviations.append({"key": key, "value": value, "z": None, "used": False,
                               "reason": "missing" if value is None else "low-quality"})
            continue
        z = (value - b["center"]) / b["scale"]
        zc = clamp(z, -zclip, zclip)
        w = base_w * (q if weighting == "grouped_quality" else 1.0)
        covered_base += base_w
        sum_sq += w * zc * zc
        wsum += w
        deviations.append({"key": key, "value": value, "z": z, "z_clipped": zc, "weight": w, "used": True})
    coverage = covered_base / total_base if total_base > 0 else 0.0
    scored = (not skip_rep) and wsum > 0 and coverage >= cfg["min_coverage"]
    score = math.sqrt(sum_sq / wsum) if scored else None
    return {"score": score, "coverage": coverage, "deviations": deviations}


def drift_reference(reps: Sequence[Dict[str, Any]], specs: Sequence[Dict[str, Any]], cfg: Dict[str, Any]):
    r = cfg["reference"]
    loo: List[float] = []
    if len(reps) >= MIN_CALIBRATION_REPS:
        for i in range(len(reps)):
            others = [rep for j, rep in enumerate(reps) if j != i]
            fb = build_feature_baselines(others, specs, cfg["quality_min"])
            d = drift_score(reps[i], fb, specs, cfg)["score"]
            if d is not None:
                loo.append(d)
    if len(loo) < 3:
        return {"mu0": r["mu0_default"], "sigma0": r["sigma0_default"], "loo_scores": loo, "source": "default"}
    mu0 = clamp(mean(loo), r["mu0_min"], r["mu0_max"])
    sigma0 = clamp(max(sample_sd(loo), r["sigma0_rel_min"] * mu0), r["sigma0_min"], r["sigma0_max"])
    return {"mu0": mu0, "sigma0": sigma0, "loo_scores": loo, "source": "loo"}


def build_baseline(reps: Sequence[Dict[str, Any]], specs: Sequence[Dict[str, Any]], cfg: Dict[str, Any]):
    return {
        "features": build_feature_baselines(reps, specs, cfg["quality_min"]),
        "reference": drift_reference(reps, specs, cfg),
        "n_reps": len(reps),
    }


# --------------------------------------------------------------------------
# Sequential detector (EWMA / CUSUM / combined / consecutive)
# --------------------------------------------------------------------------
class SequentialDetector:
    def __init__(self, cfg: Dict[str, Any], mu0: float, sigma0: float):
        self.cfg = cfg
        self.mu0 = mu0
        self.sigma0 = sigma0
        self.z = 0.0
        self.c = 0.0
        self.run = 0
        self.run_bp = 0
        self.onset_candidate: Optional[int] = None
        self.state = STABLE
        self.alarm_rep: Optional[int] = None
        self.onset_rep: Optional[int] = None
        self.first_warn_rep: Optional[int] = None
        self.steps: List[Dict[str, Any]] = []

    def thresholds(self) -> Dict[str, float]:
        return {
            "mu0": self.mu0,
            "sigma0": self.sigma0,
            "normal_upper": self.mu0 + self.sigma0,
            "warning_level": self.mu0 + self.cfg["warning_threshold"] * self.sigma0,
            "breakpoint_level": self.mu0 + self.cfg["breakpoint_threshold"] * self.sigma0,
        }

    def update(self, rep: int, score: Optional[float]) -> Dict[str, Any]:
        cfg = self.cfg
        if score is None or not math.isfinite(score):
            step = {"rep": rep, "scored": False, "score": None, "ewma": self.z, "cusum": self.c,
                    "run_length": self.run, "state": self.state, "alarm": False}
            self.steps.append(step)
            return step
        s = (score - self.mu0) / self.sigma0
        clip = cfg.get("outlier_clip")
        sc = s if clip is None else clamp(s, -clip, clip)
        a = cfg["ewma_alpha"]
        self.z = a * sc + (1 - a) * self.z
        prev_c = self.c
        self.c = max(0.0, self.c + sc - cfg["cusum_k"])
        if self.c == 0:
            self.onset_candidate = None
        elif prev_c == 0:
            self.onset_candidate = rep
        self.run = self.run + 1 if sc > cfg["warning_threshold"] else 0
        self.run_bp = self.run_bp + 1 if sc > cfg["breakpoint_threshold"] else 0

        m = int(cfg["minimum_persistent_reps"])
        persist_ok = m <= 0 or self.run >= m
        mode = cfg["mode"]
        h = cfg["cusum_h"]
        if mode == "ewma":
            alarm_cond = self.z > cfg["breakpoint_threshold"]
            warn_cond = self.z > cfg["warning_threshold"]
        elif mode == "cusum":
            alarm_cond = self.c > h
            warn_cond = self.c > h / 2
        elif mode == "consecutive":
            alarm_cond = self.run_bp >= max(1, m)
            warn_cond = sc > cfg["warning_threshold"]
            persist_ok = True
        else:  # combined
            alarm_cond = self.z > cfg["breakpoint_threshold"] and self.c > h
            warn_cond = self.z > cfg["warning_threshold"] or self.c > h / 2

        alarm = False
        if self.state != BREAKPOINT:
            if alarm_cond and persist_ok:
                self.state = BREAKPOINT
                self.alarm_rep = rep
                self.onset_rep = self.onset_candidate if self.onset_candidate is not None else rep
                alarm = True
            else:
                self.state = DRIFT if warn_cond else STABLE
            if self.state != STABLE and self.first_warn_rep is None:
                self.first_warn_rep = rep
        step = {"rep": rep, "scored": True, "score": score, "s": s, "s_clipped": sc, "ewma": self.z,
                "cusum": self.c, "run_length": self.run, "state": self.state, "alarm": alarm}
        self.steps.append(step)
        return step


def run_detector(cfg: Dict[str, Any], mu0: float, sigma0: float, scores: Sequence[Optional[float]]) -> SequentialDetector:
    det = SequentialDetector(cfg, mu0, sigma0)
    for i, d in enumerate(scores):
        det.update(i + 1, d)
    return det


def assess_recovery(recovery_scores: Sequence[float], post_scores: Sequence[float], mu0: float, sigma0: float,
                    warning_threshold: float) -> Optional[Dict[str, Any]]:
    """Mirror of src/detection/recovery.ts."""
    if not recovery_scores:
        return None
    mean_rec = mean(recovery_scores)
    mean_post = mean(post_scores) if post_scores else mean_rec
    excess_post = max(0.0, mean_post - mu0)
    excess_rec = max(0.0, mean_rec - mu0)
    if excess_post > 1e-9:
        pct = clamp(1 - excess_rec / excess_post, 0.0, 1.0)
    else:
        pct = 1.0 if excess_rec < sigma0 else 0.0
    within = mean_rec <= mu0 + warning_threshold * sigma0
    status = "recovered" if (within and pct >= 0.75) else ("partial" if pct >= 0.4 else "persistent")
    return {"percent": pct, "status": status, "mean_recovery": mean_rec, "mean_post": mean_post}
