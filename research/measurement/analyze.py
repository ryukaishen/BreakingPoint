"""Phase 4A.5: measurement validity and evaluation readiness.

    python -I research/measurement/analyze.py

Reads the reference data and variant runs under data/processed/measurement/ (built by
build_streams.py and run_variants.ts) and the Phase 4A outputs, and writes

  data/processed/qa/phase4a5_summary.json          every number below, machine-readable
  research/reports/phase4a5_tables.md              generated tables (the report quotes them)

Nothing here compares fresh with post-fatigue jumps, or correct with incorrect reps, by score or
measurement: those are Phase 4B questions. Trial condition and rep correctness appear only in the
missingness audit (who and what is missing), never as an outcome.
"""
from __future__ import annotations

import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from scipy.stats import fisher_exact, mannwhitneyu, spearmanr

REPO = Path(__file__).resolve().parents[2]
P = REPO / "data" / "processed"
M = P / "measurement"
RUNS = M / "runs"
REPORT = REPO / "research" / "reports" / "phase4a5_tables.md"

# ------------------------------------------------------------------------------------------------
# Decision rules, fixed on 2026-10-09 before any variant result was computed. A jump measurement is
# "validated for within-person comparison (offline best case)" when, in the advised view with the
# production pipeline and no added jitter:
COVERAGE_MIN = 0.90          # it is measured in at least 90% of upright, reference-checked trials
RMCORR_MIN = 0.70            # within-person (repeated-measures) correlation with the lab criterion >= 0.70
RMCORR_CI_LOW_MIN = 0.50     # and its 95% bootstrap lower bound >= 0.50
# and both hold again in the pure side view and with 0.002 image-height jitter (all three seeds).
# Time measurements must also mean what their names say: median error within one frame (33 ms) or
# 10% of the criterion's median, whichever is larger. Otherwise "tracks change, but mistimed".
NAME_TOL_S = 1 / 30
NAME_TOL_REL = 0.10
BOOT = 2000
SEED = 20261009
# ------------------------------------------------------------------------------------------------

VARIANTS = ["production", "none", "butter6", "dual_none", "dual_butter6"]
VARIANT_LABEL = {
    "production": "App now (One Euro 1.2 Hz)",
    "none": "No smoothing",
    "butter6": "6 Hz Butterworth, causal",
    "dual_none": "Timing unsmoothed, angles One Euro",
    "dual_butter6": "Timing 6 Hz Butterworth, angles One Euro",
}
ADVISED = "az35_d3.5"
SIDE = "az0_d3.5"
CAMERA_STREAMS = ["az0_d3.5", "az20_d3.5", "az35_d3.5", "az50_d3.5", "az70_d3.5", "az35_d2.5", "az35_d4.5"]
NOISE = [0.002, 0.004]
SEEDS = [1, 2, 3]

#: Each app jump measurement and the lab criterion it is checked against.
CRITERIA = {
    "jumpHeight": ("com_rise_per_leg", "centre-of-mass rise, standing to peak, per leg length", False),
    "rsiMod": ("rsi_ref", "centre-of-mass rise per leg length / time from movement start to take-off", False),
    "flightTime": ("flight_s", "force-plate contact minus free-fall take-off (s)", True),
    "countermovementDepth": ("com_depth_per_leg", "centre-of-mass drop in the countermovement, per leg length", False),
    "eccentricDuration": ("eccentric_s", "centre-of-mass movement start to lowest point (s)", True),
    "concentricDuration": ("concentric_s", "centre-of-mass lowest point to take-off (s)", True),
    "trunkLean": ("trunk_sagittal_peak_deg", "peak sagittal trunk inclination before take-off, from 3D markers (deg)", False),
    "landingKneeFlex": ("knee_landing_near_deg", "OpenSim peak knee flexion in the 0.5 s after contact, camera-side leg (deg)", False),
    "asymmetry": ("knee_landing_asym_deg", "|left - right| OpenSim peak landing knee flexion (deg)", False),
}
FEATURES = list(CRITERIA)


