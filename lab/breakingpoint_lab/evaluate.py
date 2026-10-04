"""Evaluation metrics and mergeable sufficient statistics.

Every shard stores only *counts* and integer *histograms* (detection delay and
change-point error are integer numbers of reps), so shards merge exactly by
summation — medians and order-statistic confidence intervals computed after the
merge are identical to what a single giant run would produce.

Outcome definitions (per session, latched BreakingPoint alarm rep `a`, true change rep `tau`)
  no-change scenario : false positive  <=> a > 0
  change scenario    : early alarm     <=> 0 < a < tau   (a false alarm before the change)
                       detected        <=> a >= tau
                       missed          <=> a == 0
  detection delay    = a - tau                (reps, detected sessions)
  change-point error = |onset_estimate - tau| (reps, detected sessions)
"""
from __future__ import annotations

import math
from typing import Dict, Optional, Sequence, Tuple

import numpy as np

from .simulate import CHANGE, NO_CHANGE, T_MAX

NS = 8
DH = T_MAX + 1
CH_INDEX = {s: j for j, s in enumerate(CHANGE)}
NSPLIT = 2  # 0 = selection split (even blocks), 1 = held-out evaluation split (odd blocks)


class StatsAccumulator:
    def __init__(self, n_variants: int, n_configs: int):
        V, C = n_variants, n_configs
        self.n = np.zeros((NSPLIT, NS), dtype=np.int64)
        self.alarm = np.zeros((NSPLIT, V, C, NS), dtype=np.int64)
        self.early = np.zeros((NSPLIT, V, C, len(CHANGE)), dtype=np.int64)
        self.detected = np.zeros((NSPLIT, V, C, len(CHANGE)), dtype=np.int64)
        self.missed = np.zeros((NSPLIT, V, C, len(CHANGE)), dtype=np.int64)
        self.delay_hist = np.zeros((NSPLIT, V, C, len(CHANGE), DH), dtype=np.int64)
        self.cperr_hist = np.zeros((NSPLIT, V, C, len(CHANGE), DH), dtype=np.int64)
        self.unscored = np.zeros((NSPLIT, V), dtype=np.int64)
        self.total_reps = np.zeros((NSPLIT, V), dtype=np.int64)

    FIELDS = ("n", "alarm", "early", "detected", "missed", "delay_hist", "cperr_hist", "unscored", "total_reps")

    def add_counts(self, split: int, scenario: np.ndarray) -> None:
        self.n[split] += np.bincount(scenario, minlength=NS)

    def add_unscored(self, split: int, v: int, D: np.ndarray, T: np.ndarray) -> None:
        in_session = np.arange(D.shape[1])[None, :] < T[:, None]
        self.unscored[split, v] += int((np.isnan(D) & in_session).sum())
        self.total_reps[split, v] += int(in_session.sum())

    def add(self, split: int, v: int, cfg_idx: np.ndarray, alarm: np.ndarray, onset: np.ndarray,
            scenario: np.ndarray, tau: np.ndarray) -> None:
        cfg_idx = np.asarray(cfg_idx)
        Cc = alarm.shape[0]
        rows = np.arange(Cc)[:, None]
        for s in range(NS):
            mk = scenario == s
            if not mk.any():
                continue
            a = alarm[:, mk]
            self.alarm[split, v, cfg_idx, s] += (a > 0).sum(axis=1)
            if s in CH_INDEX:
                j = CH_INDEX[s]
                t = tau[mk][None, :]
                early = (a > 0) & (a < t)
                det = a >= t
                self.early[split, v, cfg_idx, j] += early.sum(axis=1)
                self.detected[split, v, cfg_idx, j] += det.sum(axis=1)
                self.missed[split, v, cfg_idx, j] += (a == 0).sum(axis=1)
                d = np.clip(a - t, 0, DH - 1)
                e = np.clip(np.abs(onset[:, mk] - t), 0, DH - 1)
                ridx = np.broadcast_to(rows, a.shape)
                self.delay_hist[split, v, cfg_idx, j] += np.bincount(
                    (ridx * DH + d)[det], minlength=Cc * DH).reshape(Cc, DH)
                self.cperr_hist[split, v, cfg_idx, j] += np.bincount(
                    (ridx * DH + e)[det], minlength=Cc * DH).reshape(Cc, DH)

    def merge(self, other: "StatsAccumulator") -> None:
        for f in self.FIELDS:
            setattr(self, f, getattr(self, f) + getattr(other, f))

    def to_dict(self) -> Dict[str, np.ndarray]:
        return {f: getattr(self, f) for f in self.FIELDS}

    @classmethod
    def from_dict(cls, d: Dict[str, np.ndarray]) -> "StatsAccumulator":
        V, C = d["alarm"].shape[1:3]
        acc = cls(V, C)
        for f in cls.FIELDS:
            setattr(acc, f, np.asarray(d[f]).astype(np.int64))
        return acc


