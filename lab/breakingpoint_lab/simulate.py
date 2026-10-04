"""Synthetic athlete / session generator for BreakingPoint Lab.

Purpose: evaluate the *statistical behaviour* of the sequential drift detector
under controlled, known conditions (known change point, known drift severity,
known noise / outlier / dropout levels). The feature magnitudes below are
plausible *relative* values for a side-view bodyweight squat measured with a
monocular pose estimator; they are NOT clinical reference values and the
simulator makes no claim to reproduce exact human biomechanics.

Generative model (per session)
------------------------------
athlete      : personal means for knee/hip ROM, depth, trunk lean, eccentric /
               concentric / pause durations, structural L/R offset, and
               personal rep-to-rep variability (coefficients of variation).
rep (bio)    : two latent factors per rep (a "depth" factor shared by knee/hip/
               depth/trunk, and a "tempo" factor shared by the durations) plus
               feature-specific noise -> realistic within-athlete covariance.
fatigue      : a per-athlete drift signature (trunk lean up, depth/ROM down,
               slower concentric, more asymmetry, eccentric either way) scaled
               by a magnitude path m(t) expressed in units of the athlete's own
               biological SD.
measurement  : pose-estimation noise (scaled by a noise multiplier and by low
               landmark confidence), per-feature confidence values, feature
               dropout and whole-rep dropout.
nuisance     : isolated "bad reps" (stumbles) of 4-8 SD in a random subset of
               features with random directions.

Scenario classes
----------------
A no change            B isolated bad rep(s)   C gradual fatigue drift
D sudden change        E camera noise          F landmark dropout
G high natural variability                     H drift followed by recovery
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional, Sequence

import numpy as np

from .core import feature_specs

GENERATOR_VERSION = "1.0"

SCENARIOS = [
    "A_no_change",
    "B_isolated_bad_rep",
    "C_gradual_drift",
    "D_sudden_change",
    "E_camera_noise",
    "F_landmark_dropout",
    "G_high_variability",
    "H_recovery",
]
SCENARIO_LABELS = {
    "A_no_change": "A · No change",
    "B_isolated_bad_rep": "B · Isolated bad rep",
    "C_gradual_drift": "C · Gradual fatigue drift",
    "D_sudden_change": "D · Sudden change",
    "E_camera_noise": "E · Camera noise",
    "F_landmark_dropout": "F · Landmark dropout",
    "G_high_variability": "G · High natural variability",
    "H_recovery": "H · Drift then recovery",
}
A, B, C, D, E, F, G, H = range(8)
NO_CHANGE = (A, B, E, F, G)
CHANGE = (C, D, H)

SPECS = feature_specs("squat")
KEYS = [s["key"] for s in SPECS]
KI = {k: i for i, k in enumerate(KEYS)}
NF = len(KEYS)
R_MAX = 8          # calibration reps (5-8 used)
T_MAX = 26         # monitoring reps (14-24, 26 for recovery sessions)
RECOVERY_CHECK_REPS = 3

# Measurement (pose-estimation) noise SDs at noise multiplier 1, quality ~0.9.
MEAS_SD = {
    "kneeRomL": 1.5, "kneeRomR": 1.8, "hipRom": 1.8, "depth": 0.008, "trunkLean": 1.0,
    "duration": 0.025, "velocity_rel": 0.035,
}


@dataclass
class SessionBatch:
    XC: np.ndarray            # (N, R_MAX, F) calibration values
    QC: np.ndarray            # (N, R_MAX, F) calibration qualities
    ncal: np.ndarray          # (N,)
    X: np.ndarray             # (N, T_MAX, F) monitoring values
    Q: np.ndarray             # (N, T_MAX, F)
    T: np.ndarray             # (N,) monitoring session length
    tau: np.ndarray           # (N,) true change rep (1-based), 0 = no change
    scenario: np.ndarray      # (N,)
    m_path: np.ndarray        # (N, T_MAX) true drift magnitude (bio-SD units)
    peak: np.ndarray          # (N,) peak drift magnitude (0 if none)
    noise_mult: np.ndarray    # (N,) monitoring measurement-noise multiplier
    p_out: np.ndarray         # (N,) per-rep outlier probability
    p_drop: np.ndarray        # (N,) per-feature dropout probability
    cv_mult: np.ndarray       # (N,) variability multiplier
    bad_reps: np.ndarray      # (N, T_MAX) bool, isolated bad reps / outliers
    recovery_true: np.ndarray  # (N,) true fraction of peak drift removed (H only, else NaN)
    recovery_start: np.ndarray  # (N,) first rep of the recovery-check window (H only, else 0)
    extra: Dict[str, np.ndarray] = field(default_factory=dict)

    @property
    def n(self) -> int:
        return int(self.ncal.shape[0])

    def subset(self, idx) -> "SessionBatch":
        sel = lambda a: a[idx]  # noqa: E731
        return SessionBatch(
            XC=sel(self.XC), QC=sel(self.QC), ncal=sel(self.ncal), X=sel(self.X), Q=sel(self.Q), T=sel(self.T),
            tau=sel(self.tau), scenario=sel(self.scenario), m_path=sel(self.m_path), peak=sel(self.peak),
            noise_mult=sel(self.noise_mult), p_out=sel(self.p_out), p_drop=sel(self.p_drop),
            cv_mult=sel(self.cv_mult), bad_reps=sel(self.bad_reps), recovery_true=sel(self.recovery_true),
            recovery_start=sel(self.recovery_start), extra={k: sel(v) for k, v in self.extra.items()},
        )


def _u(rng, lo, hi, n):
    return rng.uniform(lo, hi, size=n)


def _athletes(rng: np.random.Generator, n: int, cv_mult: np.ndarray) -> Dict[str, np.ndarray]:
    """Draw personal baselines. Ranges are plausible relative values, not clinical norms."""
    a = {
        "muK": np.clip(rng.normal(110, 10, n), 80, 140),
        "lr": rng.normal(0, 3.0, n),
        "muH": np.clip(rng.normal(95, 10, n), 65, 125),
        "muD": np.clip(rng.normal(0.40, 0.05, n), 0.25, 0.55),
        "muT": np.clip(rng.normal(32, 6, n), 15, 50),
        "muE": np.clip(rng.normal(1.15, 0.22, n), 0.6, 2.0),
        "muC": np.clip(rng.normal(0.90, 0.18, n), 0.5, 1.6),
        "muP": np.clip(rng.normal(0.12, 0.05, n), 0.02, 0.4),
        "shape": rng.normal(1.7, 0.08, n),
        "cvK": _u(rng, 0.02, 0.045, n) * cv_mult,
        "cvH": _u(rng, 0.025, 0.05, n) * cv_mult,
        "cvD": _u(rng, 0.03, 0.06, n) * cv_mult,
        "sdT": _u(rng, 1.0, 2.5, n) * cv_mult,
        "cvE": _u(rng, 0.04, 0.08, n) * cv_mult,
        "cvC": _u(rng, 0.04, 0.08, n) * cv_mult,
    }
    # Fatigue signature, normalized to unit RMS across its five components.
    sig = np.stack([
        _u(rng, 0.6, 1.4, n),    # trunk lean increases
        _u(rng, 0.3, 1.2, n),    # depth / ROM decreases
        _u(rng, 0.5, 1.5, n),    # concentric slows
        _u(rng, -0.6, 0.6, n),   # eccentric either way
        _u(rng, 0.0, 1.0, n),    # asymmetry grows (far-side knee ROM drops more)
    ], axis=1)
    sig /= np.sqrt((sig ** 2).mean(axis=1, keepdims=True))
    a["aT"], a["aD"], a["aC"], a["aE"], a["aA"] = (sig[:, i] for i in range(5))
    return a


def _reps(rng, ath, m, noise_mult, q_mean, p_drop, p_rep_drop, bad, p_lowq=None):
    """Generate measured features for reps.

    m: (N, r) drift magnitude; bad: (N, r) bool bad-rep mask; p_lowq: (N,) probability that an
    individual feature measurement has a low-confidence landmark (quality 0.15-0.5)."""
    N, r = m.shape
    col = lambda v: v[:, None]  # noqa: E731
    ud = rng.standard_normal((N, r))
    ut = rng.standard_normal((N, r))
    e = rng.standard_normal((N, r, 8))
    eta = rng.standard_normal((N, r, 9))

    sK = ath["muK"] * ath["cvK"]
    sH = ath["muH"] * ath["cvH"]
    sD = ath["muD"] * ath["cvD"]

    # Isolated bad reps: 4-8 SD in a random subset of features, random direction per group.
    bmag = np.where(bad, rng.uniform(4, 8, (N, r)), 0.0)
    hit = rng.random((N, r, 4)) < 0.7
    sgn = rng.choice([-1.0, 1.0], size=(N, r, 3))
    b_depth = bmag * hit[..., 0] * sgn[..., 0]
    b_trunk = bmag * hit[..., 1] * sgn[..., 1]
    b_tempo = bmag * hit[..., 2] * sgn[..., 2]
    b_asym = bmag * hit[..., 3]

    kneeL = col(ath["muK"]) + col(sK) * (0.85 * ud + 0.53 * e[..., 0]) - col(ath["aD"]) * m * col(sK) + b_depth * col(sK)
    kneeR = (col(ath["muK"] + ath["lr"]) + col(sK) * (0.85 * ud + 0.53 * e[..., 1])
             - col(ath["aD"]) * m * col(sK) - col(ath["aA"]) * m * col(sK) + b_depth * col(sK) - b_asym * col(sK) * 0.6)
    hip = col(ath["muH"]) + col(sH) * (0.7 * ud + 0.71 * e[..., 2]) - col(ath["aD"]) * m * col(sH) + b_depth * col(sH)
    depth = col(ath["muD"]) + col(sD) * (0.8 * ud + 0.6 * e[..., 3]) - col(ath["aD"]) * m * col(sD) + b_depth * col(sD)
    trunk = col(ath["muT"]) + col(ath["sdT"]) * (0.3 * ud + 0.95 * e[..., 4]) + col(ath["aT"]) * m * col(ath["sdT"]) + b_trunk * col(ath["sdT"])
    ecc = col(ath["muE"]) * (1 + col(ath["cvE"]) * (0.7 * ut + 0.71 * e[..., 5]) + col(ath["aE"]) * m * col(ath["cvE"]) + b_tempo * col(ath["cvE"]))
    conc = col(ath["muC"]) * (1 + col(ath["cvC"]) * (0.7 * ut + 0.71 * e[..., 6]) + col(ath["aC"]) * m * col(ath["cvC"]) + b_tempo * col(ath["cvC"]))
    ecc = np.maximum(ecc, 0.25)
    conc = np.maximum(conc, 0.25)
    pause = np.maximum(col(ath["muP"]) + 0.03 * e[..., 7], 0.02)

    # Landmark confidence; the far-side leg is less visible in a side view.
    qbase = np.clip(rng.normal(col(q_mean), 0.04, (N, r)), 0.0, 1.0)
    qL = np.clip(qbase + rng.normal(0, 0.02, (N, r)), 0.0, 1.0)
    qR = np.clip(qbase - rng.uniform(0, 0.12, (N, r)) + rng.normal(0, 0.02, (N, r)), 0.0, 1.0)
    # Low confidence -> noisier landmarks.
    nb = col(noise_mult) * (1 + 3 * np.maximum(0.0, 0.9 - qbase))
    nL = col(noise_mult) * (1 + 3 * np.maximum(0.0, 0.9 - qL))
    nR = col(noise_mult) * (1 + 3 * np.maximum(0.0, 0.9 - qR))

    kneeL_m = kneeL + MEAS_SD["kneeRomL"] * nL * eta[..., 0]
    kneeR_m = kneeR + MEAS_SD["kneeRomR"] * nR * eta[..., 1]
    hip_m = hip + MEAS_SD["hipRom"] * nb * eta[..., 2]
    depth_m = depth + MEAS_SD["depth"] * nb * eta[..., 3]
    trunk_m = trunk + MEAS_SD["trunkLean"] * nb * eta[..., 4]
    ecc_m = ecc + MEAS_SD["duration"] * nb * eta[..., 5]
    conc_m = conc + MEAS_SD["duration"] * nb * eta[..., 6]
    dur_m = ecc + conc + pause + MEAS_SD["duration"] * nb * eta[..., 7]
    vel_m = col(ath["shape"]) * 0.5 * (kneeL + kneeR) / conc * (1 + MEAS_SD["velocity_rel"] * nb * eta[..., 8])
    asym_m = np.abs(kneeL_m - kneeR_m)

    X = np.empty((N, r, NF))
    Q = np.empty((N, r, NF))
    vals = {
        "kneeRomL": (kneeL_m, qL), "kneeRomR": (kneeR_m, qR), "hipRom": (hip_m, np.minimum(qL, qbase)),
        "depth": (depth_m, qbase), "trunkLean": (trunk_m, qbase), "repDuration": (dur_m, qbase),
        "eccentricDuration": (ecc_m, qbase), "concentricDuration": (conc_m, qbase),
        "peakVelocity": (vel_m, np.minimum(qL, qbase)), "asymmetry": (asym_m, np.minimum(qL, qR)),
    }
    for k, (v, q) in vals.items():
        X[..., KI[k]] = v
        Q[..., KI[k]] = q

    if p_lowq is not None:
        lowq = rng.random((N, r, NF)) < col(p_lowq)[..., None]
        Q = np.where(lowq, rng.uniform(0.15, 0.5, (N, r, NF)), Q)
        # a low-confidence landmark also gives a much noisier measurement
        X = np.where(lowq, X + rng.standard_normal((N, r, NF)) * np.abs(X) * 0.08, X)
    drop = rng.random((N, r, NF)) < col(p_drop)[..., None]
    rep_drop = rng.random((N, r)) < col(p_rep_drop)
    X[drop] = np.nan
    X[rep_drop] = np.nan
    return X, Q


def generate_sessions(rng: np.random.Generator, scenario: Sequence[int], overrides: Optional[dict] = None) -> SessionBatch:
    """Generate one session per entry of ``scenario``.

    ``overrides`` (used by the robustness experiments) may fix any of:
    noise_mult (monitoring), noise_mult_cal (calibration; defaults to noise_mult), p_out,
    p_drop, p_rep_drop, p_lowq, q_mean_mon, cv_mult, peak, slope.
    """
    ov = overrides or {}
    sc = np.asarray(scenario, dtype=np.int64)
    n = sc.shape[0]
    reps = np.arange(1, T_MAX + 1)[None, :]

    cv_mult = np.where(sc == G, _u(rng, 2.0, 3.0, n), 1.0)
    if "cv_mult" in ov:
        cv_mult = np.full(n, float(ov["cv_mult"]))
    ath = _athletes(rng, n, cv_mult)

    ncal = rng.integers(5, R_MAX + 1, n)
    T = np.where(sc == H, T_MAX, rng.integers(14, 25, n))
    tau = np.zeros(n, dtype=np.int64)
    is_cd = (sc == C) | (sc == D)
    tau_cd = np.array([rng.integers(4, t - 6 + 1) for t in T])
    tau = np.where(is_cd, tau_cd, tau)
    tau = np.where(sc == H, rng.integers(4, 9, n), tau)

    # Camera noise (E) is a property of the capture setup, so it is present during
    # calibration AND monitoring. "Noise increases after calibration" is evaluated
    # separately as a stress test via the noise_mult_cal override.
    noise_mult = np.where(sc == E, _u(rng, 2.0, 4.0, n), 1.0)
    q_mean_mon = np.where(sc == E, _u(rng, 0.65, 0.85, n), np.where(sc == F, _u(rng, 0.75, 0.90, n), 0.92))
    p_out = np.where(np.isin(sc, CHANGE), 0.01, 0.0)
    p_drop = np.where(sc == F, _u(rng, 0.05, 0.25, n), np.where(np.isin(sc, CHANGE), 0.01, 0.0))
    p_rep_drop = np.where(sc == F, _u(rng, 0.02, 0.10, n), 0.0)
    p_lowq = np.where(sc == F, _u(rng, 0.10, 0.30, n), np.where(np.isin(sc, CHANGE), 0.01, 0.0))
    if "noise_mult" in ov:
        noise_mult = np.full(n, float(ov["noise_mult"]))
    if "p_out" in ov:
        p_out = np.full(n, float(ov["p_out"]))
    if "p_drop" in ov:
        p_drop = np.full(n, float(ov["p_drop"]))
    if "p_rep_drop" in ov:
        p_rep_drop = np.full(n, float(ov["p_rep_drop"]))
    if "q_mean_mon" in ov:
        q_mean_mon = np.full(n, float(ov["q_mean_mon"]))
    if "p_lowq" in ov:
        p_lowq = np.full(n, float(ov["p_lowq"]))
    noise_mult_cal = noise_mult.copy() if "noise_mult_cal" not in ov else np.full(n, float(ov["noise_mult_cal"]))
    q_mean_cal = np.where(sc == E, q_mean_mon, 0.92) if "q_mean_mon" not in ov else np.full(n, 0.92)

    # ---- drift magnitude path m(t) in bio-SD units ----
    m = np.zeros((n, T_MAX))
    peak = np.zeros(n)
    t_rel = reps - tau[:, None] + 1          # 1 at the change rep
    after = (reps >= tau[:, None]) & (tau[:, None] > 0)

    slope_c = _u(rng, 0.25, 0.75, n) if "slope" not in ov else np.full(n, float(ov["slope"]))
    peak_c = _u(rng, 1.5, 4.5, n) if "peak" not in ov else np.full(n, float(ov["peak"]))
    mc = np.clip(slope_c[:, None] * t_rel, 0, peak_c[:, None])
    m = np.where((sc == C)[:, None] & after, mc, m)

    peak_d = _u(rng, 1.5, 4.0, n) if "peak" not in ov else np.full(n, float(ov["peak"]))
    m = np.where((sc == D)[:, None] & after, peak_d[:, None], m)

    # Recovery: rise to peak, hold, then recover linearly to a residual fraction.
    slope_h = _u(rng, 0.5, 1.0, n)
    peak_h = _u(rng, 2.0, 4.5, n)
    rise = np.ceil(peak_h / slope_h).astype(int)
    hold = rng.integers(1, 3, n)
    rec_len = rng.integers(2, 5, n)
    resid = _u(rng, 0.0, 0.8, n)              # residual fraction of peak drift after recovery
    t_peak_end = rise + hold                       # in t_rel units
    t_rec_end = t_peak_end + rec_len
    rise_part = np.minimum(peak_h[:, None], slope_h[:, None] * t_rel)
    frac = np.clip((t_rel - t_peak_end[:, None]) / rec_len[:, None], 0, 1)
    rec_part = peak_h[:, None] * (1 - frac * (1 - resid[:, None]))
    mh = np.where(t_rel <= t_peak_end[:, None], rise_part, rec_part)
    m = np.where((sc == H)[:, None] & after, mh, m)

    peak = np.where(sc == C, peak_c, peak)
    peak = np.where(sc == D, peak_d, peak)
    peak = np.where(sc == H, peak_h, peak)
    # Effective peak actually reached within the session (gradual drift may be cut off).
    in_session = reps <= T[:, None]
    peak = np.where(np.isin(sc, CHANGE), np.max(np.where(in_session, m, 0), axis=1), 0.0)

    recovery_true = np.where(sc == H, 1 - resid, np.nan)
    recovery_start = np.where(sc == H, T - RECOVERY_CHECK_REPS + 1, 0)
    # make sure the recovery-check window starts after recovery has completed
    rec_done_rep = tau + t_rec_end - 1
    recovery_start = np.where(sc == H, np.maximum(recovery_start, rec_done_rep + 1), recovery_start)

    # ---- isolated bad reps / outliers ----
    bad = rng.random((n, T_MAX)) < p_out[:, None]
    nbad = rng.integers(1, 3, n)
    for i in np.where(sc == B)[0]:
        pos = rng.choice(np.arange(2, T[i] + 1), size=nbad[i], replace=False)
        bad[i, pos - 1] = True

    # ---- generate reps ----
    zero_cal = np.zeros((n, R_MAX))
    XC, QC = _reps(rng, ath, zero_cal, noise_mult_cal, q_mean_cal,
                   np.where(sc == F, p_drop * 0.25, 0.0), np.zeros(n), np.zeros((n, R_MAX), dtype=bool),
                   p_lowq * 0.25)
    X, Q = _reps(rng, ath, m, noise_mult, q_mean_mon, p_drop, p_rep_drop, bad, p_lowq)

    # pad beyond session length / calibration count
    XC[np.arange(R_MAX)[None, :] >= ncal[:, None]] = np.nan
    X[~in_session] = np.nan
    m = np.where(in_session, m, 0.0)

    return SessionBatch(XC=XC, QC=QC, ncal=ncal, X=X, Q=Q, T=T, tau=tau, scenario=sc, m_path=m, peak=peak,
                        noise_mult=noise_mult, p_out=p_out, p_drop=p_drop, cv_mult=cv_mult, bad_reps=bad & in_session,
                        recovery_true=recovery_true, recovery_start=recovery_start)


def balanced_scenarios(n: int, offset: int = 0, include: Sequence[int] = tuple(range(8))) -> np.ndarray:
    inc = np.asarray(include)
    return inc[(np.arange(n) + offset) % len(inc)]


_POP_CACHE: Dict[str, np.ndarray] = {}


def population_norms(n_athletes: int = 20000, seed: int = 20260101) -> Dict[str, np.ndarray]:
    """Population ("universal norm") center/scale per feature, used only for the
    personal-vs-population ablation. Estimated from fresh reps of many simulated athletes."""
    if "center" in _POP_CACHE:
        return _POP_CACHE
    rng = np.random.default_rng(seed)
    ath = _athletes(rng, n_athletes, np.ones(n_athletes))
    X, _ = _reps(rng, ath, np.zeros((n_athletes, 4)), np.ones(n_athletes), np.full(n_athletes, 0.92),
                 np.zeros(n_athletes), np.zeros(n_athletes), np.zeros((n_athletes, 4), dtype=bool))
    flat = X.reshape(-1, NF)
    _POP_CACHE["center"] = np.nanmean(flat, axis=0)
    _POP_CACHE["scale"] = np.nanstd(flat, axis=0, ddof=1)
    return _POP_CACHE