def load(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def fin(x) -> bool:
    return x is not None and isinstance(x, (int, float)) and math.isfinite(x)


def q(xs, digits=3):
    xs = [float(x) for x in xs if fin(x)]
    if not xs:
        return None
    return {"n": len(xs), "median": round(float(np.median(xs)), digits), "q25": round(float(np.percentile(xs, 25)), digits),
            "q75": round(float(np.percentile(xs, 75)), digits), "min": round(min(xs), digits), "max": round(max(xs), digits)}


def per_participant(values_by_trial: dict, subject_of: dict, digits=3):
    """Each participant's median, then the distribution of those medians across participants."""
    by = defaultdict(list)
    for rid, v in values_by_trial.items():
        if fin(v):
            by[subject_of[rid]].append(v)
    meds = {s: float(np.median(v)) for s, v in by.items()}
    out = q(meds.values(), digits)
    if out:
        worst = sorted(meds.items(), key=lambda kv: -abs(kv[1]))[:3]
        out["largest_abs"] = [[s, round(v, digits)] for s, v in worst]
    return out


def rmcorr(x, y, subj):
    """Repeated-measures correlation (Bakdash and Marusich 2017): Pearson r of within-person centred values."""
    x, y, subj = np.asarray(x, float), np.asarray(y, float), np.asarray(subj)
    xc, yc = x.copy(), y.copy()
    keep = np.zeros(len(x), bool)
    for s in np.unique(subj):
        m = subj == s
        if m.sum() >= 2:
            xc[m] -= x[m].mean()
            yc[m] -= y[m].mean()
            keep |= m
    xc, yc = xc[keep], yc[keep]
    den = math.sqrt(float((xc ** 2).sum() * (yc ** 2).sum()))
    return float((xc * yc).sum() / den) if den > 0 else float("nan")


def rmcorr_ci(x, y, subj, rng):
    x, y, subj = np.asarray(x, float), np.asarray(y, float), np.asarray(subj)
    ids = np.unique(subj)
    idx = {s: np.where(subj == s)[0] for s in ids}
    rs = []
    for _ in range(BOOT):
        pick = rng.choice(ids, size=len(ids), replace=True)
        xs, ys, ss = [], [], []
        for k, s in enumerate(pick):
            xs.append(x[idx[s]])
            ys.append(y[idx[s]])
            ss += [k] * len(idx[s])
        r = rmcorr(np.concatenate(xs), np.concatenate(ys), np.array(ss))
        if math.isfinite(r):
            rs.append(r)
    return [round(float(np.percentile(rs, 2.5)), 3), round(float(np.percentile(rs, 97.5)), 3)]


def within_sd(v, subj):
    v, subj = np.asarray(v, float), np.asarray(subj)
    res = []
    for s in np.unique(subj):
        m = subj == s
        if m.sum() >= 2:
            res.append(v[m] - v[m].mean())
    r = np.concatenate(res) if res else np.array([])
    dof = len(r) - len(res)
    return float(math.sqrt((r ** 2).sum() / dof)) if dof > 0 else float("nan")


# ---------------------------------------------------------------------------------------- loading
# Loaded at import so the helpers below can use them; empty when the data have not been prepared (unit tests).
REF = {r["recording"]: r for r in load(M / "references" / "jump.json")["trials"]} if (M / "references" / "jump.json").exists() else {}
PART = load(M / "references" / "participants.json") if (M / "references" / "participants.json").exists() else {}
SUBJ = {rid: r["subject"] for rid, r in REF.items()}
for r in REF.values():
    if r.get("reference_ok"):
        r["rsi_ref"] = r["com_rise_per_leg"] / r["contraction_s"] if r["contraction_s"] > 0 else None
        r["knee_landing_near_deg"] = r["opensim_knee_landing_peak_deg"][0]  # left leg faces the camera
        r["knee_landing_asym_deg"] = abs(r["opensim_knee_landing_peak_deg"][0] - r["opensim_knee_landing_peak_deg"][1])
IN_SCOPE = sorted(rid for rid, r in REF.items() if r.get("reference_ok") and r.get("starts_upright"))


def run(dataset, stream, variant, sigma=0, seed=0):
    p = RUNS / dataset / stream / f"{variant}__s{sigma}__seed{seed}.json"
    return {r["recording"]: r for r in load(p)["recordings"]}


def one_jump(res):
    """recording -> the single jump, for recordings where exactly one was found."""
    return {rid: r["reps"][0] for rid, r in res.items() if len(r["reps"]) == 1}


def last_real_time(stream: str) -> dict:
    idx = load(M / "streams" / "jump" / stream / "index.json")
    return {m["recording"]: (m["frames"] - 1) / m["fps"] for m in idx["recordings"]}


# ---------------------------------------------------------------------------------------- checks
def consistency_with_phase4a():
    """The harness's production runs on the rebuilt advised and side views must equal Phase 4A exactly."""
    out = {}
    for stream, view in ((ADVISED, "oblique35"), (SIDE, "side")):
        a = {r["recording"]: r for r in load(P / "features" / "jump" / view / "features.json")["recordings"]}
        b = run("jump", stream, "production")
        same = 0
        for rid, ra in a.items():
            rb = b[rid]
            ok = len(ra["reps"]) == len(rb["reps"]) and all(
                x["tTakeoff"] == y["tTakeoff"] and x["tLanding"] == y["tLanding"] and x["features"]["values"] == y["features"]
                for x, y in zip(ra["reps"], rb["reps"]))
            same += ok
        out[stream] = {"recordings": len(a), "identical_to_phase4a": same}
    return out


# ---------------------------------------------------------------------------------------- jump timing
def timing_errors(jumps: dict, rids):
    to, td, fl = {}, {}, {}
    for rid in rids:
        j = jumps.get(rid)
        r = REF[rid]
        if j is None:
            continue
        if fin(j["tTakeoff"]):
            to[rid] = (j["tTakeoff"] - r["takeoff_s"]) * 1000
        if fin(j["tLanding"]):
            td[rid] = (j["tLanding"] - r["contact_s"]) * 1000
        if fin(j["features"].get("flightTime")):
            fl[rid] = (j["features"]["flightTime"] - r["flight_s"]) * 1000
    return to, td, fl


def timing_block(jumps, rids):
    to, td, fl = timing_errors(jumps, rids)
    return {"jumps_found": sum(1 for r in rids if r in jumps), "of": len(rids),
            "takeoff_error_ms": q(to.values(), 1), "touchdown_error_ms": q(td.values(), 1), "flight_error_ms": q(fl.values(), 1),
            "touchdown_error_ms_by_participant": per_participant(td, SUBJ, 1),
            "flight_error_ms_by_participant": per_participant(fl, SUBJ, 1)}


def rule_on_3d():
    """Step 0: the app's take-off and touchdown thresholds on the true 3D ankle height at 250 Hz
    (build_streams.ankle_rule_events), as if they were a rep."""
    jumps = {}
    for rid in IN_SCOPE:
        r = REF[rid]
        if fin(r.get("ankle_rule_takeoff_s")) and fin(r.get("ankle_rule_touchdown_s")):
            jumps[rid] = {"tTakeoff": r["ankle_rule_takeoff_s"], "tLanding": r["ankle_rule_touchdown_s"],
                          "features": {"flightTime": r["ankle_rule_touchdown_s"] - r["ankle_rule_takeoff_s"]}}
    return jumps


def ladder():
    """Take-off and touchdown timing, adding one step of the app's signal chain at a time."""
    steps = [
        (None, None, "0. The app's thresholds on the true 3D ankle height, 250 Hz (the rule and the landmark only)"),
        ("ortho30", "none", "1. + the app's segmenter at 30 fps, ideal side view (no perspective), no smoothing"),
        (ADVISED, "none", "2. + perspective camera at the advised place (35 deg, 3.5 m, hip height)"),
        (ADVISED, "production", "3. + the app's One Euro smoothing (this is the app)"),
    ]
    out = []
    prev = None
    for stream, variant, label in steps:
        jumps = rule_on_3d() if stream is None else one_jump(run("jump", stream, variant))
        blk = {"stream": stream, "variant": variant, "label": label, **timing_block(jumps, IN_SCOPE)}
        to, td, fl = timing_errors(jumps, IN_SCOPE)
        if prev is not None:
            pto, ptd, pfl = prev
            blk["touchdown_change_from_previous_ms"] = q([td[r] - ptd[r] for r in td if r in ptd], 1)
            blk["takeoff_change_from_previous_ms"] = q([to[r] - pto[r] for r in to if r in pto], 1)
            blk["flight_change_from_previous_ms"] = q([fl[r] - pfl[r] for r in fl if r in pfl], 1)
        prev = (to, td, fl)
        out.append(blk)
    return out


def frame_rates():
    """The advised camera at 15, 30 and 60 fps, and the ideal side view at 30 and 250 fps. The app's segmenter
    updates its standing reference by a fixed share per frame, so its behaviour depends on the frame rate."""
    out = {}
    for stream, label in (("az35_d3.5_f15", "advised camera, 15 fps"), (ADVISED, "advised camera, 30 fps"), ("az35_d3.5_f60", "advised camera, 60 fps"),
                          ("ortho30", "ideal side view, 30 fps"), ("ortho250", "ideal side view, 250 fps")):
        for v in ("production", "none", "dual_butter6"):
            rr = run("jump", stream, v)
            jumps = one_jump(rr)
            missed = [rid for rid in IN_SCOPE if rid not in jumps]
            no_dip = sum(1 for rid in missed if not any(p in ("propulsion", "flight") for _, p in rr[rid].get("phaseLog", [])))
            out[f"{stream}/{v}"] = {"label": label, "variant": v, **timing_block(jumps, IN_SCOPE),
                                    "missed_without_reaching_propulsion": no_dip}
    return out


# ------------------------------------------------------------------- candidate flight rule (prototype)
class OneEuroPy:
    """Python port of src/pose/smoothing.ts OneEuroFilter (same formulas), for the prototype only."""

    def __init__(self, min_cutoff=1.2, beta=0.05, d_cutoff=1.0):
        self.mc, self.beta, self.dc = min_cutoff, beta, d_cutoff
        self.y = self.dx = self.t = None

    @staticmethod
    def _alpha(cutoff, dt):
        return 1 / (1 + (1 / (2 * math.pi * cutoff)) / dt)

    def __call__(self, x, t):
        if self.t is None:
            self.t, self.dx, self.y = t, 0.0, x
            return x
        dt = max(1e-3, t - self.t)
        self.t = t
        a = self._alpha(self.dc, dt)
        self.dx = a * ((x - self.y) / dt) + (1 - a) * self.dx
        b = self._alpha(self.mc + self.beta * abs(self.dx), dt)
        self.y = b * x + (1 - b) * self.y
        return self.y


class ButterPy:
    """Python port of research/measurement/variants.ts Butterworth2 (causal, 2nd order)."""

    def __init__(self, fc=6.0):
        self.fc, self.s = fc, None

    def __call__(self, x, dt):
        if self.s is None:
            self.s = [x, x, x, x]
            return x
        k = math.tan(math.pi * self.fc * dt)
        n = 1 / (1 + math.sqrt(2) * k + k * k)
        b0, a1, a2 = k * k * n, 2 * (k * k - 1) * n, (1 - math.sqrt(2) * k + k * k) * n
        x1, x2, y1, y2 = self.s
        y = b0 * x + 2 * b0 * x1 + b0 * x2 - a1 * y1 - a2 * y2
        self.s = [x, x1, y, y1]
        return y


def filtered(sig, fps, how):
    if how == "none":
        return sig
    out = np.empty_like(sig)
    f = OneEuroPy() if how == "one_euro" else ButterPy(6.0)
    for i, x in enumerate(sig):
        out[i] = f(x, i / fps) if how == "one_euro" else f(x, 0 if i == 0 else 1 / fps)
    return out


def candidate_flight_rule():
    """Prototype only, not app code: the app's thresholds (3.5% up, 1.5% down, per leg length) applied to the
    lowest point of each foot (heel or toe, MediaPipe landmarks 29 to 32) instead of the ankle, compared with
    the same apex-based rule on the ankle. Run on the Phase 4A 30 fps streams, which carry those landmarks."""
    out = {}
    for view, stream_key in (("oblique35", ADVISED), ("side", SIDE)):
        idx = load(P / "landmarks" / "jump" / view / "index.json")
        signals = {}
        for m in idx["recordings"]:
            rid = m["recording"]
            if rid not in IN_SCOPE:
                continue
            rec = load(P / "landmarks" / "jump" / view / f"{rid}.json")
            fr = np.array(rec["frames"]).reshape(len(rec["frames"]), 33, 3)
            fps, aspect = rec["fps"], rec["aspect"]
            w = fr[0, :, 2]
            ank = (fr[:, 27, 1] * w[27] + fr[:, 28, 1] * w[28]) / (w[27] + w[28])
            low_l, low_r = np.maximum(fr[:, 29, 1], fr[:, 31, 1]), np.maximum(fr[:, 30, 1], fr[:, 32, 1])  # image y down
            foot = (low_l * w[27] + low_r * w[28]) / (w[27] + w[28])
            hip = (fr[:, 23, 1] + fr[:, 24, 1]) / 2
            leg = float(np.median(np.hypot((fr[:12, 23, 0] - fr[:12, 27, 0]) * aspect, fr[:12, 23, 1] - fr[:12, 27, 1])))
            signals[rid] = (fps, ank, foot, hip, leg)
        for point in ("ankle", "foot"):
            for how in ("none", "butter6", "one_euro"):
                to, td, fl, fl_val = {}, {}, {}, {}
                for rid, (fps, ank, foot, hip, leg) in signals.items():
                    y = filtered(ank if point == "ankle" else foot, fps, how)
                    h = filtered(hip, fps, how)
                    lift = (np.median(y[:12]) - y) / leg
                    t = np.arange(len(y)) / fps
                    apex = int(np.argmin(h))
                    i = apex
                    while i > 0 and lift[i - 1] > 0.035:
                        i -= 1
                    j = apex
                    while j < len(y) - 1 and lift[j + 1] >= 0.015:
                        j += 1
                    if i == 0 or j >= len(y) - 1 or lift[apex] <= 0.035:
                        continue
                    t_to = t[i - 1] + (0.035 - lift[i - 1]) / (lift[i] - lift[i - 1]) * (t[i] - t[i - 1])
                    t_td = t[j] + (lift[j] - 0.015) / (lift[j] - lift[j + 1]) * (t[j + 1] - t[j])
                    r = REF[rid]
                    to[rid], td[rid] = (t_to - r["takeoff_s"]) * 1000, (t_td - r["contact_s"]) * 1000
                    fl[rid], fl_val[rid] = (t_td - t_to - r["flight_s"]) * 1000, t_td - t_to
                rids = sorted(fl_val)
                xs, ys, ss = [fl_val[r] for r in rids], [REF[r]["flight_s"] for r in rids], [SUBJ[r] for r in rids]
                out[f"{view}/{point}/{how}"] = {
                    "measured": len(rids), "of": len(signals),
                    "takeoff_error_ms": q(to.values(), 1), "touchdown_error_ms": q(td.values(), 1), "flight_error_ms": q(fl.values(), 1),
                    "flight_error_ms_by_participant": per_participant(fl, SUBJ, 1),
                    "flight_rmcorr": round(rmcorr(xs, ys, ss), 3), "flight_spearman": round(float(spearmanr(xs, ys).statistic), 3),
                    "within_person_sd_error_s": round(within_sd(np.asarray(xs) - np.asarray(ys), ss), 4),
                    "within_person_sd_criterion_s": round(within_sd(ys, ss), 4)}
    return out


def one_euro_mechanism():
    tr = load(RUNS / "jump" / "one_euro_trace_az35_d3.5.json")["recordings"]
    flight_cut, max_cut, lift_at_contact, lag_to_threshold = [], [], [], []
    legs = app_leg_lengths(ADVISED)
    for rec in tr:
        rid = rec["recording"]
        r = REF[rid]
        if rid not in IN_SCOPE:
            continue
        fps = rec["fps"]
        t = np.arange(len(rec["cutoff_hz"])) / fps
        fly = (t >= r["takeoff_s"]) & (t <= r["contact_s"])
        c = np.asarray(rec["cutoff_hz"])
        flight_cut.append(float(np.median(c[fly])))
        max_cut.append(float(c.max()))
        raw, sm = np.asarray(rec["ankle_y_raw"]), np.asarray(rec["ankle_y_one_euro"])
        st = slice(0, 12)
        leg = legs[rid]
        lift_raw = (np.median(raw[st]) - raw) / leg
        lift_sm = (np.median(sm[st]) - sm) / leg
        k = int(np.searchsorted(t, r["contact_s"]))
        if k < len(t):
            lift_at_contact.append(float(lift_sm[k]) * 100)
            after = np.where((t >= r["contact_s"]) & (lift_sm < 0.015))[0]
            if len(after):
                lag_to_threshold.append(float(t[after[0]] - r["contact_s"]) * 1000)
    tau = 1 / (2 * math.pi * 1.2)
    return {"median_cutoff_in_flight_hz": q(flight_cut, 3), "max_cutoff_hz": q(max_cut, 3),
            "time_constant_at_1p2hz_ms": round(tau * 1000, 1),
            "smoothed_ankle_lift_at_contact_pct_leg": q(lift_at_contact, 1),
            "smoothed_ankle_back_within_threshold_after_contact_ms": q(lag_to_threshold, 1),
            "note": "One Euro raises its cutoff by beta x |filtered speed|; landmark speeds are in image heights per second (about 1 at most for an ankle in a jump), so beta 0.05 adds about 0.05 Hz"}


def app_leg_lengths(stream: str) -> dict:
    """Leg length as the app computes it at standing (near-side hip to ankle, aspect-corrected)."""
    idx = load(M / "streams" / "jump" / stream / "index.json")
    lms, aspect = idx["landmarks"], idx["aspect"]
    out = {}
    for m in idx["recordings"]:
        v = np.fromfile(M / "streams" / "jump" / stream / f"{m['recording']}.f64", dtype="<f8").reshape(m["frames"], len(lms), 3)
        h, a = v[:12, lms.index(23)], v[:12, lms.index(27)]
        out[m["recording"]] = float(np.median(np.hypot((h[:, 0] - a[:, 0]) * aspect, h[:, 1] - a[:, 1])))
    return out


def residual_lift(stream: str) -> dict:
    """Unsmoothed ankle lift (app definition, per leg length) 0.2 to 0.3 s after contact: above 0 when the
    feet land somewhere the camera sees higher than where they stood."""
    idx = load(M / "streams" / "jump" / stream / "index.json")
    lms = idx["landmarks"]
    legs = app_leg_lengths(stream)
    out = {}
    for m in idx["recordings"]:
        rid = m["recording"]
        r = REF[rid]
        if not r.get("reference_ok"):
            continue
        v = np.fromfile(M / "streams" / "jump" / stream / f"{rid}.f64", dtype="<f8").reshape(m["frames"], len(lms), 3)
        wl, wr = v[0, lms.index(27), 2], v[0, lms.index(28), 2]
        ank = (v[:, lms.index(27), 1] * wl + v[:, lms.index(28), 1] * wr) / (wl + wr)
        t = np.arange(m["frames"]) / m["fps"]
        post = (t >= r["contact_s"] + 0.2) & (t <= r["contact_s"] + 0.3)
        if post.any():
            out[rid] = float((np.median(ank[:12]) - np.median(ank[post])) / legs[rid])
    return out


def depth_change_m(rid: str, azimuth_deg: float) -> float:
    """How much farther from the camera the ankles are after landing than at standing (m; + = farther)."""
    r = REF[rid]
    a = math.radians(azimuth_deg)
    to_cam = (math.cos(a), math.sin(a))  # (left, forward) components of the direction towards the camera
    return -(r["landing_disp_left_m"] * to_cam[0] + r["landing_disp_forward_m"] * to_cam[1])


def landing_position():
    out = {}
    for stream, az in ((ADVISED, 35), (SIDE, 0)):
        lift = residual_lift(stream)
        dch = {rid: depth_change_m(rid, az) for rid in IN_SCOPE}
        none = one_jump(run("jump", stream, "none"))
        ortho = one_jump(run("jump", "ortho30", "none"))
        _, td_p, _ = timing_errors(none, IN_SCOPE)
        _, td_o, _ = timing_errors(ortho, IN_SCOPE)
        inc = {r: td_p[r] - td_o[r] for r in td_p if r in td_o}
        prod = run("jump", stream, "production")
        missed = [rid for rid in IN_SCOPE if len(prod[rid]["reps"]) != 1]
        found = [rid for rid in IN_SCOPE if len(prod[rid]["reps"]) == 1]
        rs = spearmanr([dch[r] for r in inc], [inc[r] for r in inc]).statistic if len(inc) > 5 else None
        rl = spearmanr([dch[r] for r in IN_SCOPE if r in lift], [lift[r] for r in IN_SCOPE if r in lift]).statistic
        out[stream] = {
            "ankle_depth_change_m": q(dch.values(), 3),
            "residual_lift_pct_leg": q([v * 100 for r, v in lift.items() if r in IN_SCOPE], 2),
            "trials_residual_lift_at_or_above_touchdown_threshold": sum(1 for r, v in lift.items() if r in IN_SCOPE and v >= 0.015),
            "spearman_depth_change_vs_residual_lift": round(float(rl), 3),
            "perspective_touchdown_increment_ms": q(inc.values(), 1),
            "spearman_depth_change_vs_perspective_increment": round(float(rs), 3) if rs is not None else None,
            "app_missed_jumps": len(missed),
            "depth_change_missed_m": q([dch[r] for r in missed], 3), "depth_change_found_m": q([dch[r] for r in found], 3),
            "residual_lift_missed_pct_leg": q([lift[r] * 100 for r in missed if r in lift], 2),
            "residual_lift_found_pct_leg": q([lift[r] * 100 for r in found if r in lift], 2),
        }
    return out


# ---------------------------------------------------------------------------------------- features
def feature_agreement(jumps: dict, rids, rng):
    out = {}
    for f, (crit, _, same_units) in CRITERIA.items():
        xs, ys, ss, rid_list = [], [], [], []
        for rid in rids:
            j = jumps.get(rid)
            if j is None:
                continue
            a, c = j["features"].get(f), REF[rid].get(crit)
            if fin(a) and fin(c):
                xs.append(a), ys.append(c), ss.append(SUBJ[rid]), rid_list.append(rid)
        n_subj = len(set(ss))
        blk = {"trials": len(xs), "of": len(rids), "coverage": round(len(xs) / len(rids), 3) if rids else None, "participants": n_subj}
        if len(xs) >= 10:
            blk["spearman_between_trials"] = round(float(spearmanr(xs, ys).statistic), 3)
            r = rmcorr(xs, ys, ss)
            blk["rmcorr"] = round(r, 3)
            blk["rmcorr_ci95"] = rmcorr_ci(xs, ys, ss, rng)
            # Leave-one-participant-out range: how much any single participant moves the estimate.
            loo = [rmcorr([x for x, s in zip(xs, ss) if s != d], [y for y, s in zip(ys, ss) if s != d], [s for s in ss if s != d])
                   for d in sorted(set(ss))]
            blk["rmcorr_leave_one_participant_out"] = [round(min(loo), 3), round(max(loo), 3)]
            if same_units:
                err = np.asarray(xs) - np.asarray(ys)
                blk["error_median"] = round(float(np.median(err)), 4)
                blk["error_limits_of_agreement"] = [round(float(err.mean() - 1.96 * err.std(ddof=1)), 4), round(float(err.mean() + 1.96 * err.std(ddof=1)), 4)]
                blk["criterion_median"] = round(float(np.median(ys)), 4)
                blk["within_person_sd_error"] = round(within_sd(err, ss), 4)
                blk["within_person_sd_criterion"] = round(within_sd(ys, ss), 4)
                blk["error_by_participant"] = per_participant(dict(zip(rid_list, err.tolist())), SUBJ, 4)
        out[f] = blk
    return out


def error_vs_landing_position(jumps: dict, az: float):
    """Does a feature's within-person error follow where the feet land? If so, a change in landing position
    would look like a change in the measurement."""
    dch = {rid: depth_change_m(rid, az) for rid in IN_SCOPE}
    out = {}
    for f, (crit, _, _) in CRITERIA.items():
        rows = [(jumps[r]["features"][f], REF[r][crit], dch[r], SUBJ[r]) for r in IN_SCOPE
                if r in jumps and fin(jumps[r]["features"].get(f)) and fin(REF[r].get(crit))]
        if len(rows) < 20:
            continue
        a, c, d, s = map(np.asarray, zip(*rows))
        # residual of the app value after a common within-person linear fit on the criterion
        ac, cc, dc = a.astype(float).copy(), c.astype(float).copy(), d.astype(float).copy()
        for sid in np.unique(s):
            m = s == sid
            ac[m] -= ac[m].mean()
            cc[m] -= cc[m].mean()
            dc[m] -= dc[m].mean()
        slope = float((ac * cc).sum() / (cc ** 2).sum()) if (cc ** 2).sum() > 0 else 0.0
        resid = ac - slope * cc
        # Size: the residual change for a typical within-person change in landing depth (1 SD), as a share of
        # the measurement's own within-person SD.
        k = float((resid * dc).sum() / (dc ** 2).sum()) if (dc ** 2).sum() > 0 else 0.0
        sd_d = math.sqrt(float((dc ** 2).mean()))
        sd_a = math.sqrt(float((ac ** 2).mean()))
        out[f] = {"spearman": round(float(spearmanr(resid, dc).statistic), 3),
                  "effect_of_1sd_depth_change_share_of_within_person_sd": round(abs(k) * sd_d / sd_a, 3) if sd_a > 0 else None}
    return out


def classify(feat_by_cond: dict) -> dict:
    """Apply the fixed decision rules. feat_by_cond: condition -> feature_agreement output."""
    out = {}

    def failures(blk, where):
        why = []
        if (blk.get("coverage") or 0) < COVERAGE_MIN:
            why.append(f"{where}: coverage {blk.get('coverage')} < {COVERAGE_MIN}")
        if (blk.get("rmcorr") if blk.get("rmcorr") is not None else -1) < RMCORR_MIN:
            why.append(f"{where}: rmcorr {blk.get('rmcorr')} < {RMCORR_MIN}")
        if (blk.get("rmcorr_ci95") or [-1])[0] < RMCORR_CI_LOW_MIN:
            why.append(f"{where}: rmcorr lower 95% bound {(blk.get('rmcorr_ci95') or [None])[0]} < {RMCORR_CI_LOW_MIN}")
        return why

    for f in FEATURES:
        base = feat_by_cond["advised"][f]
        core = failures(base, "advised")
        robust = failures(feat_by_cond["side"][f], "side view")
        for k in SEEDS:
            robust += failures(feat_by_cond[f"noise0.002_seed{k}"][f], f"jitter seed {k}")
        _, _, same_units = CRITERIA[f]
        name_ok = None
        if same_units and "error_median" in base:
            tol = max(NAME_TOL_S, NAME_TOL_REL * abs(base["criterion_median"]))
            name_ok = abs(base["error_median"]) <= tol
        if core:
            verdict = "not validated"
        elif robust:
            verdict = "validated in the advised view only"
        else:
            verdict = "validated"
        if verdict != "not validated" and name_ok is False:
            verdict += "; tracks change, but its value is offset from what the name says"
        out[f] = {"verdict": verdict, "reasons": core + robust, "name_matches_measure": name_ok}
    return out


def jump_section():
    rng = np.random.default_rng(SEED)
    res = {"in_scope_trials": len(IN_SCOPE), "excluded": {
        "no_reference": sorted(r for r, x in REF.items() if not x.get("reference_ok")),
        "not_upright_at_start": sorted(r for r, x in REF.items() if x.get("reference_ok") and not x.get("starts_upright"))},
        "contact_source": dict(Counter(x.get("contact_source") for x in REF.values() if x.get("reference_ok"))),
        "reference_check_ballistic_landing_minus_contact_ms": q([(x["landing_ballistic_s"] - x["contact_s"]) * 1000 for x in REF.values() if x.get("reference_ok")], 1),
        "reference_toe_takeoff_minus_ballistic_ms": q([(x["takeoff_toe_s"] - x["takeoff_s"]) * 1000 for x in REF.values() if x.get("reference_ok") and x.get("takeoff_toe_s")], 1),
        "reference_flight_s": q([REF[r]["flight_s"] for r in IN_SCOPE], 3)}
    res["consistency_with_phase4a"] = consistency_with_phase4a()
    res["ladder"] = ladder()
    res["frame_rates"] = frame_rates()
    res["candidate_flight_rule"] = candidate_flight_rule()
    res["one_euro"] = one_euro_mechanism()
    res["landing_position"] = landing_position()
    # Variants x camera set-ups (no jitter)
    res["variants"] = {}
    for stream in ["ortho30", *CAMERA_STREAMS]:
        for v in VARIANTS:
            rr = run("jump", stream, v)
            jumps = one_jump(rr)
            lr = last_real_time(stream)
            held = [rid for rid, j in jumps.items() if j["closedInHeldFrames"] and fin(j["tLanding"]) and j["tLanding"] + 0.5 > lr[rid] + 1e-9]
            res["variants"][f"{stream}/{v}"] = {
                "timing": timing_block(jumps, IN_SCOPE),
                "jumps_found_all_trials": sum(1 for r in REF if r in jumps), "trials": len(REF),
                "trials_with_more_than_one_jump": sum(1 for r in rr.values() if len(r["reps"]) > 1),
                "held_frames_used_by_a_measurement": len(held),
                "features": feature_agreement(jumps, IN_SCOPE, rng) if stream in (ADVISED, SIDE) or v in ("production", "dual_butter6") else None,
            }
    # Jitter runs (advised view)
    res["noise"] = {}
    for v in VARIANTS:
        for s in NOISE:
            for k in SEEDS:
                rr = run("jump", ADVISED, v, s, k)
                jumps = one_jump(rr)
                res["noise"][f"{v}/s{s}/seed{k}"] = {
                    "timing": timing_block(jumps, IN_SCOPE),
                    "jumps_found_all_trials": sum(1 for r in REF if r in jumps),
                    "trials_with_more_than_one_jump": sum(1 for r in rr.values() if len(r["reps"]) > 1),
                    "features": feature_agreement(jumps, IN_SCOPE, rng) if s == 0.002 else None,
                }
    # Fixed decision rules for each variant
    res["classification"] = {}
    for v in VARIANTS:
        cond = {"advised": res["variants"][f"{ADVISED}/{v}"]["features"], "side": res["variants"][f"{SIDE}/{v}"]["features"]}
        for k in SEEDS:
            cond[f"noise0.002_seed{k}"] = res["noise"][f"{v}/s0.002/seed{k}"]["features"]
        res["classification"][v] = classify(cond)
    res["error_vs_landing_position"] = {v: error_vs_landing_position(one_jump(run("jump", ADVISED, v)), 35) for v in ("production", "dual_butter6")}
    return res


# ---------------------------------------------------------------------------------------- missingness
def missingness(jump):
    prod = run("jump", ADVISED, "production")
    found = {rid: len(r["reps"]) == 1 for rid, r in prod.items()}
    subjects = sorted({r["subject"] for r in REF.values()})
    per = {s: Counter() for s in subjects}
    for rid, ok in found.items():
        r = REF[rid]
        per[r["subject"]][(r["condition"], ok)] += 1
    complete = [s for s in subjects if per[s][("non_fatigued", True)] == 3 and per[s][("fatigued", True)] == 3]
    incomplete = [s for s in subjects if s not in complete]
    # Why each missing trial is missing
    why = {}
    for rid, ok in found.items():
        if ok:
            continue
        r = REF[rid]
        log = prod[rid].get("phaseLog", [])
        phases = [p for _, p in log]
        if not r.get("starts_upright", True):
            why[rid] = "starts crouched (no upright standing reference)"
        elif "flight" in phases and "landing" not in phases[phases.index("flight"):]:
            why[rid] = "touchdown never detected"
        elif "landing" in phases:
            why[rid] = "jump rejected: detected flight outside 0.12 to 1.0 s"
        else:
            why[rid] = "take-off never detected"
    # Trial-level: by group and condition
    tbl = defaultdict(lambda: [0, 0])
    for rid, ok in found.items():
        r = REF[rid]
        g = PART[r["subject"]]["group"]
        tbl[f"{g}/{r['condition']}"][0] += (not ok)
        tbl[f"{g}/{r['condition']}"][1] += 1
    # Participant-level comparison, complete vs incomplete, on descriptors and on each person's lab jump
    # measures averaged over ALL their trials (so the comparison does not depend on what the app found).
    lab_mean = defaultdict(dict)
    for key in ("flight_s", "com_rise_per_leg", "com_depth_per_leg", "landing_disp_forward_m", "trunk_sagittal_peak_deg"):
        for s in subjects:
            vals = [x[key] for x in REF.values() if x["subject"] == s and x.get("reference_ok") and fin(x.get(key))]
            lab_mean[s][key] = float(np.mean(vals)) if vals else None
        for s in subjects:
            vals = [depth_change_m(rid, 35) for rid, x in REF.items() if x["subject"] == s and x.get("reference_ok")]
            lab_mean[s]["ankle_depth_change_advised_m"] = float(np.mean(vals)) if vals else None

    def compare(get):
        a = [get(s) for s in complete if fin(get(s))]
        b = [get(s) for s in incomplete if fin(get(s))]
        if len(a) < 3 or len(b) < 3:
            return None
        sp = math.sqrt(((len(a) - 1) * np.var(a, ddof=1) + (len(b) - 1) * np.var(b, ddof=1)) / (len(a) + len(b) - 2))
        g = (np.mean(b) - np.mean(a)) / sp if sp > 0 else 0.0
        return {"complete_median": round(float(np.median(a)), 3), "incomplete_median": round(float(np.median(b)), 3),
                "smd_incomplete_minus_complete": round(float(g), 2), "mann_whitney_p": round(float(mannwhitneyu(a, b).pvalue), 3),
                "n": [len(a), len(b)]}

    descriptors = {}
    for key in ("age_y", "height_m", "mass_kg", "bmi", "leg_length_m", "jump_height_pre_cm", "jump_height_post_cm", "activity_days_per_week"):
        descriptors[key] = compare(lambda s, k=key: PART[s].get(k))
    for key in ("flight_s", "com_rise_per_leg", "com_depth_per_leg", "landing_disp_forward_m", "trunk_sagittal_peak_deg", "ankle_depth_change_advised_m"):
        descriptors[f"lab_{key}"] = compare(lambda s, k=key: lab_mean[s].get(k))
    cat = {}
    for key, levels in (("group", ("control", "ACL")), ("sex", ("female", "male"))):
        t = [[sum(PART[s][key] == lv for s in complete) for lv in levels], [sum(PART[s][key] == lv for s in incomplete) for lv in levels]]
        cat[key] = {"levels": levels, "complete": t[0], "incomplete": t[1], "fisher_p": round(float(fisher_exact(t).pvalue), 3)}
    # Trial-level: found vs missing trials, on their lab measures
    trial_cmp = {}
    for key in ("flight_s", "com_rise_per_leg", "landing_disp_forward_m"):
        a = [REF[r][key] for r in REF if REF[r].get("reference_ok") and found[r]]
        b = [REF[r][key] for r in REF if REF[r].get("reference_ok") and not found[r]]
        trial_cmp[key] = {"found_median": round(float(np.median(a)), 3), "missing_median": round(float(np.median(b)), 3), "n": [len(a), len(b)],
                          "mann_whitney_p": round(float(mannwhitneyu(a, b).pvalue), 4)}
    trial_cmp["ankle_depth_change_advised_m"] = {
        "found_median": round(float(np.median([depth_change_m(r, 35) for r in REF if REF[r].get("reference_ok") and found[r]])), 3),
        "missing_median": round(float(np.median([depth_change_m(r, 35) for r in REF if REF[r].get("reference_ok") and not found[r]])), 3)}
    # Coverage under each variant: participants with 3 + 3, and the missing trials by group and condition
    by_variant = {}
    for v in VARIANTS:
        rr = run("jump", ADVISED, v)
        okv = {rid: len(r["reps"]) == 1 for rid, r in rr.items()}
        perv = {s: Counter() for s in subjects}
        for rid, ok in okv.items():
            perv[REF[rid]["subject"]][(REF[rid]["condition"], ok)] += 1
        comp = [s for s in subjects if perv[s][("non_fatigued", True)] == 3 and perv[s][("fatigued", True)] == 3]
        upright_ok = {rid: ok and REF[rid].get("starts_upright", False) for rid, ok in okv.items()}
        per_u = {s: Counter() for s in subjects}
        for rid, ok in upright_ok.items():
            per_u[REF[rid]["subject"]][(REF[rid]["condition"], ok)] += 1
        comp_u = [s for s in subjects if per_u[s][("non_fatigued", True)] == 3 and per_u[s][("fatigued", True)] == 3]
        two_u = [s for s in subjects if per_u[s][("non_fatigued", True)] >= 2 and per_u[s][("fatigued", True)] >= 2]
        one_u = [s for s in subjects if per_u[s][("non_fatigued", True)] >= 1 and per_u[s][("fatigued", True)] >= 1]
        t2 = defaultdict(lambda: [0, 0])
        for rid, ok in okv.items():
            t2[f"{PART[REF[rid]['subject']]['group']}/{REF[rid]['condition']}"][0] += (not ok)
            t2[f"{PART[REF[rid]['subject']]['group']}/{REF[rid]['condition']}"][1] += 1
        by_variant[v] = {"participants_3_plus_3": len(comp), "missing_trials": sum(not x for x in okv.values()),
                         "participants_3_plus_3_upright_trials_only": len(comp_u),
                         "participants_2_plus_2_upright_trials_only": len(two_u),
                         "participants_1_plus_1_upright_trials_only": len(one_u),
                         "complete_upright_by_group": dict(Counter(PART[s]["group"] for s in comp_u)),
                         "complete_upright_by_sex": dict(Counter(PART[s]["sex"] for s in comp_u)),
                         "missing_by_group_condition": {k: v2 for k, v2 in sorted(t2.items())},
                         "missing_trials_list": sorted(r for r, ok in okv.items() if not ok)}
    return {"participants": len(subjects), "complete_3_plus_3": complete, "incomplete": incomplete,
            "incomplete_detail": {s: {"group": PART[s]["group"], "found_fresh": per[s][("non_fatigued", True)], "found_post": per[s][("fatigued", True)],
                                      "trials_fresh": per[s][("non_fatigued", True)] + per[s][("non_fatigued", False)],
                                      "trials_post": per[s][("fatigued", True)] + per[s][("fatigued", False)]} for s in incomplete},
            "missing_reason": dict(Counter(why.values())), "missing_reason_by_trial": why,
            "missing_by_group_condition": {k: v for k, v in sorted(tbl.items())},
            "participant_comparison": descriptors, "participant_categorical": cat, "trial_comparison": trial_cmp,
            "by_variant": by_variant}


# ---------------------------------------------------------------------------------------- REHAB24-6
def iou(a0, a1, b0, b1):
    inter = max(0.0, min(a1, b1) - max(a0, b0))
    union = max(a1, b1) - min(a0, b0)
    return inter / union if union > 0 else 0.0


def inside(a0, a1, b0, b1):
    """Share of the detected interval [a0, a1] that lies inside the annotated one [b0, b1]."""
    inter = max(0.0, min(a1, b1) - max(a0, b0))
    return inter / (a1 - a0) if a1 > a0 else 0.0


def match_video(dets, anns, thr, rule="iou"):
    """Greedy one-to-one matching by the highest score (>= thr). Returns [(det, ann, score)].
    rule "iou": intersection over union. rule "inside": share of the detected rep inside the annotated rep."""
    score = iou if rule == "iou" else inside
    pairs = sorted(((score(d["tStart"], d["tEnd"], a["t_start"], a["t_end"]), i, j) for i, d in enumerate(dets) for j, a in enumerate(anns)), reverse=True)
    used_d, used_a, out = set(), set(), []
    for v, i, j in pairs:
        if v < thr:
            break
        if i in used_d or j in used_a:
            continue
        used_d.add(i), used_a.add(j)
        out.append((dets[i], anns[j], v))
    return out


REHAB_REF = load(M / "references" / "rehab.json")["videos"] if (M / "references" / "rehab.json").exists() else {}


def annotated_truth(m):
    return m["reps"]


def app_definition_truth(m):
    """The app's own rep boundaries computed on the 3D skeleton (see build_streams.rehab_references). Annotated
    reps for which that definition gives no complete rep are excluded, and counted separately."""
    ideal = {r["number"]: r for r in REHAB_REF[m["recording"]]["reps"]}
    out = []
    for a in m["reps"]:
        i = ideal[a["number"]]
        ok = i["t_start"] is not None and i["t_end"] is not None
        out.append({**a, "t_start": i["t_start"] if ok else a["t_start"], "t_end": i["t_end"] if ok else a["t_end"],
                    "mocap_error": a["mocap_error"] or not ok, "no_app_definition_rep": not ok})
    return out


def seg_scores(res, index, thr=0.5, rule="iou", truth=annotated_truth):
    tp = fp = fn = 0
    by_person = defaultdict(lambda: [0, 0, 0])
    start_err, end_err, ious = [], [], []
    start_by_person, end_by_person = defaultdict(list), defaultdict(list)
    count_err = []
    recall_by_correct = {True: [0, 0], False: [0, 0]}
    no_def = 0
    for m in index["recordings"]:
        dets = res[m["recording"]]["reps"]
        anns = truth(m)
        no_def += sum(1 for a in anns if a.get("no_app_definition_rep"))
        person = m["person"]
        matches = match_video(dets, anns, thr, rule)
        matched_d = {id(d) for d, _, _ in matches}
        matched_a = {a["number"]: (d, v) for d, a, v in matches}
        excl_dets = sum(1 for d, a, _ in matches if a["mocap_error"])
        n_ann = sum(1 for a in anns if not a["mocap_error"])
        t = sum(1 for d, a, _ in matches if not a["mocap_error"])
        f_p = len(dets) - len(matched_d)
        # A detection that overlaps an excluded (mocap-error) rep without matching it is not held against the app.
        f_p -= sum(1 for d in dets if id(d) not in matched_d and any(a["mocap_error"] and iou(d["tStart"], d["tEnd"], a["t_start"], a["t_end"]) > 0 for a in anns))
        tp += t
        fp += f_p
        fn += n_ann - t
        by_person[person][0] += t
        by_person[person][1] += f_p
        by_person[person][2] += n_ann - t
        count_err.append(len(dets) - excl_dets - n_ann)
        for d, a, v in matches:
            if a["mocap_error"]:
                continue
            start_err.append(d["tStart"] - a["t_start"])
            end_err.append(d["tEnd"] - a["t_end"])
            start_by_person[person].append(d["tStart"] - a["t_start"])
            end_by_person[person].append(d["tEnd"] - a["t_end"])
            ious.append(v)
        for a in anns:
            if a["mocap_error"]:
                continue
            recall_by_correct[a["correct"]][1] += 1
            recall_by_correct[a["correct"]][0] += a["number"] in matched_a

    def prf(t, p, n):
        pr = t / (t + p) if t + p else None
        rc = t / (t + n) if t + n else None
        f1 = 2 * pr * rc / (pr + rc) if pr and rc else 0.0
        return {"precision": round(pr, 3) if pr is not None else None, "recall": round(rc, 3) if rc is not None else None, "f1": round(f1, 3)}

    persons = {p: prf(*v) for p, v in sorted(by_person.items())}
    return {"tp": tp, "fp": fp, "fn": fn, **prf(tp, fp, fn),
            "f1_by_person": q([v["f1"] for v in persons.values()], 3), "recall_by_person": q([v["recall"] for v in persons.values()], 3),
            "precision_by_person": q([v["precision"] for v in persons.values() if v["precision"] is not None], 3),
            "per_person": persons,
            "count_error_per_video": q(count_err, 1),
            "start_error_s": q(start_err, 3), "end_error_s": q(end_err, 3), "iou": q(ious, 3),
            "start_error_s_by_person": q([np.median(v) for v in start_by_person.values()], 3),
            "end_error_s_by_person": q([np.median(v) for v in end_by_person.values()], 3),
            "recall_correct_reps": round(recall_by_correct[True][0] / recall_by_correct[True][1], 3) if recall_by_correct[True][1] else None,
            "recall_incorrect_reps": round(recall_by_correct[False][0] / recall_by_correct[False][1], 3) if recall_by_correct[False][1] else None,
            "reps_correct_incorrect": [recall_by_correct[True][1], recall_by_correct[False][1]],
            "annotated_reps_with_no_app_definition_rep": no_def}


def rehab_feature_validity(res, index, rng):
    """Within-person agreement of the app's squat and lunge measurements with the 3D skeleton, for found reps
    (linked to annotated reps by the 'inside >= 0.5' rule). Criteria: knee = peak 3D knee flexion of the leg on
    the camera side (left); depth = 3D hip drop per 3D leg length; asymmetry = |left - right| peak 3D knee flexion;
    trunk lean = peak 3D trunk inclination (hips to neck); hip ROM = 3D left hip flexion range (shoulder-hip-knee);
    rep duration = the app's own rep definition applied to the 3D hip height (build_streams.rehab_references)."""
    rows = defaultdict(list)
    for m in index["recordings"]:
        leg = REHAB_REF[m["recording"]]["leg_length_3d_m"]
        ideal = {x["number"]: x for x in REHAB_REF[m["recording"]]["reps"]}
        for d, a, _ in match_video(res[m["recording"]]["reps"], m["reps"], 0.5, "inside"):
            if a["mocap_error"]:
                continue
            v, lab, idl = d["features"], a["lab_reference"], ideal[a["number"]]
            if fin(v.get("trunkLean")):
                rows["trunkLean"].append((v["trunkLean"], idl["trunk_3d_peak_deg"], m["person"]))
            if fin(v.get("hipRom")):
                rows["hipRom"].append((v["hipRom"], idl["hip_flex_3d_rom_deg"], m["person"]))
            if fin(v.get("repDuration")) and fin(idl.get("t_start")) and fin(idl.get("t_end")):
                rows["repDuration"].append((v["repDuration"], idl["t_end"] - idl["t_start"], m["person"]))
            pk = lab["knee_flex_3d_peak_deg"]
            if fin(v.get("kneeRomL")):
                rows["kneeRomL"].append((v["kneeRomL"], pk[0], m["person"]))
            if fin(v.get("depth")) and fin(lab.get("hip_drop_m")):
                rows["depth"].append((v["depth"], lab["hip_drop_m"] / leg, m["person"]))
            if fin(v.get("asymmetry")):
                rows["asymmetry"].append((v["asymmetry"], abs(pk[0] - pk[1]), m["person"]))
    out = {}
    for f, rr in rows.items():
        x, y, s = (list(z) for z in zip(*rr))
        out[f] = {"reps": len(rr), "persons": len(set(s)), "spearman_between_reps": round(float(spearmanr(x, y).statistic), 3),
                  "rmcorr": round(rmcorr(x, y, s), 3), "rmcorr_ci95": rmcorr_ci(x, y, s, rng)}
    return out


def rehab_section():
    rng = np.random.default_rng(SEED + 1)
    out = {}
    for ex, view, primary in (("ex6_squat", "oblique35", True), ("ex6_squat", "side", False), ("ex5_lunge", "side", True), ("ex5_lunge", "oblique35", False)):
        index = load(P / "landmarks" / "rehab" / ex / view / "index.json")
        blk = {"primary_view": primary, "videos": len(index["recordings"]), "persons": len({m["person"] for m in index["recordings"]}),
               "annotated_reps": sum(len(m["reps"]) for m in index["recordings"]),
               "excluded_mocap_error_reps": sum(a["mocap_error"] for m in index["recordings"] for a in m["reps"]), "variants": {}}
        for v in VARIANTS:
            res = run("rehab", f"{ex}/{view}", v)
            blk["variants"][v] = {"iou0.5": seg_scores(res, index, 0.5), "iou0.3": seg_scores(res, index, 0.3),
                                  "inside0.5": seg_scores(res, index, 0.5, "inside"),
                                  "app_definition_iou0.5": seg_scores(res, index, 0.5, "iou", app_definition_truth),
                                  "measurement_validity": rehab_feature_validity(res, index, rng) if v in ("production", "dual_butter6") else None}
        if primary:
            blk["noise"] = {}
            for v in VARIANTS:
                for s in NOISE:
                    rr = [run("rehab", f"{ex}/{view}", v, s, k) for k in SEEDS]
                    blk["noise"][f"{v}/s{s}"] = {"inside0.5": [seg_scores(x, index, 0.5, "inside") for x in rr],
                                                 "app_definition_iou0.5": [seg_scores(x, index, 0.5, "iou", app_definition_truth) for x in rr]}
        out[f"{ex}/{view}"] = blk
    return out


# ---------------------------------------------------------------------------------------- tables
def write_tables(s):
    L = []
    w = L.append
    j = s["jump"]
    w("# Phase 4A.5 generated tables")
    w("")
    w("Generated by `research/measurement/analyze.py` from motion capture seen through a virtual camera and run through the app's own code. "
      "Offline best case: no MediaPipe, no tracking noise unless stated. No fresh-versus-post-fatigue or correct-versus-incorrect comparison of any score or measurement.")
    w("")
    w(f"Jump trials in scope: {j['in_scope_trials']} of {len(REF)} (excluded: no reference {len(j['excluded']['no_reference'])}, "
      f"not upright at the start {len(j['excluded']['not_upright_at_start'])}: {', '.join(j['excluded']['not_upright_at_start'])}).")
    w("")
    w("## J1. Harness reproduces Phase 4A")
    w("")
    for k, v in j["consistency_with_phase4a"].items():
        w(f"- {k}: {v['identical_to_phase4a']} of {v['recordings']} recordings identical (reps, timing, measurements)")
    w("")
    w("## J2. Reference checks")
    w("")
    w(f"- Free-fall landing minus force-plate contact, ms: {fmt(j['reference_check_ballistic_landing_minus_contact_ms'])}")
    w(f"- Toe-marker take-off (1 cm) minus free-fall take-off, ms: {fmt(j['reference_toe_takeoff_minus_ballistic_ms'])}")
    w(f"- Reference flight time, s: {fmt(j['reference_flight_s'])}")
    w(f"- Contact index used: {j['contact_source']}")
    w("")
    w("## J3. Where the touchdown delay comes from (one step at a time)")
    w("")
    w("Errors are app minus reference (take-off: free-fall take-off of the centre of mass; touchdown: force-plate contact). Changes are paired, trial by trial.")
    w("")
    w("| Step | Jumps found | Take-off error, ms | Touchdown error, ms | Flight error, ms | Change from previous step: take-off / touchdown / flight, ms |")
    w("|---|---|---|---|---|---|")
    for b in j["ladder"]:
        ch = "-" if "touchdown_change_from_previous_ms" not in b else \
            f"{fmt(b['takeoff_change_from_previous_ms'])} / {fmt(b['touchdown_change_from_previous_ms'])} / {fmt(b['flight_change_from_previous_ms'])}"
        w(f"| {b['label']} | {b['jumps_found']}/{b['of']} | {fmt(b['takeoff_error_ms'])} | {fmt(b['touchdown_error_ms'])} | {fmt(b['flight_error_ms'])} | {ch} |")
    w("")
    w("### Frame rate")
    w("")
    w("| Stream | Variant | Jumps found | Missed without reaching propulsion | Take-off error, ms | Touchdown error, ms | Flight error, ms |")
    w("|---|---|---|---|---|---|---|")
    for k, b in j["frame_rates"].items():
        w(f"| {b['label']} | {VARIANT_LABEL[b['variant']]} | {b['jumps_found']}/{b['of']} | {b['missed_without_reaching_propulsion']} | {fmt(b['takeoff_error_ms'])} | {fmt(b['touchdown_error_ms'])} | {fmt(b['flight_error_ms'])} |")
    w("")
    w("### Candidate flight rule (prototype, not app code)")
    w("")
    w("Same thresholds, applied to the lowest point of each foot (heel or toe landmark) instead of the ankle; apex-based crossings on the Phase 4A 30 fps streams.")
    w("")
    w("| View / landmark / filter | Measured | Take-off error, ms | Touchdown error, ms | Flight error, ms | Flight error by participant, ms | Flight rmcorr | Within-person SD: error vs true flight, s |")
    w("|---|---|---|---|---|---|---|---|")
    for k, b in j["candidate_flight_rule"].items():
        w(f"| {k} | {b['measured']}/{b['of']} | {fmt(b['takeoff_error_ms'])} | {fmt(b['touchdown_error_ms'])} | {fmt(b['flight_error_ms'])} | {fmt(b['flight_error_ms_by_participant'])} | "
          f"{b['flight_rmcorr']} | {b['within_person_sd_error_s']} vs {b['within_person_sd_criterion_s']} |")
    w("")
    w("Participant level (each participant's median, then across participants):")
    w("")
    for b in j["ladder"]:
        w(f"- {b['label']}: touchdown {fmt(b['touchdown_error_ms_by_participant'])}; flight {fmt(b['flight_error_ms_by_participant'])}")
    w("")
    oe = j["one_euro"]
    w(f"One Euro in flight: median cutoff {fmt(oe['median_cutoff_in_flight_hz'])} Hz; largest cutoff in a trial {fmt(oe['max_cutoff_hz'])} Hz; "
      f"time constant at 1.2 Hz {oe['time_constant_at_1p2hz_ms']} ms. Smoothed ankle still {fmt(oe['smoothed_ankle_lift_at_contact_pct_leg'])} % of leg length above standing at contact; "
      f"back within the 1.5 % threshold {fmt(oe['smoothed_ankle_back_within_threshold_after_contact_ms'])} ms after contact.")
    w("")
    w("## J4. Landing position and perspective")
    w("")
    w("| | Advised (35°) | Side (0°) |")
    w("|---|---|---|")
    lp = j["landing_position"]
    for k, label in (("ankle_depth_change_m", "Ankles farther from camera after landing than at standing, m"),
                     ("residual_lift_pct_leg", "Unsmoothed ankle 'lift' 0.2 to 0.3 s after contact, % leg"),
                     ("trials_residual_lift_at_or_above_touchdown_threshold", "Trials where that lift is >= the 1.5 % touchdown threshold"),
                     ("spearman_depth_change_vs_residual_lift", "Spearman: depth change vs residual lift"),
                     ("perspective_touchdown_increment_ms", "Touchdown delay added by perspective (unsmoothed), ms"),
                     ("spearman_depth_change_vs_perspective_increment", "Spearman: depth change vs that delay"),
                     ("app_missed_jumps", "Jumps the app misses"),
                     ("depth_change_missed_m", "Depth change, missed jumps, m"), ("depth_change_found_m", "Depth change, found jumps, m"),
                     ("residual_lift_missed_pct_leg", "Residual lift, missed jumps, % leg"), ("residual_lift_found_pct_leg", "Residual lift, found jumps, % leg")):
        w(f"| {label} | {fmt(lp[ADVISED][k])} | {fmt(lp[SIDE][k])} |")
    w("")
    w("## J5. Signal-chain variants, advised view, no jitter")
    w("")
    w("| Variant | Jumps found (all 256) | In scope | Take-off error, ms | Touchdown error, ms | Flight error, ms | >1 jump in a trial |")
    w("|---|---|---|---|---|---|---|")
    for v in VARIANTS:
        b = j["variants"][f"{ADVISED}/{v}"]
        t = b["timing"]
        w(f"| {VARIANT_LABEL[v]} | {b['jumps_found_all_trials']} | {t['jumps_found']}/{t['of']} | {fmt(t['takeoff_error_ms'])} | {fmt(t['touchdown_error_ms'])} | {fmt(t['flight_error_ms'])} | {b['trials_with_more_than_one_jump']} |")
    w("")
    w("Participant-level touchdown error (median of each participant, then across participants), ms:")
    w("")
    for v in VARIANTS:
        w(f"- {VARIANT_LABEL[v]}: {fmt(j['variants'][f'{ADVISED}/{v}']['timing']['touchdown_error_ms_by_participant'])}")
    w("")
    w("## J6. With landmark jitter (advised view; three seeds each)")
    w("")
    w("| Variant | Jitter (image heights) | Jumps found (all 256), per seed | >1 jump, per seed | Touchdown error median, ms, per seed | Flight error median, ms, per seed |")
    w("|---|---|---|---|---|---|")
    for v in VARIANTS:
        for s_ in NOISE:
            rows = [j["noise"][f"{v}/s{s_}/seed{k}"] for k in SEEDS]
            w(f"| {VARIANT_LABEL[v]} | {s_} | {', '.join(str(r['jumps_found_all_trials']) for r in rows)} | {', '.join(str(r['trials_with_more_than_one_jump']) for r in rows)} | "
              f"{', '.join(str((r['timing']['touchdown_error_ms'] or {}).get('median')) for r in rows)} | {', '.join(str((r['timing']['flight_error_ms'] or {}).get('median')) for r in rows)} |")
    w("")
    w("## J7. Camera set-ups")
    w("")
    w("| Camera | Variant | Jumps found (all 256) | Touchdown error, ms | Flight error, ms | Landing knee flexion rmcorr | Depth rmcorr | Jump height rmcorr | Trunk lean rmcorr |")
    w("|---|---|---|---|---|---|---|---|---|")
    for st in CAMERA_STREAMS:
        for v in ("production", "dual_butter6"):
            b = j["variants"][f"{st}/{v}"]
            fe = b["features"] or {}
            r_ = lambda f: fe.get(f, {}).get("rmcorr")  # noqa: E731
            w(f"| {st} | {VARIANT_LABEL[v]} | {b['jumps_found_all_trials']} | {fmt(b['timing']['touchdown_error_ms'])} | {fmt(b['timing']['flight_error_ms'])} | "
              f"{r_('landingKneeFlex')} | {r_('countermovementDepth')} | {r_('jumpHeight')} | {r_('trunkLean')} |")
    w("")
    w("## J8. Each jump measurement against its lab criterion")
    w("")
    w("Criteria: " + "; ".join(f"{f}: {c[1]}" for f, c in CRITERIA.items()) + ".")
    w("")
    for v in VARIANTS:
        w(f"### {VARIANT_LABEL[v]}")
        w("")
        w("| Measurement | Coverage (advised) | Spearman, between trials | Within-person rmcorr [95% CI] | Leave-one-participant-out | Side view: coverage, rmcorr | rmcorr with 0.002 jitter (3 seeds) | Median error (same units) | Verdict | Checks not met |")
        w("|---|---|---|---|---|---|---|---|---|---|")
        for f in FEATURES:
            a = j["variants"][f"{ADVISED}/{v}"]["features"][f]
            sv = j["variants"][f"{SIDE}/{v}"]["features"][f]
            nz = [j["noise"][f"{v}/s0.002/seed{k}"]["features"][f].get("rmcorr") for k in SEEDS]
            c = j["classification"][v][f]
            err = f"{a['error_median']} (crit. median {a['criterion_median']})" if "error_median" in a else "n/a"
            w(f"| {f} | {a['trials']}/{a['of']} | {a.get('spearman_between_trials')} | {a.get('rmcorr')} {a.get('rmcorr_ci95')} | {a.get('rmcorr_leave_one_participant_out')} | "
              f"{sv.get('coverage')}, {sv.get('rmcorr')} | {', '.join(str(x) for x in nz)} | {err} | {c['verdict']} | {'; '.join(c['reasons']) or '-'} |")
        w("")
    w("Within-person spread, same-unit measurements (advised view): SD of the app's error vs SD of the criterion, both within person, s:")
    w("")
    for v in VARIANTS:
        fe = j["variants"][f"{ADVISED}/{v}"]["features"]
        w(f"- {VARIANT_LABEL[v]}: " + "; ".join(f"{f} {fe[f].get('within_person_sd_error')} vs {fe[f].get('within_person_sd_criterion')}" for f in FEATURES if CRITERIA[f][2]))
    w("")
    w("Within-person error vs landing position: Spearman of each measurement's within-person residual (after a common within-person fit on its criterion) "
      "with the within-person change in ankle depth from the camera; and the residual change for a 1 SD depth change as a share of the measurement's within-person SD:")
    w("")
    for v, d in j["error_vs_landing_position"].items():
        w(f"- {VARIANT_LABEL[v]}: " + ", ".join(f"{k} {x['spearman']} ({x['effect_of_1sd_depth_change_share_of_within_person_sd']})" for k, x in d.items()))
    w("")
    mi = s["missingness"]
    w("## J9. Missing jumps (app now, advised view)")
    w("")
    w(f"Participants with 3 + 3: {len(mi['complete_3_plus_3'])} of {mi['participants']}. Incomplete: {', '.join(mi['incomplete'])}.")
    w("")
    w("| Participant | Group | Found fresh | Found post-protocol |")
    w("|---|---|---|---|")
    for sid, d in mi["incomplete_detail"].items():
        w(f"| {sid} | {d['group']} | {d['found_fresh']}/{d['trials_fresh']} | {d['found_post']}/{d['trials_post']} |")
    w("")
    w("Why trials are missing: " + "; ".join(f"{k}: {v}" for k, v in mi["missing_reason"].items()) + ".")
    w("")
    w("Missing trials by group and condition (missing / trials): " + "; ".join(f"{k} {v[0]}/{v[1]}" for k, v in mi["missing_by_group_condition"].items()) + ".")
    w("")
    w("| Participant measure | Complete, median | Incomplete, median | SMD (incomplete - complete) | Mann-Whitney p | n |")
    w("|---|---|---|---|---|---|")
    for k, v in mi["participant_comparison"].items():
        if v:
            w(f"| {k} | {v['complete_median']} | {v['incomplete_median']} | {v['smd_incomplete_minus_complete']} | {v['mann_whitney_p']} | {v['n'][0]} vs {v['n'][1]} |")
    for k, v in mi["participant_categorical"].items():
        w(f"| {k} ({'/'.join(v['levels'])}) | {v['complete']} | {v['incomplete']} | | Fisher {v['fisher_p']} | |")
    w("")
    w("Trial level, found vs missing: " + "; ".join(f"{k}: {v['found_median']} vs {v['missing_median']}" + (f" (p {v['mann_whitney_p']})" if 'mann_whitney_p' in v else "") for k, v in mi["trial_comparison"].items()) + ".")
    w("")
    w("Usable sample by variant (advised view), counting only trials that start upright: " + "; ".join(
        f"{VARIANT_LABEL[v]}: 3 + 3 {d['participants_3_plus_3_upright_trials_only']} ({d['complete_upright_by_group']}, {d['complete_upright_by_sex']}), "
        f"2 + 2 {d['participants_2_plus_2_upright_trials_only']}, 1 + 1 {d['participants_1_plus_1_upright_trials_only']}" for v, d in mi["by_variant"].items()) + ".")
    w("")
    w("Coverage by variant (advised view): " + "; ".join(f"{VARIANT_LABEL[v]}: {d['participants_3_plus_3']} with 3 + 3, {d['missing_trials']} missing trials "
                                                       f"({', '.join(f'{k} {x[0]}/{x[1]}' for k, x in d['missing_by_group_condition'].items())})" for v, d in mi["by_variant"].items()) + ".")
    w("")
    r = s["rehab"]
    w("## R1. REHAB24-6 segmentation against the annotated reps")
    w("")
    w("Matching is one-to-one, greedy by score. 'IoU >= 0.5' is the draft protocol's rule. 'Inside >= 0.5': at least half of the detected rep lies within the annotated rep. "
      "Mocap-error reps are excluded (detections on them are not counted against the app).")
    w("")
    w("| Set | Variant | IoU >= 0.5: TP / FP / FN | P | R | F1 | F1 by person | IoU >= 0.3: P / R / F1 | Inside >= 0.5: TP / FP / FN | P / R / F1 | F1 by person (inside) | Recall correct / incorrect (inside) | Start error vs annotation, s | End error vs annotation, s | Count error per video |")
    w("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for key, blk in r.items():
        for v in VARIANTS:
            a, b, c = blk["variants"][v]["iou0.5"], blk["variants"][v]["iou0.3"], blk["variants"][v]["inside0.5"]
            w(f"| {key}{' (advised)' if blk['primary_view'] else ''} | {VARIANT_LABEL[v]} | {a['tp']} / {a['fp']} / {a['fn']} | {a['precision']} | {a['recall']} | {a['f1']} | {fmt(a['f1_by_person'])} | "
              f"{b['precision']} / {b['recall']} / {b['f1']} | {c['tp']} / {c['fp']} / {c['fn']} | {c['precision']} / {c['recall']} / {c['f1']} | {fmt(c['f1_by_person'])} | "
              f"{c['recall_correct_reps']} / {c['recall_incorrect_reps']} | {fmt(c['start_error_s'])} | {fmt(c['end_error_s'])} | {fmt(c['count_error_per_video'])} |")
    w("")
    w("## R2. REHAB24-6 segmentation against the app's own rep definition on the 3D skeleton (IoU >= 0.5)")
    w("")
    w("| Set | Variant | Annotated reps with no rep under the app's definition | TP / FP / FN | Precision | Recall | F1 | F1 by person | Start error, s | End error, s | Start error by person, s | End error by person, s |")
    w("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for key, blk in r.items():
        for v in VARIANTS:
            a = blk["variants"][v]["app_definition_iou0.5"]
            w(f"| {key}{' (advised)' if blk['primary_view'] else ''} | {VARIANT_LABEL[v]} | {a['annotated_reps_with_no_app_definition_rep']} | {a['tp']} / {a['fp']} / {a['fn']} | {a['precision']} | {a['recall']} | {a['f1']} | "
              f"{fmt(a['f1_by_person'])} | {fmt(a['start_error_s'])} | {fmt(a['end_error_s'])} | {fmt(a['start_error_s_by_person'])} | {fmt(a['end_error_s_by_person'])} |")
    w("")
    w("Per person, app now, advised view (annotation, IoU >= 0.5 | inside >= 0.5 | app definition):")
    w("")
    for key, blk in r.items():
        if blk["primary_view"]:
            pv = blk["variants"]["production"]
            w(f"- {key}: " + "; ".join(f"person {p}: F1 {v['f1']} | {pv['inside0.5']['per_person'][p]['f1']} | {pv['app_definition_iou0.5']['per_person'].get(p, {}).get('f1')}"
                                       for p, v in pv["iou0.5"]["per_person"].items()))
    w("")
    w("## R3. REHAB24-6 measurements against the 3D skeleton (found reps; within-person over each person's reps)")
    w("")
    w("| Set | Variant | Measurement | Reps | Persons | Spearman, between reps | rmcorr [95% CI] |")
    w("|---|---|---|---|---|---|---|")
    for key, blk in r.items():
        for v in ("production", "dual_butter6"):
            for f, x in (blk["variants"][v]["measurement_validity"] or {}).items():
                w(f"| {key} | {VARIANT_LABEL[v]} | {f} | {x['reps']} | {x['persons']} | {x['spearman_between_reps']} | {x['rmcorr']} {x['rmcorr_ci95']} |")
    w("")
    w("With jitter (advised views; per seed): F1 inside >= 0.5 against annotations; F1 and median start error against the app's definition.")
    w("")
    for key, blk in r.items():
        if blk.get("noise"):
            for k, d in blk["noise"].items():
                w(f"- {key} {k}: annotation F1 {', '.join(str(x['f1']) for x in d['inside0.5'])}; app-definition F1 {', '.join(str(x['f1']) for x in d['app_definition_iou0.5'])}; "
                  f"start error {', '.join(str(x['start_error_s']['median']) if x['start_error_s'] else '-' for x in d['app_definition_iou0.5'])} s")
    w("")
    return "\n".join(L) + "\n"


def fmt(d):
    if d is None:
        return "-"
    if isinstance(d, dict) and "median" in d:
        return f"{d['median']} ({d['q25']} to {d['q75']}; range {d['min']} to {d['max']}; n {d['n']})"
    return str(d)


def main():
    summary = {"decision_rules": {"coverage_min": COVERAGE_MIN, "rmcorr_min": RMCORR_MIN, "rmcorr_ci_low_min": RMCORR_CI_LOW_MIN,
                                  "name_tol_s": NAME_TOL_S, "name_tol_rel": NAME_TOL_REL, "bootstrap": BOOT, "seed": SEED},
               "jump": jump_section()}
    summary["missingness"] = missingness(summary["jump"])
    summary["rehab"] = rehab_section()
    qa = P / "qa"
    qa.mkdir(parents=True, exist_ok=True)
    (qa / "phase4a5_summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    REPORT.write_text(write_tables(summary), encoding="utf-8")
    print(f"wrote {REPORT.relative_to(REPO)} and data/processed/qa/phase4a5_summary.json")


if __name__ == "__main__":
    main()
