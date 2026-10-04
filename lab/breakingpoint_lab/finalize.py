"""Finalize a sweep: merge shards -> transparent selection -> held-out metrics ->
robustness experiments -> figures -> CSV / JSON exports -> validation report.

All numbers written here are computed from the simulations that were actually
run; nothing is hard-coded.
"""
from __future__ import annotations

import csv
import json
import math
import os
import shutil
import time
from multiprocessing import get_context
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from . import __version__, plots
from .core import assess_recovery, build_baseline, make_config, run_detector
from .evaluate import (CH_INDEX, FPR_MAX, FPR_SCENARIO_MAX, SELECTION_RULE, all_metrics, hist_mean, hist_median, hist_median_ci,
                       select_config, summarize_outcomes, wilson)
from .experiment import describe_grid, load_shards
from .grid import VARIANTS, config_id, grid_hash, variant_name
from .simulate import (CHANGE, GENERATOR_VERSION, KEYS, NO_CHANGE, SCENARIO_LABELS, SCENARIOS, SPECS, A, B, C, D, F, G,
                       H, balanced_scenarios, generate_sessions, population_norms)
from .vectorized import MODES, config_to_params, drift_arrays, personal_drift, run_detector_batch, spec_arrays

SA = spec_arrays(SPECS)

ROBUSTNESS_EXPERIMENTS = [
    ("noise", "Pose-measurement noise, whole session (× nominal jitter)", [1.0, 1.5, 2.0, 3.0, 4.0, 5.0],
     "noise_robustness", "Robustness to pose-estimation noise (present during calibration and monitoring)"),
    ("noise_post_cal", "Noise increase after calibration (× calibration jitter)", [1.0, 1.25, 1.5, 2.0, 2.5, 3.0],
     "noise_shift_stress_test", "Stress test: capture noise increases AFTER the baseline was learned"),
    ("outliers", "Probability that any rep is an isolated bad rep", [0.0, 0.02, 0.05, 0.10, 0.15, 0.20],
     "outlier_robustness", "Robustness to isolated bad reps (stumbles, mis-tracked reps)"),
    ("dropout", "Per-feature landmark dropout probability", [0.0, 0.1, 0.2, 0.3, 0.4, 0.5],
     "dropout_robustness", "Robustness to missing / low-confidence landmarks"),
]


def overrides_for(experiment: str, level: float) -> dict:
    if experiment == "noise":
        return {"noise_mult": level, "noise_mult_cal": level}
    if experiment == "noise_post_cal":
        return {"noise_mult": level, "noise_mult_cal": 1.0}
    if experiment == "outliers":
        return {"p_out": level}
    if experiment == "dropout":
        return {"p_drop": level, "p_rep_drop": level / 4, "p_lowq": level / 2}
    raise ValueError(experiment)


def full_config(det: dict, weighting: str, missing: str) -> dict:
    return make_config(**det, feature_weighting=weighting, missing_feature_handling=missing)


def _variant_key(cfg: dict) -> Tuple[str, str]:
    return (cfg["feature_weighting"], cfg["missing_feature_handling"])


def evaluate_detectors(batch, detectors: Sequence[Tuple[str, dict]]) -> Dict[str, Dict[str, np.ndarray]]:
    """Run labelled full configs on a batch; drift computed once per drift-score variant."""
    cache: Dict[Tuple[str, str], tuple] = {}
    out = {}
    for label, cfg in detectors:
        key = _variant_key(cfg)
        if key not in cache:
            cache[key] = personal_drift(batch.XC, batch.QC, batch.ncal, batch.X, batch.Q, SA, cfg)
        D, mu0, s0 = cache[key]
        al, on, fw = run_detector_batch(D, mu0, s0, config_to_params([cfg]), cfg["mode"])
        out[label] = {"alarm": al[0], "onset": on[0], "first_warn": fw[0], "D": D, "mu0": mu0, "sigma0": s0}
    return out


def robustness_job(job: dict) -> List[dict]:
    exp, level, li, n, seed, detectors = (job[k] for k in ("experiment", "level", "level_idx", "n", "seed", "detectors"))
    ov = overrides_for(exp, level)
    exp_id = [e[0] for e in ROBUSTNESS_EXPERIMENTS].index(exp)
    rng_a = np.random.default_rng(np.random.SeedSequence([seed, 31, exp_id, li, 0]))
    rng_c = np.random.default_rng(np.random.SeedSequence([seed, 31, exp_id, li, 1]))
    ba = generate_sessions(rng_a, np.full(n, A), ov)
    bc = generate_sessions(rng_c, np.full(n, C), ov)
    ra = evaluate_detectors(ba, detectors)
    rc = evaluate_detectors(bc, detectors)
    rows = []
    for label, _ in detectors:
        fa = (ra[label]["alarm"] > 0)
        fpr = wilson(fa.sum(), n)
        sc = summarize_outcomes(rc[label]["alarm"], rc[label]["onset"], bc.tau)
        rows.append({"experiment": exp, "level": level, "detector": label, "n_no_change": n, "fpr": fpr[0],
                     "fpr_lo": fpr[1], "fpr_hi": fpr[2], "n_drift": n, "tpr": sc["tpr"], "tpr_lo": sc["tpr_lo"],
                     "tpr_hi": sc["tpr_hi"], "median_delay": sc["median_delay"], "early_rate": sc["early_rate"]})
    return rows


