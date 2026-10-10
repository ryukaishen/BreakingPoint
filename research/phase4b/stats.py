"""Phase 4B statistics (analysis v2): summaries of the per-participant / per-person records from compute.ts.

    python -I research/phase4b/stats.py <records.json> <out dir>

Implements research/protocols/jump_fatigue_v04.md (J-A to J-F) and rehab24_6_v04.md (R-1 to R-4) with the
deviations in research/protocols/phase4b_deviations.md (entry 1):

- Every summary is over people: one value per participant (person) per statistic, checked explicitly. Repeated
  jumps or reps, overlapping leave-one-out folds and the 20 splits per participant are combined within the
  person first and never counted as people.
- Intervals: Student t for means, exact order-statistic (binomial) intervals for medians, Wilson for proportions.
  Each interval carries the label its shuffled-label calibration earned (research/protocols/
  phase4b_interval_calibration.json): "95% CI", an approximate interval with its calibrated coverage, or nothing.
- Standardized changes divide by the mean of the app's spread in the two groups (jump) or by the person's pooled
  spread (REHAB24-6), so they are centred on 0 when labels do not matter.
- The personal-baseline AUC compares each held-out correct rep with the incorrect reps scored against the same
  baseline (fold-paired), so it is centred on 0.5 when labels do not matter.
- The only hypothesis tests are the six Wilcoxon signed-rank tests of the primary Path B comparisons, Holm-corrected.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from scipy.stats import binom, spearmanr, t as tdist, wilcoxon

REPO = Path(__file__).resolve().parents[2]
CALIBRATION = REPO / "research" / "protocols" / "phase4b_interval_calibration.json"

JUMP_INTERPRETED = ["jumpHeight", "countermovementDepth", "trunkLean", "landingKneeFlex", "rsiMod", "eccentricDuration"]
JUMP_NOT_INTERPRETED = ["flightTime", "concentricDuration", "asymmetry"]
JUMP_SCORES = ["S0", "S-P2", "S-P3", "S-P2P3", "S-valid"]
SCORE_LABEL = {"S0": "S0, shipped score (all nine measurements)", "S-P2": "S-P2, without flight time (experimental ablation)",
               "S-P3": "S-P3, without left-right difference (experimental ablation)",
               "S-P2P3": "S-P2P3, without both (experimental ablation)",
               "S-valid": "S-valid, the six measurements that passed Phase 4A.5 (experimental, exploratory: selected on this dataset)"}
SQUAT_INTERPRETED = ["trunkLean", "depth", "hipRom", "kneeRomL"]
SQUAT_STATUS = {"trunkLean": "passed", "depth": "passed", "hipRom": "passed", "kneeRomL": "passed", "repDuration": "failed",
                "asymmetry": "failed", "kneeRomR": "not checked", "eccentricDuration": "not checked",
                "concentricDuration": "not checked", "peakVelocity": "not checked"}
SQUAT_WEIGHT_NOTE = ("57% of the shipped squat score's weight (3.25 of 5.75) sits on measurements that failed the Phase 4A.5 "
                     "agreement criteria (rep duration, left-right difference) or were not checked (far-side knee range of motion, "
                     "eccentric and concentric duration, peak velocity). A separation result is not validation of every measurement.")


# ------------------------------------------------------------------------------------------- helpers
def fin(x) -> bool:
    return x is not None and isinstance(x, (int, float)) and math.isfinite(x)


def clean(xs):
    return [float(x) for x in xs if fin(x)]


def one_per_person(values, people) -> list:
    """Every summarized statistic has exactly one value per person (None when that person has none)."""
    values = list(values)
    if len(values) != len(people):
        raise ValueError(f"expected one value per person ({len(people)}), got {len(values)}")
    return values


def t_interval(v):
    v = clean(v)
    if len(v) < 2:
        return None
    m, se = float(np.mean(v)), float(np.std(v, ddof=1) / math.sqrt(len(v)))
    q = float(tdist.ppf(0.975, len(v) - 1))
    return [m - q * se, m + q * se]


def order_stat_interval(v):
    """Distribution-free interval for the median: (x_(k), x_(n-k+1)) with the largest k whose exact coverage is >= 95%."""
    v = sorted(clean(v))
    n = len(v)
    if n < 2:
        return None, None
    k = 1
    while binom.cdf(k, n, 0.5) <= 0.025:
        k += 1
    return [v[k - 1], v[n - k]], float(1 - 2 * binom.cdf(k - 1, n, 0.5))


def wilson(successes, n):
    if n == 0:
        return None
    z = 1.959963984540054
    p = successes / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return [c - h, c + h]


_CAL = None


def calibration_label(key: str) -> str:
    global _CAL
    if _CAL is None:
        _CAL = json.loads(CALIBRATION.read_text(encoding="utf-8"))["statistics"] if CALIBRATION.exists() else {}
    v = _CAL.get(key)
    return v["label"] if v else "uncalibrated"


def summarize(values, key: str | None = None, median_key: str | None = None):
    """Mean with a t interval and median with an exact order-statistic interval, each labelled by its calibration."""
    v = clean(values)
    if not v:
        return {"n": 0}
    out = {"n": len(v), "mean": float(np.mean(v)), "median": float(np.median(v)), "q25": float(np.percentile(v, 25)),
           "q75": float(np.percentile(v, 75)), "min": float(min(v)), "max": float(max(v)),
           "share_above_zero": float(np.mean(np.asarray(v) > 0))}
    if key:
        lab = calibration_label(key)
        out["mean_interval"] = None if lab.startswith("not reported") else t_interval(v)
        out["mean_interval_label"] = lab
    if median_key:
        ci, level = order_stat_interval(v)
        lab = calibration_label(median_key)
        out["median_interval"] = None if lab.startswith("not reported") else ci
        out["median_interval_label"] = lab
        out["median_interval_exact_level"] = level
    return out


def rank_biserial(d):
    """Matched-pairs rank-biserial correlation: (sum of positive ranks - sum of negative ranks) / total."""
    d = np.asarray([x for x in clean(d) if x != 0])
    if not len(d):
        return None
    a = np.abs(d)
    ranks = np.empty(len(a))
    order = np.argsort(a, kind="mergesort")
    ranks[order] = np.arange(1, len(a) + 1)
    for v in np.unique(a):
        m = a == v
        ranks[m] = ranks[m].mean()
    return float((ranks[d > 0].sum() - ranks[d < 0].sum()) / ranks.sum())


def holm(pvals):
    p = np.asarray(pvals, float)
    order = np.argsort(p)
    adj = np.empty_like(p)
    running = 0.0
    m = len(p)
    for k, i in enumerate(order):
        running = max(running, min(1.0, (m - k) * p[i]))
        adj[i] = running
    return adj.tolist()


def auc_pairs(pos, neg):
    pos, neg = clean(pos), clean(neg)
    if not pos or not neg:
        return None
    s = sum(1.0 if a > b else 0.5 if a == b else 0.0 for a in pos for b in neg)
    return s / (len(pos) * len(neg))


def auc_fold_paired(folds):
    """v2: each held-out correct rep against the incorrect reps scored with the same baseline, pooled over folds."""
    s = n = 0.0
    for h, inc in zip(folds["heldout"], folds["incorrectByFold"]):
        if not fin(h):
            continue
        for v in inc:
            if fin(v):
                s += 1.0 if v > h else 0.5 if v == h else 0.0
                n += 1
    return s / n if n else None


def auc_fold_averaged(folds):
    """v1 (superseded): incorrect scores averaged over folds, against the held-out scores."""
    nk = len(folds["incorrectByFold"][0]) if folds["incorrectByFold"] else 0
    inc = []
    for i in range(nk):
        v = clean(f[i] for f in folds["incorrectByFold"])
        inc.append(float(np.mean(v)) if v else None)
    return auc_pairs(inc, folds["heldout"])


def fmt(x, d=3):
    return "-" if not fin(x) else f"{x:.{d}f}"


def fci(s: dict, which="mean", d=3):
    ci = s.get(f"{which}_interval")
    lab = s.get(f"{which}_interval_label", "")
    if not ci:
        return f"(no interval: {lab})" if lab else "-"
    short = "95% CI" if lab == "95% CI" else lab
    return f"[{fmt(ci[0], d)}, {fmt(ci[1], d)}] ({short})"


# ------------------------------------------------------------------------------------------- jump
def jump_summary(samples):
    out = {"samples": {}}
    for s in samples:
        sk = f"{s['path']}/{s['sample']}"
        recs = s["records"]
        J = lambda stat: f"jump|{sk}|{stat}"  # noqa: E731
        blk = {"path": s["path"], "path_label": s["path_label"], "sample": s["sample"], "view": s["view"],
               "participants": len(recs), "jumps": sum(r["n_fresh"] + r["n_post"] for r in recs),
               "by_group": {g: sum(r["group"] == g for r in recs) for g in ("control", "ACL")},
               "by_sex": {g: sum(r["sex"] == g for r in recs) for g in ("female", "male")}}
        jd = {}
        for k in JUMP_INTERPRETED + JUMP_NOT_INTERPRETED:
            d = one_per_person([r["measures"][k]["delta"] for r in recs], recs)
            z = one_per_person([r["measures"][k]["dz"] for r in recs], recs)
            jd[k] = {"interpreted": k in JUMP_INTERPRETED,
                     "delta": summarize(d, J(f"delta_mean/{k}"), J(f"delta_median/{k}")),
                     "dz": summarize(z, J(f"dz2_mean/{k}")),
                     "per_participant": {r["subject"]: {"delta": r["measures"][k]["delta"], "dz": r["measures"][k]["dz"]} for r in recs}}
        if s["path"] == "B" and s["sample"] == "primary":
            ps = []
            for k in JUMP_INTERPRETED:
                d = clean(jd[k]["per_participant"][sid]["delta"] for sid in jd[k]["per_participant"])
                p = float(wilcoxon(d).pvalue) if any(x != 0 for x in d) else float("nan")
                jd[k]["wilcoxon_p"] = p
                jd[k]["rank_biserial"] = rank_biserial(d)
                ps.append(p)
            for k, a in zip(JUMP_INTERPRETED, holm(ps)):
                jd[k]["holm_p"] = a
        blk["J-D"] = jd
        ja, jb = {}, {}
        for sc in JUMP_SCORES:
            pers = [r["scores"][sc].get("personal") for r in recs]
            if pers and all(p is not None for p in pers):
                ranks = one_per_person([p["rank"] for p in pers], recs)
                ja[sc] = {"rank": summarize(ranks, J(f"personal_rank_mean/{sc}"), J(f"personal_rank_median/{sc}")),
                          "rank_1": {"count": int(sum(1 for x in ranks if x == 1)), "of": len(ranks),
                                     "share": float(np.mean([x == 1 for x in ranks])),
                                     "interval": wilson(sum(1 for x in ranks if x == 1), len(ranks)),
                                     "interval_label": calibration_label(J(f"personal_rank_share1/{sc}"))},
                          "true_split_mean_score": summarize([p["true_mean"] for p in pers], J(f"personal_true_mean/{sc}")),
                          "true_minus_median_of_20": summarize([p["true_mean"] - p["median_of_20"] for p in pers
                                                                if fin(p["true_mean"]) and fin(p["median_of_20"])]),
                          "per_participant": {r["subject"]: {"rank": p["rank"], "true_mean": p["true_mean"]} for r, p in zip(recs, pers)}}
            pop = [r["scores"][sc]["population"] for r in recs]
            jb[sc] = {"delta_score": summarize(one_per_person([p["delta"] for p in pop], recs), J(f"pop_delta_mean/{sc}")),
                      "per_participant": {r["subject"]: {"delta": p["delta"], "rank": p.get("rank")} for r, p in zip(recs, pop)}}
            if pop and all("rank" in p for p in pop):
                ranks = one_per_person([p["rank"] for p in pop], recs)
                jb[sc]["rank"] = summarize(ranks, J(f"pop_rank_mean/{sc}"))
                jb[sc]["share_rank_1"] = float(np.mean([x == 1 for x in ranks if fin(x)]))
                if sc in ja:
                    jb[sc]["personal_minus_population_rank"] = summarize(
                        [r["scores"][sc]["personal"]["rank"] - r["scores"][sc]["population"]["rank"] for r in recs
                         if fin(r["scores"][sc]["personal"]["rank"]) and fin(r["scores"][sc]["population"]["rank"])])
        blk["J-A"], blk["J-B"] = ja, jb
        if s["sample"] == "primary":
            jc = {}
            for k in JUMP_INTERPRETED:
                m = [r["measures"][k] for r in recs]
                jc[k] = {"median_abs_within_fresh": float(np.median(np.abs(clean(x["within_fresh_last_minus_first"] for x in m)))),
                         "median_abs_within_post": float(np.median(np.abs(clean(x["within_post_last_minus_first"] for x in m)))),
                         "median_abs_between": float(np.median(np.abs(clean(x["delta"] for x in m))))}
            popS0 = [r["scores"]["S0"]["population"] for r in recs]
            jc["S0 population score"] = {"median_abs_within_fresh": float(np.median(np.abs(clean(p["within_fresh_last_minus_first"] for p in popS0)))),
                                         "median_abs_within_post": float(np.median(np.abs(clean(p["within_post_last_minus_first"] for p in popS0)))),
                                         "median_abs_between": float(np.median(np.abs(clean(p["delta"] for p in popS0))))}
            blk["J-C"] = jc
            app = [r["measures"]["jumpHeight"]["delta"] for r in recs]
            com = [r["reference"]["com_rise_delta"] for r in recs]
            fp = [r["reference"]["forceplate_delta_cm"] for r in recs]
            pairs = [(a, c) for a, c in zip(app, com) if fin(a) and fin(c)]
            pf = [(a, f) for a, f in zip(app, fp) if fin(a) and fin(f)]
            blk["J-E"] = {"app_vs_com_rise": {"n": len(pairs), "spearman": float(spearmanr(*zip(*pairs)).statistic) if len(pairs) > 2 else None,
                                              "share_same_sign": float(np.mean([np.sign(a) == np.sign(c) for a, c in pairs])) if pairs else None},
                          "app_vs_forceplate": {"n": len(pf), "share_same_sign": float(np.mean([np.sign(a) == np.sign(f) for a, f in pf])) if pf else None,
                                                "note": "participant_log.xlsx force-plate heights; provenance unverified; direction only"}}
            jf = {}
            for split, values in (("group", ("control", "ACL")), ("sex", ("female", "male"))):
                for v in values:
                    sub = [r for r in recs if r[split] == v]
                    jf[f"{split}={v}"] = {"participants": len(sub),
                                          "dz": {k: summarize([r["measures"][k]["dz"] for r in sub]) for k in JUMP_INTERPRETED},
                                          "S0_personal_rank": summarize([r["scores"]["S0"]["personal"]["rank"] for r in sub])}
            blk["J-F"] = jf
        out["samples"][sk] = blk
    a = {r["subject"]: r for s in samples if s["path"] == "A" and s["sample"] == "same_participants" for r in s["records"]}
    b = {r["subject"]: r for s in samples if s["path"] == "B" and s["sample"] == "same_participants" for r in s["records"]}
    both = sorted(set(a) & set(b))
    out["paired_B_minus_A_same_participants"] = {
        "participants": len(both),
        "dz": {k: summarize([b[sid]["measures"][k]["dz"] - a[sid]["measures"][k]["dz"] for sid in both
                             if fin(b[sid]["measures"][k]["dz"]) and fin(a[sid]["measures"][k]["dz"])],
                            f"jump|paired_same_participants|paired_B_minus_A_dz2_mean/{k}") for k in JUMP_INTERPRETED},
        "S0_personal_rank": summarize([b[sid]["scores"]["S0"]["personal"]["rank"] - a[sid]["scores"]["S0"]["personal"]["rank"] for sid in both])}
    return out


# ------------------------------------------------------------------------------------------- REHAB24-6
def rehab_summary(sets):
    out = {}
    for s in sets:
        recs = s["records"]
        R = lambda stat: f"rehab|{s['set']}|{stat}"  # noqa: E731
        pa = one_per_person([auc_fold_paired(r["personal_folds"]) for r in recs], recs)
        pa_v1 = one_per_person([auc_fold_averaged(r["personal_folds"]) for r in recs], recs)
        po = one_per_person([auc_pairs(r["population"]["incorrect"], r["population"]["correct"]) for r in recs], recs)
        keys = list(recs[0]["stddiff"]) if recs else []
        status = SQUAT_STATUS if s["exercise"] == "squat" else {k: ("passed" if k == "trunkLean" else "failed or not checked") for k in keys}
        out[s["set"]] = {
            "key": s["key"], "exercise": s["exercise"], "persons": len(recs),
            "reps_correct": sum(r["n_correct"] for r in recs), "reps_incorrect": sum(r["n_incorrect"] for r in recs),
            "R-1": {"personal_auc": summarize(pa, R("aucB_mean"), R("aucB_median")),
                    "population_auc": summarize(po, R("aucPop_mean"), R("aucPop_median")),
                    "personal_minus_population": summarize([x - y for x, y in zip(pa, po) if fin(x) and fin(y)]),
                    "personal_auc_v1_fold_averaged_superseded": summarize(pa_v1),
                    "per_person": {r["person"]: {"n_correct": r["n_correct"], "n_incorrect": r["n_incorrect"],
                                                 "personal_auc": x, "population_auc": y} for r, x, y in zip(recs, pa, po)}},
            "R-2": {k: {"status": status.get(k, "not checked"), "interpreted": s["exercise"] == "squat" and k in SQUAT_INTERPRETED,
                        "stddiff": summarize(one_per_person([r["stddiff"][k] for r in recs], recs), R(f"std2_mean/{k}"), R(f"std2_median/{k}"))}
                    for k in keys},
            "note": SQUAT_WEIGHT_NOTE if s["exercise"] == "squat" else
                    "Split squats: descriptive only. The app finds far fewer correct split squats than incorrect ones "
                    "(recall 0.72 vs 0.93), and only peak trunk lean passed the Phase 4A.5 criteria.",
        }
    return out


# ------------------------------------------------------------------------------------------- report
INTERVAL_NOTE = ("Intervals: Student t for means, exact order-statistic intervals for medians, Wilson for proportions, each over "
                 "people. Each carries the label its shuffled-label calibration earned (phase4b_interval_calibration.json): "
                 "'95% CI' only where coverage was at least 93.5% under no effect and in the positive control; otherwise the "
                 "calibrated coverage is stated, and below 85% no interval is shown. Calibration holds the people fixed and "
                 "varies only the labels, so it cannot test coverage under between-person differences in true effects.")


def header(labels, meta, title):
    L = [f"# {title}", ""]
    if labels != "actual":
        L += ["> **DEVELOPMENT OUTPUT ON SHUFFLED LABELS. These are not results.** Each participant's condition labels "
              f"(each person's correctness labels) were randomly reassigned among their own trials (reps) (seed {meta.get('seed')})."
              + (" Known shifts were injected as a positive control." if meta.get("inject") else ""), ""]
    L += ["Exploratory offline motion-capture evaluation: motion capture seen through a virtual camera and measured by "
          "BreakingPoint's own code. Not independent validation (the data and the Phase 4A.5 checks were inspected first), "
          "not a test of the production alert, and not a measure of MediaPipe or webcam accuracy. Kept separate from the "
          "synthetic UF HiPerGator study; nothing here is attributed to it.", "", INTERVAL_NOTE, ""]
    if meta.get("freeze"):
        L += [f"Protocol-freeze commit `{meta['freeze']['protocol_freeze_commit']}`; analysis freeze (v2) SHA-256 "
              f"`{meta['freeze']['analysis_freeze_sha256']}`. Deviations: research/protocols/phase4b_deviations.md.", ""]
    return L


def jump_report(sumj, inclusion, labels, meta):
    L = header(labels, meta, "Phase 4B: fresh vs post-protocol jumps (exploratory)")
    w = L.append
    w("Every result describes changes **after the fatigue protocol**, not effects of fatigue: all fresh jumps were recorded first "
      "(order confound). No permutation p-value is reported for fatigue. Path B (experimental timing, research only) is the primary "
      "path and is not independent validation: P1 was chosen on this dataset. Path A is the unchanged production pipeline.")
    w("")
    w("## Samples and missing data (shown before any outcome)")
    w("")
    J = inclusion["jump_fatigue"]
    w(f"Data-quality exclusions (both paths): {len(J['data_quality_exclusions'])} trials that start crouched: "
      + ", ".join(sorted(J["data_quality_exclusions"])) + ".")
    w("")
    w("| Path | View | Usable trials | Missing (not found) by group/condition |")
    w("|---|---|---|---|")
    for p in ("B", "A"):
        for v in ("advised", "side"):
            x = J["paths"][p]["views"][v]
            w(f"| {J['paths'][p]['label']} | {v} | {x['trials_usable']} | "
              + "; ".join(f"{k} {d['missing']}/{d['of']}" for k, d in x["not_found_by_group_condition"].items()) + " |")
    w("")
    w("| Sample | Path | Participants | Jumps | Control / ACL | Women / men |")
    w("|---|---|---|---|---|---|")
    for k, b in sumj["samples"].items():
        w(f"| {b['sample']} ({b['view']}) | {b['path']} | {b['participants']} | {b['jumps']} | {b['by_group']['control']} / {b['by_group']['ACL']} | "
          f"{b['by_sex']['female']} / {b['by_sex']['male']} |")
    w("")
    w("The side-view samples are camera-angle sensitivity only; no subgroup comparisons are made from them (Path A's side-view "
      "sample has 3 men).")
    w("")
    w("## J-D. Which measurements changed (post-protocol minus fresh, per participant)")
    w("")
    w("Δz is the change divided by the mean of the app's spread (`scale`, with its noise floors) in the person's fresh and "
      "post-protocol jumps (analysis v2; see deviations).")
    w("")
    prim = sumj["samples"]["B/primary"]
    w(f"### Primary: Path B, advised view, {prim['participants']} participants (Holm-corrected Wilcoxon, exploratory)")
    w("")
    w("| Measurement | n | Mean Δ, interval | Median Δ, interval | Mean Δz, interval | Share Δ > 0 | Rank-biserial r | Wilcoxon p | Holm p |")
    w("|---|---|---|---|---|---|---|---|---|")
    for k in JUMP_INTERPRETED:
        x = prim["J-D"][k]
        w(f"| {k} | {x['delta']['n']} | {fmt(x['delta'].get('mean'), 4)} {fci(x['delta'], 'mean', 4)} | {fmt(x['delta'].get('median'), 4)} {fci(x['delta'], 'median', 4)} | "
          f"{fmt(x['dz'].get('mean'))} {fci(x['dz'])} | {fmt(x['delta'].get('share_above_zero'), 2)} | {fmt(x.get('rank_biserial'))} | "
          f"{fmt(x.get('wilcoxon_p'), 4)} | {fmt(x.get('holm_p'), 4)} |")
    w("")
    w("Not validated in Phase 4A.5 (reported, not interpreted):")
    w("")
    for k in JUMP_NOT_INTERPRETED:
        x = prim["J-D"][k]
        w(f"- {k}: mean Δ {fmt(x['delta'].get('mean'), 4)} {fci(x['delta'], 'mean', 4)}, mean Δz {fmt(x['dz'].get('mean'))} {fci(x['dz'])}, n {x['delta']['n']}")
    w("")
    w("### Supporting (effect sizes and intervals; no hypothesis tests)")
    w("")
    for key, b in sumj["samples"].items():
        if key == "B/primary":
            continue
        w(f"**{b['sample']} ({b['view']}), Path {b['path']}, {b['participants']} participants:** " + "; ".join(
            (f"{k} mean Δz {fmt(b['J-D'][k]['dz'].get('mean'))} {fci(b['J-D'][k]['dz'])}" if b['J-D'][k]['dz']['n']
             else f"{k} mean Δ {fmt(b['J-D'][k]['delta'].get('mean'), 4)} {fci(b['J-D'][k]['delta'], 'mean', 4)}") for k in JUMP_INTERPRETED) + ".")
        w("")
    pr = sumj["paired_B_minus_A_same_participants"]
    w(f"**Same participants ({pr['participants']}), paired Path B minus Path A difference in Δz:** "
      + "; ".join(f"{k} {fmt(v.get('mean'))} {fci(v)}" for k, v in pr["dz"].items())
      + f". S0 personal true-split rank, B minus A: median {fmt(pr['S0_personal_rank'].get('median'), 1)}.")
    w("")
    w("## J-A. Separation under a personal baseline (descriptive; rank 1 of 20 = the fresh jumps as reference separate the most)")
    w("")
    w("These are descriptive separation statistics, not p-values: the order confound makes the six jumps non-exchangeable. "
      "With no effect the mean rank is 10.5 and the share at rank 1 is about 0.05.")
    w("")
    w("| Sample | Path | Score | n | Mean rank, interval | Median rank, interval | At rank 1, Wilson interval | Mean true-split score, interval |")
    w("|---|---|---|---|---|---|---|---|")
    for key, b in sumj["samples"].items():
        for sc, x in b["J-A"].items():
            r1 = x["rank_1"]
            w(f"| {b['sample']} ({b['view']}) | {b['path']} | {sc} | {x['rank']['n']} | {fmt(x['rank'].get('mean'), 2)} {fci(x['rank'], 'mean', 2)} | "
              f"{fmt(x['rank'].get('median'), 1)} {fci(x['rank'], 'median', 1)} | {r1['count']}/{r1['of']} "
              f"[{fmt(r1['interval'][0], 2)}, {fmt(r1['interval'][1], 2)}] ({r1['interval_label']}) | "
              f"{fmt(x['true_split_mean_score'].get('mean'))} {fci(x['true_split_mean_score'])} |")
    w("")
    w("Scores: " + "; ".join(SCORE_LABEL.values()) + ".")
    w("")
    w("## J-B. Population baseline (leave one participant out)")
    w("")
    w("| Sample | Path | Score | n | Mean Δscore, interval | Mean rank, interval | Personal minus population rank, median |")
    w("|---|---|---|---|---|---|---|")
    for key, b in sumj["samples"].items():
        for sc, x in b["J-B"].items():
            r = x.get("rank")
            w(f"| {b['sample']} ({b['view']}) | {b['path']} | {sc} | {x['delta_score']['n']} | {fmt(x['delta_score'].get('mean'))} {fci(x['delta_score'])} | "
              f"{(fmt(r.get('mean'), 2) + ' ' + fci(r, 'mean', 2)) if r else '-'} | {fmt(x.get('personal_minus_population_rank', {}).get('median'), 1)} |")
    w("")
    w("## J-C. Order probe (primary samples): median absolute change, jump 1 to jump 3 within a block, vs between blocks")
    w("")
    w("| Path | Measurement | Within fresh | Within post-protocol | Between blocks (mean post - mean fresh) |")
    w("|---|---|---|---|---|")
    for p in ("B", "A"):
        for k, x in sumj["samples"][f"{p}/primary"]["J-C"].items():
            w(f"| {p} | {k} | {fmt(x['median_abs_within_fresh'], 4)} | {fmt(x['median_abs_within_post'], 4)} | {fmt(x['median_abs_between'], 4)} |")
    w("")
    w("## J-E. Direction checks (primary samples, descriptive)")
    w("")
    for p in ("B", "A"):
        e = sumj["samples"][f"{p}/primary"]["J-E"]
        w(f"- Path {p}: app jump-height change vs centre-of-mass rise change: Spearman {fmt(e['app_vs_com_rise']['spearman'])}, "
          f"same sign {fmt(e['app_vs_com_rise']['share_same_sign'], 2)} (n {e['app_vs_com_rise']['n']}); vs force-plate height change "
          f"(participant_log.xlsx, provenance unverified, direction only): same sign {fmt(e['app_vs_forceplate']['share_same_sign'], 2)} (n {e['app_vs_forceplate']['n']}).")
    w("")
    w("## J-F. Between-person variability (primary samples, descriptive; no tests, no intervals, no subgroup performance claims)")
    w("")
    w("| Path | Subgroup | n | " + " | ".join(f"{k} Δz median (IQR)" for k in JUMP_INTERPRETED) + " |")
    w("|---|---|---|" + "---|" * len(JUMP_INTERPRETED))
    for p in ("B", "A"):
        for g, x in sumj["samples"][f"{p}/primary"]["J-F"].items():
            w(f"| {p} | {g} | {x['participants']} | " + " | ".join(
                f"{fmt(x['dz'][k].get('median'))} ({fmt(x['dz'][k].get('q25'))} to {fmt(x['dz'][k].get('q75'))})" for k in JUMP_INTERPRETED) + " |")
    w("")
    w("## Limits")
    w("")
    for t in ["Order confound: fresh jumps always came first; changes are 'after the protocol', not fatigue.",
              "Three jumps per block, below the app's 4-rep calibration minimum; the alert is not evaluated.",
              "Unilateral fatigue protocol, bilateral jumps.", "Control vs ACL is descriptive; nothing is said about injury.",
              "Best-case motion-capture input; not MediaPipe or webcam accuracy.",
              "Path A misses the highest jumps, and in the ACL group more fresh than post-protocol jumps.",
              "Path B and S-valid were shaped by Phase 4A.5 on this dataset; neither is independent validation.",
              "Development used shuffled labels, but this is not a blinded study: the data and some reference outcomes were inspected beforehand.",
              "Interval calibration holds the participants fixed; it cannot check coverage under between-person differences in true effects."]:
        w(f"- {t}")
    return "\n".join(L) + "\n"


def rehab_report(sumr, inclusion, labels, meta):
    L = header(labels, meta, "Phase 4B: correct vs incorrect form, REHAB24-6 (exploratory)")
    w = L.append
    w("'Incorrect' means a technique error performed on purpose; **it is not fatigue**. Unchanged production pipeline; "
      "shipped scores with shipped weights.")
    w("")
    w("## Samples (shown before any outcome)")
    w("")
    for k, v in inclusion["rehab24_6"].items():
        w(f"- {k} ({v['role']}): annotated {v['annotated_reps']}, excluded {len(v['excluded_reps'])} (motion-capture errors), "
          f"without a linked found rep {len(v['reps_without_a_linked_found_rep'])}; eligible persons {', '.join(v['eligible_for_personal_baseline']['persons'])}.")
    w("")
    w("Reps are linked to annotations by the lenient rule (at least half of the found rep inside the annotation). That is not a "
      "segmentation result; segmentation accuracy is the strict IoU >= 0.5 metric (squat F1 0.76, Phase 4A.5).")
    w("")
    w("Personal-baseline AUC (analysis v2): each held-out correct rep is compared with the incorrect reps scored against the same "
      "baseline (fold-paired); with no effect it is centred on 0.5. Standardized differences divide by the person's pooled spread.")
    w("")
    for name, x in sumr.items():
        w(f"## {name} ({x['key']}): {x['persons']} persons, {x['reps_correct']} correct and {x['reps_incorrect']} incorrect reps")
        w("")
        w(f"> {x['note']}")
        w("")
        r1 = x["R-1"]
        w("| Baseline | Mean AUC, interval | Median AUC, interval | n persons |")
        w("|---|---|---|---|")
        for lab, k in (("Personal (leave one correct rep out, fold-paired)", "personal_auc"), ("Population (leave one person out)", "population_auc")):
            s = r1[k]
            w(f"| {lab} | {fmt(s.get('mean'))} {fci(s)} | {fmt(s.get('median'))} {fci(s, 'median')} | {s['n']} |")
        w(f"| Personal minus population, per person | mean {fmt(r1['personal_minus_population'].get('mean'))} | median {fmt(r1['personal_minus_population'].get('median'))} | {r1['personal_minus_population']['n']} |")
        w("")
        w("Per person: " + "; ".join(f"{p}: correct {v['n_correct']}, incorrect {v['n_incorrect']}{' (flag: single incorrect rep)' if v['n_incorrect'] == 1 else ''}, "
                                     f"AUC personal {fmt(v['personal_auc'])} / population {fmt(v['population_auc'])}" for p, v in r1["per_person"].items()) + ".")
        w("")
        w("| Measurement | Status (Phase 4A.5) | Interpreted | Median standardized difference (incorrect - correct), interval | n |")
        w("|---|---|---|---|---|")
        for k, v in x["R-2"].items():
            w(f"| {k} | {v['status']} | {'yes' if v['interpreted'] else 'no'} | {fmt(v['stddiff'].get('median'))} {fci(v['stddiff'], 'median')} | {v['stddiff'].get('n', 0)} |")
        w("")
    w("## Limits")
    w("")
    for t in ["Mistakes differ between people by design; correct and incorrect reps were recorded in blocks.",
              "Some people have few incorrect reps (person 2: one).",
              "A higher score means 'more different from this person's correct reps', never 'worse'.",
              "Best-case motion-capture input; not MediaPipe or webcam accuracy.",
              "Development used shuffled labels, but this is not a blinded study: the data were inspected beforehand.",
              "With 9 people (8, 5 in the sensitivity and split-squat sets), intervals are wide and their calibration is limited."]:
        w(f"- {t}")
    return "\n".join(L) + "\n"


def main(records_path: str, out_dir: str, meta_extra: dict | None = None):
    rec = json.loads(Path(records_path).read_text(encoding="utf-8"))
    inclusion = json.loads((REPO / "research/protocols/phase4b_inclusion_v04.json").read_text(encoding="utf-8"))
    meta = {"labels": rec["labels"], "seed": rec["seed"], "inject": rec["inject"], "analysis": "v2", **(meta_extra or {})}
    sj, sr = jump_summary(rec["jump"]), rehab_summary(rec["rehab"])
    out = Path(out_dir)
    for name, summ, rep in (("jump_fatigue", sj, jump_report(sj, inclusion, rec["labels"], meta)),
                            ("rehab24_6", sr, rehab_report(sr, inclusion, rec["labels"], meta))):
        d = out / name
        d.mkdir(parents=True, exist_ok=True)
        (d / "summary.json").write_text(json.dumps({"meta": meta, "evaluation": "exploratory offline motion-capture evaluation", name: summ},
                                                   indent=1, default=float), encoding="utf-8")
        (d / "REPORT.md").write_text(rep, encoding="utf-8")
    return sj, sr


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
    print(f"wrote {sys.argv[2]}/jump_fatigue and {sys.argv[2]}/rehab24_6")