# --------------------------------------------------------------------------
# Interval estimates
# --------------------------------------------------------------------------
def wilson(k: float, n: float, z: float = 1.96) -> Tuple[float, float, float]:
    """Proportion with Wilson score 95% interval. Returns (p, lo, hi); NaNs if n == 0."""
    if n <= 0:
        return (math.nan, math.nan, math.nan)
    p = k / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (p, max(0.0, centre - half), min(1.0, centre + half))


def _value_at(cum: np.ndarray, idx: int) -> int:
    return int(np.searchsorted(cum, idx + 1))


def hist_median(hist: np.ndarray) -> float:
    n = int(hist.sum())
    if n == 0:
        return math.nan
    cum = np.cumsum(hist)
    lo = _value_at(cum, (n - 1) // 2)
    hi = _value_at(cum, n // 2)
    return (lo + hi) / 2


def hist_median_ci(hist: np.ndarray, z: float = 1.96) -> Tuple[float, float]:
    """Distribution-free order-statistic 95% CI for the median of integer data."""
    n = int(hist.sum())
    if n == 0:
        return (math.nan, math.nan)
    cum = np.cumsum(hist)
    lo_i = max(0, int(math.floor(n / 2 - z * math.sqrt(n) / 2)) - 1)
    hi_i = min(n - 1, int(math.ceil(n / 2 + z * math.sqrt(n) / 2)))
    return (float(_value_at(cum, lo_i)), float(_value_at(cum, hi_i)))


def hist_mean(hist: np.ndarray) -> float:
    n = hist.sum()
    return float((hist * np.arange(hist.shape[-1])).sum() / n) if n else math.nan


# --------------------------------------------------------------------------
# Per-session outcome helpers (used by finalize / robustness / tests)
# --------------------------------------------------------------------------
def session_outcomes(alarm: np.ndarray, onset: np.ndarray, tau: np.ndarray) -> Dict[str, np.ndarray]:
    change = tau > 0
    det = change & (alarm >= tau) & (alarm > 0)
    return {
        "false_positive": (~change) & (alarm > 0),
        "early": change & (alarm > 0) & (alarm < tau),
        "detected": det,
        "missed": change & (alarm == 0),
        "delay": np.where(det, alarm - tau, -1),
        "cperr": np.where(det, np.abs(onset - tau), -1),
    }


def summarize_outcomes(alarm: np.ndarray, onset: np.ndarray, tau: np.ndarray,
                       mask: Optional[np.ndarray] = None) -> Dict[str, float]:
    if mask is not None:
        alarm, onset, tau = alarm[mask], onset[mask], tau[mask]
    o = session_outcomes(alarm, onset, tau)
    n_nc = int((tau == 0).sum())
    n_ch = int((tau > 0).sum())
    fpr = wilson(o["false_positive"].sum(), n_nc)
    tpr = wilson(o["detected"].sum(), n_ch)
    delays = o["delay"][o["detected"]]
    cperr = o["cperr"][o["detected"]]
    return {
        "n_no_change": n_nc, "n_change": n_ch,
        "fpr": fpr[0], "fpr_lo": fpr[1], "fpr_hi": fpr[2],
        "tpr": tpr[0], "tpr_lo": tpr[1], "tpr_hi": tpr[2],
        "miss_rate": o["missed"].sum() / n_ch if n_ch else math.nan,
        "early_rate": o["early"].sum() / n_ch if n_ch else math.nan,
        "median_delay": float(np.median(delays)) if delays.size else math.nan,
        "mean_delay": float(np.mean(delays)) if delays.size else math.nan,
        "median_cperr": float(np.median(cperr)) if cperr.size else math.nan,
    }


def metrics_from_stats(acc: StatsAccumulator, split: int, v: int, c: int) -> Dict[str, float]:
    """Headline metrics for one (variant, config) on one split."""
    n = acc.n[split]
    nc = list(NO_CHANGE)
    n_nc = n[nc].sum()
    fp = acc.alarm[split, v, c, nc].sum()
    ch_n = n[list(CHANGE)].sum()
    det = acc.detected[split, v, c].sum()
    miss = acc.missed[split, v, c].sum()
    early = acc.early[split, v, c].sum()
    dh = acc.delay_hist[split, v, c].sum(axis=0)
    eh = acc.cperr_hist[split, v, c].sum(axis=0)
    fpr = wilson(fp, n_nc)
    tpr = wilson(det, ch_n)
    mr = wilson(miss, ch_n)
    dci = hist_median_ci(dh)
    out = {
        "n_no_change": int(n_nc), "n_change": int(ch_n),
        "fpr": fpr[0], "fpr_lo": fpr[1], "fpr_hi": fpr[2],
        "tpr": tpr[0], "tpr_lo": tpr[1], "tpr_hi": tpr[2],
        "miss_rate": mr[0], "miss_lo": mr[1], "miss_hi": mr[2],
        "early_rate": early / ch_n if ch_n else math.nan,
        "median_delay": hist_median(dh), "median_delay_lo": dci[0], "median_delay_hi": dci[1],
        "mean_delay": hist_mean(dh),
        "median_cperr": hist_median(eh), "mean_cperr": hist_mean(eh),
    }
    for s in NO_CHANGE:
        out[f"fpr_s{s}"] = acc.alarm[split, v, c, s] / n[s] if n[s] else math.nan
    for s, j in CH_INDEX.items():
        out[f"tpr_s{s}"] = acc.detected[split, v, c, j] / n[s] if n[s] else math.nan
        out[f"median_delay_s{s}"] = hist_median(acc.delay_hist[split, v, c, j])
    return out


def all_metrics(acc: StatsAccumulator, split: int) -> Dict[str, np.ndarray]:
    """Vectorized headline metrics for every (variant, config) on one split -> arrays of shape (V, C)."""
    n = acc.n[split].astype(float)
    nc = list(NO_CHANGE)
    n_nc = n[nc].sum()
    ch_n = n[list(CHANGE)].sum()
    with np.errstate(all="ignore"):
        fpr = acc.alarm[split][..., nc].sum(-1) / n_nc
        tpr = acc.detected[split].sum(-1) / ch_n
        miss = acc.missed[split].sum(-1) / ch_n
        early = acc.early[split].sum(-1) / ch_n
        dh = acc.delay_hist[split].sum(axis=2)  # (V, C, DH)
        eh = acc.cperr_hist[split].sum(axis=2)
        cnt = dh.sum(-1)
        bins = np.arange(DH)
        mean_delay = (dh * bins).sum(-1) / cnt
        mean_cperr = (eh * bins).sum(-1) / cnt
        fpr_s = {s: acc.alarm[split][..., s] / n[s] for s in NO_CHANGE}
    V, C = fpr.shape
    med = np.full((V, C), np.nan)
    medcp = np.full((V, C), np.nan)
    cum = np.cumsum(dh, axis=-1)
    cume = np.cumsum(eh, axis=-1)
    for v in range(V):
        for c in range(C):
            k = int(cnt[v, c])
            if k:
                med[v, c] = (np.searchsorted(cum[v, c], (k - 1) // 2 + 1) + np.searchsorted(cum[v, c], k // 2 + 1)) / 2
                medcp[v, c] = (np.searchsorted(cume[v, c], (k - 1) // 2 + 1) + np.searchsorted(cume[v, c], k // 2 + 1)) / 2
    return {"fpr": fpr, "tpr": tpr, "miss": miss, "early": early, "median_delay": med, "mean_delay": mean_delay,
            "median_cperr": medcp, "mean_cperr": mean_cperr, "fpr_max_scenario": np.max(np.stack(list(fpr_s.values())), axis=0),
            **{f"fpr_s{s}": a for s, a in fpr_s.items()}}


# --------------------------------------------------------------------------
# Transparent selection rule
# --------------------------------------------------------------------------
SELECTION_RULE = (
    "Selection is performed on the SELECTION split only (even-numbered session blocks); all reported "
    "performance comes from the held-out EVALUATION split (odd-numbered blocks). "
    "(1) Eligibility: false-positive rate <= 5% in EVERY no-change scenario (A no change, B isolated bad rep, "
    "E camera noise, F landmark dropout, G high natural variability) — the constraint must hold under each "
    "nuisance condition, not merely on average (this implies pooled FPR <= 5%). "
    "(2) Among eligible configurations, keep those whose miss rate over drift scenarios C,D,H is within "
    "2 percentage points of the best eligible miss rate. "
    "(3) From those, choose the lowest median detection delay; ties broken by lower mean detection delay, "
    "then lower pooled false-positive rate, then the simpler detector family "
    "(consecutive < EWMA = CUSUM < combined). "
    "If no configuration is eligible, the configuration with the lowest pooled false-positive rate is chosen "
    "and the report flags it."
)
FPR_MAX = 0.05
FPR_SCENARIO_MAX = 0.05
MISS_TOLERANCE = 0.02


def select_config(metrics: Dict[str, np.ndarray], complexity: np.ndarray,
                  restrict: Optional[np.ndarray] = None) -> Tuple[Tuple[int, int], bool]:
    """Apply SELECTION_RULE. metrics arrays are (V, C); complexity is (C,).
    Returns ((v, c), eligible_found)."""
    fpr = metrics["fpr"]
    V, C = fpr.shape
    mask = np.ones((V, C), dtype=bool) if restrict is None else restrict.copy()
    eligible = mask & (fpr <= FPR_MAX) & (metrics["fpr_max_scenario"] <= FPR_SCENARIO_MAX) & np.isfinite(metrics["miss"])
    if not eligible.any():
        cand = np.where(mask, fpr, np.inf)
        v, c = np.unravel_index(int(np.argmin(cand)), cand.shape)
        return (int(v), int(c)), False
    best_miss = metrics["miss"][eligible].min()
    keep = eligible & (metrics["miss"] <= best_miss + MISS_TOLERANCE + 1e-12)
    vs, cs = np.where(keep)
    keys = []
    for v, c in zip(vs, cs):
        md = metrics["median_delay"][v, c]
        mn = metrics["mean_delay"][v, c]
        keys.append((np.inf if np.isnan(md) else md, np.inf if np.isnan(mn) else mn, fpr[v, c], complexity[c], v, c))
    keys.sort()
    return (int(keys[0][4]), int(keys[0][5])), True


def sequence_metrics(values: Sequence[float]) -> Dict[str, float]:
    a = np.asarray(values, dtype=float)
    return {"mean": float(np.nanmean(a)), "sd": float(np.nanstd(a, ddof=1)) if a.size > 1 else math.nan}