def _pool_map(fn, jobs, workers):
    if workers > 1 and len(jobs) > 1:
        ctx = get_context("spawn" if os.name == "nt" else "fork")
        with ctx.Pool(processes=min(workers, len(jobs))) as pool:
            return pool.map(fn, jobs)
    return [fn(j) for j in jobs]


def _rep_dicts(X: np.ndarray, Q: np.ndarray, n: int) -> List[dict]:
    reps = []
    for r in range(n):
        reps.append({"values": {k: (None if not np.isfinite(X[r, j]) else float(X[r, j])) for j, k in enumerate(KEYS)},
                     "quality": {k: float(Q[r, j]) for j, k in enumerate(KEYS)}})
    return reps


def scalar_trace(batch, i: int, cfg: dict, title: str) -> dict:
    """Replay one session through the scalar reference implementation (same code path as the app)."""
    from .core import drift_score
    cal = _rep_dicts(batch.XC[i], batch.QC[i], int(batch.ncal[i]))
    mon = _rep_dicts(batch.X[i], batch.Q[i], int(batch.T[i]))
    bl = build_baseline(cal, SPECS, cfg)
    scores = [drift_score(r, bl["features"], SPECS, cfg)["score"] for r in mon]
    mu0, s0 = bl["reference"]["mu0"], bl["reference"]["sigma0"]
    det = run_detector(cfg, mu0, s0, scores)
    th = det.thresholds()
    return {
        "title": title, "score": scores, "state": [s["state"] for s in det.steps],
        "ewma_level": [mu0 + s0 * s["ewma"] for s in det.steps], "normal_upper": th["normal_upper"],
        "warning_level": th["warning_level"], "breakpoint_level": th["breakpoint_level"],
        "tau": int(batch.tau[i]), "onset": det.onset_rep, "alarm": det.alarm_rep,
        "bad_reps": [int(r) + 1 for r in np.where(batch.bad_reps[i])[0]],
    }


def _spearman(a: np.ndarray, b: np.ndarray) -> float:
    if len(a) < 3:
        return math.nan
    ra = np.argsort(np.argsort(a)).astype(float)
    rb = np.argsort(np.argsort(b)).astype(float)
    return float(np.corrcoef(ra, rb)[0, 1])


def _fmt(x, pct=False, nd=1):
    if x is None or (isinstance(x, float) and not math.isfinite(x)):
        return "n/a"
    return f"{x * 100:.{nd}f}%" if pct else f"{x:.{nd}f}"


