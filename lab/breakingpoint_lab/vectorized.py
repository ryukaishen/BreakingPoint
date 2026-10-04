"""Vectorized (numpy) implementation of the BreakingPoint statistical core.

Same mathematics as ``core.py`` / the TypeScript app, but operating on whole
batches of sessions at once and on many detector configurations at once, which
is what makes 10^5 - 10^6 session sweeps cheap on CPUs.

Array conventions
-----------------
XC, QC : (N, R, F) calibration feature values / qualities, NaN-padded reps
X,  Q  : (N, T, F) monitoring feature values / qualities, NaN-padded reps
D      : (N, T)    per-rep drift scores, NaN = unscored or padding
"""
from __future__ import annotations

import warnings
from typing import Dict, Sequence, Tuple

import numpy as np

from .core import MAD_TO_SD, MIN_BASELINE_VALUES, MIN_CALIBRATION_REPS

MODES = ("ewma", "cusum", "combined", "consecutive")


def spec_arrays(specs: Sequence[dict]) -> Dict[str, np.ndarray]:
    return {
        "keys": [s["key"] for s in specs],
        "abs_floor": np.array([s["absFloor"] for s in specs], dtype=float),
        "rel_floor": np.array([s["relFloor"] for s in specs], dtype=float),
        "weight": np.array([s["weight"] for s in specs], dtype=float),
    }