def _write_csv(path: Path, rows: List[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    keys = list(rows[0].keys())
    for r in rows[1:]:
        for k in r:
            if k not in keys:
                keys.append(k)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=keys)
        w.writeheader()
        for r in rows:
            w.writerow({k: (round(v, 6) if isinstance(v, float) and math.isfinite(v) else v) for k, v in r.items()})


def finalize(out_dir: Path, grid_name: str = "full", eval_sessions: int = 4000, robustness_sessions: int = 1000,
             workers: int = 1, seed: Optional[int] = None, install_to: Optional[Path] = None, log=print) -> dict:
    t0 = time.time()
    out_dir = Path(out_dir)
    fig_dir = out_dir / "figures"
    grid, complexity, ids = describe_grid(grid_name)
    log(f"[finalize] loading shards from {out_dir / 'shards'}")
    acc, metas = load_shards(out_dir, expected_hash=grid_hash(grid), log=log)
    base_seed = int(metas[0]["base_seed"])
    seed = base_seed if seed is None else seed
    n_sel, n_hold = int(acc.n[0].sum()), int(acc.n[1].sum())
    n_total = n_sel + n_hold
    log(f"[finalize] {len(metas)} shard(s), {n_total:,} sessions ({n_sel:,} selection / {n_hold:,} held-out), "
        f"{len(grid)} detector configs x {len(VARIANTS)} drift-score variants")
    if n_hold == 0:
        raise RuntimeError("Held-out split is empty: run at least 2 blocks (sessions > block size).")

    msel = all_metrics(acc, 0)
    mev = all_metrics(acc, 1)
    (sv, scfg), eligible_found = select_config(msel, complexity)
    modes = np.array([g["mode"] for g in grid])
    best_mode = {}
    for mode in MODES:
        restrict = np.broadcast_to(modes == mode, msel["fpr"].shape).copy()
        best_mode[mode] = select_config(msel, complexity, restrict)[0]
    naive_c = next(i for i, g in enumerate(grid) if g["mode"] == "consecutive"
                   and g["breakpoint_threshold"] == 2.0 and g["minimum_persistent_reps"] == 1)
    featured_raw = [
        ("BreakingPoint (selected)", sv, scfg),
        ("Best EWMA-only", *best_mode["ewma"]),
        ("Best CUSUM-only", *best_mode["cusum"]),
        ("Best EWMA+CUSUM", *best_mode["combined"]),
        ("Best consecutive-threshold", *best_mode["consecutive"]),
        ("Naive single-rep 2σ threshold", 0, naive_c),
    ]
    featured, seen = [], set()
    for lab, v, c in featured_raw:
        if (v, c) in seen:
            continue
        seen.add((v, c))
        featured.append((lab, v, c))
    sel_det = grid[scfg]
    sel_cfg = full_config(sel_det, *VARIANTS[sv])
    log(f"[finalize] selected: {variant_name(VARIANTS[sv])} :: {ids[scfg]} (eligible found: {eligible_found})")

    # ------------------------------------------------------------------ config_results.csv
    rows = []
    for v in range(len(VARIANTS)):
        for c, det in enumerate(grid):
            r = {"variant": variant_name(VARIANTS[v]), "feature_weighting": VARIANTS[v][0],
                 "missing_feature_handling": VARIANTS[v][1], "mode": det["mode"], "config_id": ids[c],
                 "ewma_alpha": det["ewma_alpha"], "cusum_k": det["cusum_k"], "cusum_h": det["cusum_h"],
                 "warning_threshold": det["warning_threshold"], "breakpoint_threshold": det["breakpoint_threshold"],
                 "minimum_persistent_reps": det["minimum_persistent_reps"],
                 "outlier_clip": "none" if det["outlier_clip"] is None else det["outlier_clip"]}
            for tag, m in (("sel", msel), ("holdout", mev)):
                for key in ("fpr", "tpr", "miss", "early", "median_delay", "mean_delay", "median_cperr"):
                    r[f"{tag}_{key}"] = float(m[key][v, c])
                for s in NO_CHANGE:
                    r[f"{tag}_fpr_{SCENARIOS[s][0]}"] = float(m[f"fpr_s{s}"][v, c])
            r["eligible"] = bool(msel["fpr"][v, c] <= FPR_MAX and msel["fpr_max_scenario"][v, c] <= FPR_SCENARIO_MAX)
            r["selected"] = bool(v == sv and c == scfg)
            rows.append(r)
    _write_csv(out_dir / "config_results.csv", rows)
    log(f"[finalize] wrote config_results.csv ({len(rows):,} rows)")

    # ------------------------------------------------------------------ scenario_results.csv (held-out)
    srows = []
    for lab, v, c in featured:
        for s in range(8):
            n = int(acc.n[1, s])
            r = {"detector": lab, "variant": variant_name(VARIANTS[v]), "config_id": ids[c], "scenario": SCENARIOS[s],
                 "scenario_label": SCENARIO_LABELS[SCENARIOS[s]], "type": "change" if s in CHANGE else "no_change",
                 "n_sessions": n}
            if s in CHANGE:
                j = CH_INDEX[s]
                det_ = wilson(acc.detected[1, v, c, j], n)
                hist = acc.delay_hist[1, v, c, j]
                ci = hist_median_ci(hist)
                r.update({"false_positive_rate": "", "fpr_ci_lo": "", "fpr_ci_hi": "",
                          "detection_rate": det_[0], "detection_ci_lo": det_[1], "detection_ci_hi": det_[2],
                          "miss_rate": acc.missed[1, v, c, j] / n if n else math.nan,
                          "early_alarm_rate": acc.early[1, v, c, j] / n if n else math.nan,
                          "median_delay": hist_median(hist), "median_delay_ci_lo": ci[0], "median_delay_ci_hi": ci[1],
                          "mean_delay": hist_mean(hist), "median_changepoint_error": hist_median(acc.cperr_hist[1, v, c, j])})
            else:
                fp = wilson(acc.alarm[1, v, c, s], n)
                r.update({"false_positive_rate": fp[0], "fpr_ci_lo": fp[1], "fpr_ci_hi": fp[2], "detection_rate": "",
                          "detection_ci_lo": "", "detection_ci_hi": "", "miss_rate": "", "early_alarm_rate": "",
                          "median_delay": "", "median_delay_ci_lo": "", "median_delay_ci_hi": "", "mean_delay": "",
                          "median_changepoint_error": ""})
            srows.append(r)
    _write_csv(out_dir / "scenario_results.csv", srows)

    # ------------------------------------------------------------------ evaluation set (per-session detail)
    log(f"[finalize] evaluation set: {eval_sessions:,} fresh sessions for per-session analyses")
    rng = np.random.default_rng(np.random.SeedSequence([seed, 7_777_777]))
    eb = generate_sessions(rng, balanced_scenarios(eval_sessions))
    fdet = [(lab, full_config(grid[c], *VARIANTS[v])) for lab, v, c in featured]
    er = evaluate_detectors(eb, fdet)
    sel_res = er["BreakingPoint (selected)"]
    scen_lab = np.array([SCENARIO_LABELS[SCENARIOS[s]] for s in eb.scenario])
    figs = []
    figs += plots.changepoint_accuracy(eb.tau, sel_res["onset"], sel_res["alarm"], scen_lab, fig_dir, seed)

    # severity
    sev_rows = []
    edges = [1.0, 2.0, 2.5, 3.0, 3.5, 4.6]
    chm = np.isin(eb.scenario, CHANGE)
    for lab, _ in fdet:
        res = er[lab]
        for lo, hi in zip(edges[:-1], edges[1:]):
            mk = chm & (eb.peak >= lo) & (eb.peak < hi)
            if mk.sum() < 5:
                continue
            s = summarize_outcomes(res["alarm"], res["onset"], eb.tau, mk)
            sev_rows.append({"detector": lab, "severity_lo": lo, "severity_hi": hi, "severity_mid": (lo + hi) / 2,
                             "n": int(mk.sum()), **{k: s[k] for k in ("tpr", "tpr_lo", "tpr_hi", "median_delay", "early_rate")}})
    figs += plots.severity(sev_rows, fig_dir, f"Evaluation set, {eval_sessions:,} sessions (drift scenarios C, D, H)")

    # personal vs population
    pop = population_norms()
    pb = generate_sessions(np.random.default_rng(np.random.SeedSequence([seed, 99])), np.full(2000, A))
    ones = np.ones((pb.n, len(KEYS)), dtype=bool)
    Dpop_ref = drift_arrays(pb.XC, pb.QC, np.broadcast_to(pop["center"], (pb.n, len(KEYS))),
                            np.broadcast_to(pop["scale"], (pb.n, len(KEYS))), ones, SA, sel_cfg)
    mu_pop = float(np.nanmean(Dpop_ref))
    sd_pop = float(np.nanstd(Dpop_ref, ddof=1))
    Dpop = drift_arrays(eb.X, eb.Q, np.broadcast_to(pop["center"], (eb.n, len(KEYS))),
                        np.broadcast_to(pop["scale"], (eb.n, len(KEYS))), np.ones((eb.n, len(KEYS)), dtype=bool), SA, sel_cfg)
    alp, onp, _ = run_detector_batch(Dpop, np.full(eb.n, mu_pop), np.full(eb.n, sd_pop), config_to_params([sel_cfg]),
                                     sel_cfg["mode"])
    pvp = {}
    for name, (al, on) in (("Personal baseline (BreakingPoint)", (sel_res["alarm"], sel_res["onset"])),
                           ("Population norm (universal rules)", (alp[0], onp[0]))):
        nc = np.isin(eb.scenario, NO_CHANGE)
        gm = eb.scenario == G
        fa = wilson((al[nc] > 0).sum(), nc.sum())
        fg = wilson((al[gm] > 0).sum(), gm.sum())
        s = summarize_outcomes(al, on, eb.tau, chm)
        pvp[name] = {"fpr_all": fa[0], "fpr_all_lo": fa[1], "fpr_all_hi": fa[2], "fpr_G": fg[0], "fpr_G_lo": fg[1],
                     "fpr_G_hi": fg[2], "tpr": s["tpr"], "tpr_lo": s["tpr_lo"], "tpr_hi": s["tpr_hi"],
                     "median_delay": s["median_delay"]}
    figs += plots.personal_vs_population(
        pvp, fig_dir, f"Evaluation set, {eval_sessions:,} sessions. Population norm = z-scores against population "
                      f"mean/SD of {20000:,} simulated athletes with an equally calibrated in-control reference.")

    # recovery check (scenario H)
    rec_est, rec_true, rec_status = [], [], []
    hidx = np.where(eb.scenario == H)[0]
    for i in hidx:
        a = int(sel_res["alarm"][i])
        rs = int(eb.recovery_start[i])
        if a == 0 or a >= rs or rs + 2 > eb.T[i]:
            continue
        Di = sel_res["D"][i]
        mpath = eb.m_path[i]
        post = [Di[r - 1] for r in range(a, rs) if mpath[r - 1] >= 0.9 * eb.peak[i] and np.isfinite(Di[r - 1])]
        if not post and np.isfinite(Di[a - 1]):
            post = [Di[a - 1]]
        rec = [Di[r - 1] for r in range(rs, rs + 3) if np.isfinite(Di[r - 1])]
        if not post or not rec:
            continue
        out = assess_recovery(rec, post, float(sel_res["mu0"][i]), float(sel_res["sigma0"][i]), sel_cfg["warning_threshold"])
        rec_est.append(out["percent"])
        rec_true.append(float(eb.recovery_true[i]))
        rec_status.append(out["status"])
    rec_est_a, rec_true_a = np.array(rec_est), np.array(rec_true)
    recovery = {
        "n_sessions": int(len(rec_est)),
        "spearman_rho": _spearman(rec_est_a, rec_true_a),
        "mae_percentage_points": float(np.mean(np.abs(rec_est_a - rec_true_a)) * 100) if len(rec_est) else math.nan,
        "status_accuracy": float(np.mean([(s == "recovered") == (t >= 0.75) for s, t in zip(rec_status, rec_true)])) if rec_status else math.nan,
    }

    # scenario example traces: first session drawn for each scenario (not cherry-picked)
    traces = []
    for s, title in ((A, "Normal session (no change)"), (B, "Isolated bad rep"), (C, "Gradual fatigue drift"),
                     (D, "Sudden change"), (F, "Landmark dropout"), (H, "Drift, then recovery")):
        i = int(np.where(eb.scenario == s)[0][0])
        tr = scalar_trace(eb, i, sel_cfg, f"{SCENARIO_LABELS[SCENARIOS[s]].split(' · ')[0]} · {title}")
        assert (tr["alarm"] or 0) == int(sel_res["alarm"][i]), "scalar / vectorized detector disagree"
        traces.append(tr)
    figs += plots.scenario_examples(traces, fig_dir, f"First session drawn for each scenario from the evaluation set "
                                                     f"(seed {seed}); not cherry-picked. × = unscored rep (poor capture).")

    # ------------------------------------------------------------------ robustness
    rob_detectors = list(fdet)
    if sel_cfg["missing_feature_handling"] != "impute":
        rob_detectors.append(("Selected · impute missing", {**sel_cfg, "missing_feature_handling": "impute"}))
    if sel_cfg["missing_feature_handling"] != "skip_rep":
        rob_detectors.append(("Selected · skip incomplete reps", {**sel_cfg, "missing_feature_handling": "skip_rep"}))
    jobs = []
    for exp, _, levels, _, _ in ROBUSTNESS_EXPERIMENTS:
        dets = rob_detectors if exp == "dropout" else fdet
        for li, lvl in enumerate(levels):
            jobs.append({"experiment": exp, "level": lvl, "level_idx": li, "n": robustness_sessions, "seed": seed,
                         "detectors": dets})
    log(f"[finalize] robustness: {len(jobs)} levels x 2 x {robustness_sessions:,} sessions")
    rob_rows = [r for rows_ in _pool_map(robustness_job, jobs, workers) for r in rows_]
    _write_csv(out_dir / "robustness_results.csv", rob_rows)
    for exp, xlabel, _, name, title in ROBUSTNESS_EXPERIMENTS:
        note = f"{robustness_sessions:,} no-change + {robustness_sessions:,} gradual-drift sessions per level"
        figs += plots.robustness(rob_rows, exp, fig_dir, xlabel, title, name, note)

    # ------------------------------------------------------------------ trade-off, heatmaps, ablation
    figs += plots.detection_tradeoff(mev, grid, (sv, scfg), fig_dir,
                                     {"naive 2σ": (0, naive_c)}, n_hold)
    figs += plots.parameter_heatmaps(_heatmap_panels(grid, mev, best_mode, (sv, scfg)), fig_dir)
    abl = []
    colors = {"ewma": plots.MODE_COLORS["ewma"], "cusum": plots.MODE_COLORS["cusum"],
              "combined": plots.MODE_COLORS["combined"], "consecutive": plots.MODE_COLORS["consecutive"]}

    def _abl_row(label, v, c, color):
        m = {k: float(mev[k][v, c]) for k in ("fpr", "miss", "median_delay")}
        n_nc, n_ch = acc.n[1, list(NO_CHANGE)].sum(), acc.n[1, list(CHANGE)].sum()
        f = wilson(m["fpr"] * n_nc, n_nc)
        mi = wilson(m["miss"] * n_ch, n_ch)
        return {"label": label, "color": color, **m, "fpr_lo": f[1], "fpr_hi": f[2], "miss_lo": mi[1], "miss_hi": mi[2],
                "config_id": ids[c], "variant": variant_name(VARIANTS[v])}

    abl.append(_abl_row("BreakingPoint (selected)", sv, scfg, plots.SELECTED_COLOR))
    for mode, lab in (("combined", "Best EWMA+CUSUM"), ("ewma", "Best EWMA-only"), ("cusum", "Best CUSUM-only"),
                      ("consecutive", "Best consecutive-threshold")):
        v, c = best_mode[mode]
        abl.append(_abl_row(lab, v, c, colors[mode]))
    abl.append(_abl_row("Naive single-rep 2σ threshold", 0, naive_c, "#9CA3AF"))
    for v, (w, mh) in enumerate(VARIANTS):
        if v == sv:
            continue
        abl.append(_abl_row(f"Selected detector · {w.replace('_', ' ')} weights, {mh.replace('_', ' ')}", v, scfg, "#CBD5E1"))
    figs += plots.ablation(abl, fig_dir, f"Held-out evaluation split, {n_hold:,} sessions · error bars: Wilson 95% CI")
    _write_csv(out_dir / "ablation_results.csv", abl)

    # ------------------------------------------------------------------ headline metrics + exports
    head = _headline(acc, sv, scfg)
    head_sel = _headline(acc, sv, scfg, split=0)
    per_scen = {}
    for s in range(8):
        n = int(acc.n[1, s])
        if s in CHANGE:
            j = CH_INDEX[s]
            per_scen[SCENARIOS[s]] = {"n": n, "true_positive_rate": _r(acc.detected[1, sv, scfg, j] / n),
                                      "miss_rate": _r(acc.missed[1, sv, scfg, j] / n),
                                      "early_alarm_rate": _r(acc.early[1, sv, scfg, j] / n),
                                      "median_detection_delay": _r(hist_median(acc.delay_hist[1, sv, scfg, j]))}
        else:
            per_scen[SCENARIOS[s]] = {"n": n, "false_positive_rate": _r(acc.alarm[1, sv, scfg, s] / n)}
    validation = {
        "num_sessions": n_total, "num_sessions_selection": n_sel, "num_sessions_holdout": n_hold,
        "reported_on": "held-out evaluation split",
        "num_no_change_sessions_holdout": head["n_no_change"], "num_drift_sessions_holdout": head["n_change"],
        "false_positive_rate": _r(head["fpr"]), "false_positive_rate_ci95": [_r(head["fpr_lo"]), _r(head["fpr_hi"])],
        "true_positive_rate": _r(head["tpr"]), "true_positive_rate_ci95": [_r(head["tpr_lo"]), _r(head["tpr_hi"])],
        "miss_rate": _r(head["miss_rate"]), "early_alarm_rate": _r(head["early_rate"]),
        "median_detection_delay": _r(head["median_delay"]),
        "median_detection_delay_ci95": [_r(head["median_delay_lo"]), _r(head["median_delay_hi"])],
        "mean_detection_delay": _r(head["mean_delay"]), "median_changepoint_error": _r(head["median_cperr"]),
        "per_scenario": per_scen,
        "recovery_check": {k: _r(v) for k, v in recovery.items()},
        "num_detector_configs": len(grid), "num_drift_score_variants": len(VARIANTS),
        "num_configs_evaluated": len(grid) * len(VARIANTS), "eligible_config_found": bool(eligible_found),
        "shards_merged": len(metas), "base_seed": base_seed, "grid": grid_name, "grid_hash": grid_hash(grid),
        "generator_version": GENERATOR_VERSION, "lab_version": __version__,
        "compute_environment": (f"UF HiPerGator (Slurm job {os.environ.get('SLURM_JOB_ID')})"
                                if os.environ.get("SLURM_JOB_ID") else "local workstation"),
        "figures": sorted(f.name for f in fig_dir.glob("*.png")),
    }
    export = {
        "schema": "breakingpoint.detector/v1",
        "source": f"BreakingPoint Lab · Monte-Carlo validated on {n_total:,} simulated sessions",
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "config_id": ids[scfg],
        **{k: sel_cfg[k] for k in ("mode", "ewma_alpha", "cusum_k", "cusum_h", "warning_threshold", "breakpoint_threshold",
                                   "minimum_persistent_reps", "outlier_clip", "z_clip", "feature_weighting",
                                   "missing_feature_handling", "quality_min", "min_coverage", "reference")},
        "selection_rule": SELECTION_RULE,
        "validation": validation,
    }
    cfg_path = out_dir / "breakingpoint_detector_config.json"
    cfg_path.write_text(json.dumps(export, indent=2), encoding="utf-8")
    if install_to:
        install_to = Path(install_to)
        install_to.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(cfg_path, install_to)
        # Figures are shown in the app's "Lab validation" panel.
        lab_fig = install_to.parent / "lab" / "figures"
        lab_fig.mkdir(parents=True, exist_ok=True)
        for f in fig_dir.glob("*.png"):
            shutil.copyfile(f, lab_fig / f.name)
        log(f"[finalize] installed detector config + figures into app: {install_to.parent}")

    summary = [
        ("run.sessions_total", n_total), ("run.sessions_selection_split", n_sel), ("run.sessions_holdout_split", n_hold),
        ("run.shards", len(metas)), ("run.base_seed", base_seed), ("run.detector_configs", len(grid)),
        ("run.drift_score_variants", len(VARIANTS)), ("run.configs_evaluated", len(grid) * len(VARIANTS)),
        ("run.eval_set_sessions", eval_sessions), ("run.robustness_sessions_per_level", robustness_sessions),
        ("run.compute_seconds_sweep", round(sum(m["seconds"] for m in metas), 1)),
        ("selected.config_id", ids[scfg]), ("selected.variant", variant_name(VARIANTS[sv])),
        ("selected.eligible_found", eligible_found),
        *[(f"selected.{k}", sel_cfg[k]) for k in ("mode", "ewma_alpha", "cusum_k", "cusum_h", "warning_threshold",
                                                    "breakpoint_threshold", "minimum_persistent_reps", "outlier_clip")],
        *[(f"holdout.{k}", head[k]) for k in ("fpr", "fpr_lo", "fpr_hi", "tpr", "tpr_lo", "tpr_hi", "miss_rate",
                                               "early_rate", "median_delay", "median_delay_lo", "median_delay_hi",
                                               "mean_delay", "median_cperr")],
        *[(f"selection_split.{k}", head_sel[k]) for k in ("fpr", "tpr", "miss_rate", "median_delay", "mean_delay")],
        *[(f"holdout.scenario.{s}.{k}", v) for s, d in per_scen.items() for k, v in d.items() if k != "n"],
        *[(f"recovery_check.{k}", v) for k, v in recovery.items()],
        *[(f"personal_vs_population.{name.split(' (')[0].replace(' ', '_').lower()}.{k}", v)
          for name, d in pvp.items() for k, v in d.items()],
    ]
    _write_csv(out_dir / "summary.csv", [{"metric": k, "value": v} for k, v in summary])
    _write_report(out_dir, export, head, featured, mev, ids, acc, recovery, pvp, rob_rows, figs, metas, t0)
    log(f"[finalize] done in {time.time() - t0:.1f}s -> {cfg_path}")
    return export


def _r(x, nd=4):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return round(x, nd) if math.isfinite(x) else None


def _headline(acc, v, c, split=1) -> dict:
    from .evaluate import metrics_from_stats
    return metrics_from_stats(acc, split, v, c)


def _heatmap_panels(grid, m, best_mode, selected):
    def find(mode, **fixed):
        for i, g in enumerate(grid):
            if g["mode"] != mode:
                continue
            if all((g[k] is None and val is None) or (g[k] is not None and val is not None and abs(g[k] - val) < 1e-9)
                   for k, val in fixed.items()):
                return i
        return None

    panels = []
    specs = [
        ("cusum", "CUSUM only", "cusum_k", "cusum_h", "CUSUM reference k", "CUSUM threshold h",
         ("warning_threshold", "minimum_persistent_reps", "outlier_clip")),
        ("ewma", "EWMA only", "ewma_alpha", "breakpoint_threshold", "EWMA α", "BreakingPoint threshold (σ)",
         ("warning_threshold", "minimum_persistent_reps", "outlier_clip")),
        ("combined", "EWMA + CUSUM", "cusum_h", "breakpoint_threshold", "CUSUM threshold h", "BreakingPoint threshold (σ)",
         ("ewma_alpha", "cusum_k", "warning_threshold", "minimum_persistent_reps", "outlier_clip")),
    ]
    for mode, title, ykey, xkey, ylabel, xlabel, fixed_keys in specs:
        v, c = selected if grid[selected[1]]["mode"] == mode else best_mode[mode]
        base = grid[c]
        ys = sorted({g[ykey] for g in grid if g["mode"] == mode})
        xs = sorted({g[xkey] for g in grid if g["mode"] == mode})
        F = np.full((len(ys), len(xs)), np.nan)
        M = np.full_like(F, np.nan)
        Dl = np.full_like(F, np.nan)
        for i, yv in enumerate(ys):
            for j, xv in enumerate(xs):
                idx = find(mode, **{ykey: yv, xkey: xv}, **{k: base[k] for k in fixed_keys})
                if idx is not None:
                    F[i, j] = m["fpr"][v, idx]
                    M[i, j] = m["miss"][v, idx]
                    Dl[i, j] = m["median_delay"][v, idx]
        panels.append({"title": title, "xlabel": xlabel, "ylabel": ylabel, "xticks": xs, "yticks": ys, "fpr": F,
                       "miss": M, "delay": Dl, "sel": (ys.index(base[ykey]), xs.index(base[xkey]))})
    return panels


def _write_report(out_dir, export, head, featured, mev, ids, acc, recovery, pvp, rob_rows, figs, metas, t0):
    v = export["validation"]
    lines = [
        "# BreakingPoint Lab — Validation Report",
        "",
        f"_Auto-generated by `hpc/merge_results.py` on {export['generated_at']}. Every number below was computed from "
        f"simulations that actually ran ({v['shards_merged']} shard(s), base seed {v['base_seed']})._",
        "",
        "> Synthetic sessions evaluate the **statistical behaviour** of the detector under known conditions. "
        "They are not clinical data and do not establish injury-prediction accuracy.",
        "",
        "## Run",
        "",
        f"- Simulated sessions: **{v['num_sessions']:,}** ({v['num_sessions_selection']:,} selection split / "
        f"{v['num_sessions_holdout']:,} held-out split)",
        f"- Configurations evaluated: **{v['num_configs_evaluated']:,}** "
        f"({v['num_detector_configs']:,} detector settings × {v['num_drift_score_variants']} drift-score variants)",
        f"- Sweep compute: {sum(m['seconds'] for m in metas):,.0f} CPU-process seconds across shards",
        "",
        "## Selected operating configuration",
        "",
        f"`{export['config_id']}` · weighting `{export['feature_weighting']}` · missing features `{export['missing_feature_handling']}`",
        "",
        "| parameter | value |", "|---|---|",
        *[f"| {k} | {export[k]} |" for k in ("mode", "ewma_alpha", "cusum_k", "cusum_h", "warning_threshold",
                                            "breakpoint_threshold", "minimum_persistent_reps", "outlier_clip")],
        "",
        f"**Selection rule.** {export['selection_rule']}",
        "",
        "## Held-out performance of the selected detector",
        "",
        "| metric | value | 95% CI |", "|---|---|---|",
        f"| False-positive rate (no-change sessions A,B,E,F,G) | {_fmt(head['fpr'], True)} | {_fmt(head['fpr_lo'], True)} – {_fmt(head['fpr_hi'], True)} |",
        f"| True-positive rate (drift sessions C,D,H) | {_fmt(head['tpr'], True)} | {_fmt(head['tpr_lo'], True)} – {_fmt(head['tpr_hi'], True)} |",
        f"| Miss rate | {_fmt(head['miss_rate'], True)} | {_fmt(head['miss_lo'], True)} – {_fmt(head['miss_hi'], True)} |",
        f"| Early-alarm rate (fired before true change) | {_fmt(head['early_rate'], True)} | |",
        f"| Median detection delay (reps) | {_fmt(head['median_delay'])} | {_fmt(head['median_delay_lo'])} – {_fmt(head['median_delay_hi'])} |",
        f"| Mean detection delay (reps) | {_fmt(head['mean_delay'], nd=2)} | |",
        f"| Median change-point error (reps) | {_fmt(head['median_cperr'])} | |",
        "",
        "### Per scenario (held-out)",
        "",
        "| scenario | n | false-positive rate | detection rate | median delay |", "|---|---|---|---|---|",
    ]
    for s, d in v["per_scenario"].items():
        lines.append(f"| {SCENARIO_LABELS[s]} | {d['n']:,} | {_fmt(d.get('false_positive_rate'), True) if 'false_positive_rate' in d else ''} | "
                     f"{_fmt(d.get('true_positive_rate'), True) if 'true_positive_rate' in d else ''} | "
                     f"{_fmt(d.get('median_detection_delay')) if 'median_detection_delay' in d else ''} |")
    lines += ["", "## Detector family comparison (held-out)", "",
              "| detector | config | FPR | miss rate | median delay |", "|---|---|---|---|---|"]
    for lab, vv, c in featured:
        lines.append(f"| {lab} | `{ids[c]}` | {_fmt(mev['fpr'][vv, c], True)} | {_fmt(mev['miss'][vv, c], True)} | "
                     f"{_fmt(mev['median_delay'][vv, c])} |")
    lines += ["", "## Personal baseline vs population norm", "",
              "| reference | FPR (all no-change) | FPR (high-variability athletes) | detection rate |", "|---|---|---|---|"]
    for name, d in pvp.items():
        lines.append(f"| {name} | {_fmt(d['fpr_all'], True)} | {_fmt(d['fpr_G'], True)} | {_fmt(d['tpr'], True)} |")
    lines += ["", "## Recovery check (scenario H)", "",
              f"- Sessions evaluated: {recovery['n_sessions']:,}",
              f"- Spearman ρ (estimated vs true recovery): {_fmt(recovery['spearman_rho'], nd=2)}",
              f"- Mean absolute error: {_fmt(recovery['mae_percentage_points'])} percentage points",
              f"- 'Recovered' status agreement with truth (true recovery ≥ 75%): {_fmt(recovery['status_accuracy'], True)}",
              "", "## Robustness (selected detector)", "",
              "| experiment | level | FPR | detection rate | median delay |", "|---|---|---|---|---|"]
    for r in rob_rows:
        if r["detector"] == "BreakingPoint (selected)":
            lines.append(f"| {r['experiment']} | {r['level']:g} | {_fmt(r['fpr'], True)} | {_fmt(r['tpr'], True)} | {_fmt(r['median_delay'])} |")
    lines += ["", "## Pitch-ready statements (copy only what you will say)", "",
              f"- \"We simulated **{v['num_sessions']:,}** individualized athlete sessions with known change points and "
              f"swept **{v['num_configs_evaluated']:,}** detector configurations.\"",
              f"- \"On held-out sessions, the selected detector fired falsely in **{_fmt(head['fpr'], True)}** of no-change "
              f"sessions and detected **{_fmt(head['tpr'], True)}** of drift sessions, with a median delay of "
              f"**{_fmt(head['median_delay'])} reps** after the true change.\"",
              "", "## Figures", ""]
    for f in figs:
        if f.endswith(".png"):
            rel = os.path.relpath(f, out_dir).replace("\\", "/")
            lines.append(f"![{Path(f).stem}]({rel})")
    lines += ["", f"_Finalize stage took {time.time() - t0:.0f}s._", ""]
    (out_dir / "VALIDATION_REPORT.md").write_text("\n".join(lines), encoding="utf-8")