def baseline_arrays(XC: np.ndarray, QC: np.ndarray, sa: Dict[str, np.ndarray], quality_min: float
                    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Per-session, per-feature robust baseline. Returns (center, scale, available), each (N, F)."""
    valid = np.isfinite(XC) & (QC >= quality_min)
    Xv = np.where(valid, XC, np.nan)
    n = valid.sum(axis=1)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        with np.errstate(all="ignore"):
            med = np.nanmedian(Xv, axis=1)
            mu = np.nanmean(Xv, axis=1)
            sd = np.sqrt(np.nansum((Xv - mu[:, None, :]) ** 2, axis=1) / (n - 1))
            mad = np.nanmedian(np.abs(Xv - med[:, None, :]), axis=1)
            scale = np.maximum.reduce([
                sd,
                MAD_TO_SD * mad,
                np.broadcast_to(sa["abs_floor"], sd.shape),
                sa["rel_floor"] * np.abs(med),
            ])
    avail = n >= MIN_BASELINE_VALUES
    center = np.where(avail, med, np.nan)
    scale = np.where(avail, scale, np.nan)
    return center, scale, avail


def drift_arrays(X: np.ndarray, Q: np.ndarray, center: np.ndarray, scale: np.ndarray, avail: np.ndarray,
                 sa: Dict[str, np.ndarray], cfg: dict) -> np.ndarray:
    """Weighted-RMS drift score for every rep. Returns D (N, T) with NaN for unscored reps."""
    weighting = cfg["feature_weighting"]
    missing = cfg["missing_feature_handling"]
    bw = np.ones_like(sa["weight"]) if weighting == "equal" else sa["weight"]
    qc = np.clip(Q, 0.0, 1.0)
    availb = avail[:, None, :]
    good = np.isfinite(X) & (qc >= cfg["quality_min"])
    obs = availb & good
    miss = availb & ~good
    with np.errstate(all="ignore"):
        total = (bw * availb).sum(-1)
        covered = (bw * obs).sum(-1)
        z = (X - center[:, None, :]) / scale[:, None, :]
        zc = np.where(obs, np.clip(z, -cfg["z_clip"], cfg["z_clip"]), 0.0)
        w = np.where(obs, bw * (qc if weighting == "grouped_quality" else 1.0), 0.0)
        sumsq = (w * zc * zc).sum(-1)
        wsum = w.sum(-1)
        if missing == "impute":
            wsum = wsum + (bw * miss).sum(-1)
        coverage = np.where(total > 0, covered / np.where(total > 0, total, 1.0), 0.0)
        scored = (wsum > 0) & (coverage >= cfg["min_coverage"])
        if missing == "skip_rep":
            scored &= ~miss.any(-1)
        D = np.where(scored, np.sqrt(sumsq / np.where(wsum > 0, wsum, 1.0)), np.nan)
    return D


def reference_arrays(XC: np.ndarray, QC: np.ndarray, ncal: np.ndarray, sa: Dict[str, np.ndarray], cfg: dict
                     ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Leave-one-out in-control drift reference. Returns (mu0, sigma0, loo_count), each (N,)."""
    N, R, _ = XC.shape
    ref = cfg["reference"]
    loo = np.full((N, R), np.nan)
    eligible = ncal >= MIN_CALIBRATION_REPS
    for i in range(R):
        has = eligible & (ncal > i)
        if not has.any():
            continue
        XCi = XC.copy()
        XCi[:, i, :] = np.nan
        c_i, s_i, a_i = baseline_arrays(XCi, QC, sa, cfg["quality_min"])
        Di = drift_arrays(XC[:, i:i + 1, :], QC[:, i:i + 1, :], c_i, s_i, a_i, sa, cfg)[:, 0]
        loo[:, i] = np.where(has, Di, np.nan)
    cnt = np.isfinite(loo).sum(axis=1)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        with np.errstate(all="ignore"):
            mu = np.nanmean(loo, axis=1)
            sd = np.sqrt(np.nansum((loo - mu[:, None]) ** 2, axis=1) / (cnt - 1))
    ok = cnt >= 3
    mu0 = np.where(ok, np.clip(mu, ref["mu0_min"], ref["mu0_max"]), ref["mu0_default"])
    sig = np.clip(np.maximum(sd, ref["sigma0_rel_min"] * mu0), ref["sigma0_min"], ref["sigma0_max"])
    sigma0 = np.where(ok, sig, ref["sigma0_default"])
    return mu0, sigma0, cnt


def personal_drift(XC, QC, ncal, X, Q, sa, cfg):
    """Full personalized pipeline: baseline -> LOO reference -> monitoring drift."""
    center, scale, avail = baseline_arrays(XC, QC, sa, cfg["quality_min"])
    mu0, sigma0, _ = reference_arrays(XC, QC, ncal, sa, cfg)
    D = drift_arrays(X, Q, center, scale, avail, sa, cfg)
    return D, mu0, sigma0


def run_detector_batch(D: np.ndarray, mu0: np.ndarray, sigma0: np.ndarray, params: Dict[str, np.ndarray], mode: str
                       ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Run C detector configurations (all of one mode) over N sessions simultaneously.

    params: arrays of length C for keys alpha, k, h, warn, bp, m, clip (clip = inf for none).
    Returns (alarm_rep, onset_rep, first_warn_rep), each (C, N) int32 with 0 meaning "never".
    """
    N, T = D.shape
    col = lambda key: np.asarray(params[key], dtype=float)[:, None]  # noqa: E731
    alpha, k, h, warn, bp, clip = (col(x) for x in ("alpha", "k", "h", "warn", "bp", "clip"))
    m = np.asarray(params["m"], dtype=np.int32)[:, None]
    C = alpha.shape[0]
    with np.errstate(all="ignore"):
        S = (D - mu0[:, None]) / sigma0[:, None]
    z = np.zeros((C, N))
    c = np.zeros((C, N))
    run = np.zeros((C, N), dtype=np.int32)
    runbp = np.zeros((C, N), dtype=np.int32)
    oc = np.zeros((C, N), dtype=np.int32)
    alarm = np.zeros((C, N), dtype=np.int32)
    onset = np.zeros((C, N), dtype=np.int32)
    first_warn = np.zeros((C, N), dtype=np.int32)
    alarmed = np.zeros((C, N), dtype=bool)
    m_floor1 = np.maximum(1, m)
    no_persist = m <= 0
    for t in range(T):
        s = S[:, t]
        valid = np.isfinite(s)
        if not valid.any():
            continue
        V = valid[None, :]
        sc = np.clip(np.where(valid, s, 0.0)[None, :], -clip, clip)
        z = np.where(V, alpha * sc + (1.0 - alpha) * z, z)
        prev_c = c
        c = np.where(V, np.maximum(0.0, c + sc - k), c)
        rep = t + 1
        oc = np.where(V & (c == 0), 0, np.where(V & (prev_c == 0) & (c > 0), rep, oc))
        run = np.where(V, np.where(sc > warn, run + 1, 0), run)
        runbp = np.where(V, np.where(sc > bp, runbp + 1, 0), runbp)
        if mode == "ewma":
            acond = z > bp
            wcond = z > warn
            persist = no_persist | (run >= m)
        elif mode == "cusum":
            acond = c > h
            wcond = c > h / 2
            persist = no_persist | (run >= m)
        elif mode == "consecutive":
            acond = runbp >= m_floor1
            wcond = sc > warn
            persist = True
        elif mode == "combined":
            acond = (z > bp) & (c > h)
            wcond = (z > warn) | (c > h / 2)
            persist = no_persist | (run >= m)
        else:
            raise ValueError(f"unknown mode {mode}")
        new = V & ~alarmed & acond & persist
        nonstable = V & ~alarmed & (new | wcond)
        first_warn = np.where(nonstable & (first_warn == 0), rep, first_warn)
        alarm = np.where(new, rep, alarm)
        onset = np.where(new, np.where(oc > 0, oc, rep), onset)
        alarmed |= new
    return alarm, onset, first_warn


def config_to_params(configs: Sequence[dict]) -> Dict[str, np.ndarray]:
    """Turn a list of (same-mode) config dicts into the parameter arrays used above."""
    return {
        "alpha": np.array([c["ewma_alpha"] for c in configs], dtype=float),
        "k": np.array([c["cusum_k"] for c in configs], dtype=float),
        "h": np.array([c["cusum_h"] for c in configs], dtype=float),
        "warn": np.array([c["warning_threshold"] for c in configs], dtype=float),
        "bp": np.array([c["breakpoint_threshold"] for c in configs], dtype=float),
        "m": np.array([c["minimum_persistent_reps"] for c in configs], dtype=np.int32),
        "clip": np.array([np.inf if c.get("outlier_clip") is None else c["outlier_clip"] for c in configs], dtype=float),
    }
