"""Phase 4B statistics: summaries of the per-participant / per-person records from compute.ts.

    python -I research/phase4b/stats.py <records.json> <out dir>

Implements the analyses fixed in research/protocols/jump_fatigue_v04.md (J-A to J-F) and
rehab24_6_v04.md (R-1 to R-4). Every summary is over participants (people): repeated jumps and reps are
first combined within each person, and intervals resample people (2,000 resamples, seed 20261009).
The only hypothesis tests are the six Wilcoxon signed-rank tests of the primary Path B measurement
comparisons, Holm-corrected (U10). Writes summary.json and REPORT.md (jump and REHAB24-6 in separate
subfolders), and refuses to call shuffled-label output "results".
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from scipy.stats import spearmanr, wilcoxon

BOOT = 2000
SEED = 20261009
REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

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


def boot_ci(xs, stat=np.mean, seed=SEED):
    """Percentile bootstrap interval of `stat` over people (values are already one per person)."""
    xs = np.asarray(clean(xs))
    if len(xs) < 2:
        return None
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(xs), size=(BOOT, len(xs)))
    vals = np.apply_along_axis(stat, 1, xs[idx])
    return [float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))]


def summarize(xs, seed=SEED):
    v = clean(xs)
    if not v:
        return {"n": 0}
    return {"n": len(v), "mean": float(np.mean(v)), "mean_ci95": boot_ci(v, np.mean, seed), "median": float(np.median(v)),
            "median_ci95": boot_ci(v, np.median, seed), "q25": float(np.percentile(v, 25)), "q75": float(np.percentile(v, 75)),
            "min": float(min(v)), "max": float(max(v)), "share_above_zero": float(np.mean(np.asarray(v) > 0))}


def rank_biserial(d):
    """Matched-pairs rank-biserial correlation: (sum of positive ranks - sum of negative ranks) / total."""
    d = np.asarray([x for x in clean(d) if x != 0])
    if not len(d):
        return None
    ranks = np.argsort(np.argsort(np.abs(d), kind="mergesort"), kind="mergesort").astype(float) + 1
    # average ranks for ties in |d|
    a = np.abs(d)
    for v in np.unique(a):
        m = a == v
        ranks[m] = ranks[m].mean()
    return float((ranks[d > 0].sum() - ranks[d < 0].sum()) / ranks.sum())


def holm(pvals):
    """Holm step-down adjusted p-values, in the input order."""
    p = np.asarray(pvals, float)
    order = np.argsort(p)
    adj = np.empty_like(p)
    running = 0.0
    m = len(p)
    for k, i in enumerate(order):
        running = max(running, min(1.0, (m - k) * p[i]))
        adj[i] = running
    return adj.tolist()


def auc(pos, neg):
    """P(pos > neg) + 0.5 P(pos = neg)."""
    pos, neg = clean(pos), clean(neg)
    if not pos or not neg:
        return None
    gt = sum(1 for a in pos for b in neg if a > b)
    eq = sum(1 for a in pos for b in neg if a == b)
    return (gt + 0.5 * eq) / (len(pos) * len(neg))


def fmt(x, d=3):
    return "-" if not fin(x) else f"{x:.{d}f}"


def fci(ci, d=3):
    return "-" if not ci else f"[{fmt(ci[0], d)}, {fmt(ci[1], d)}]"


# ------------------------------------------------------------------------------------------- jump
def jump_summary(samples):
    out = {"samples": {}}
    for s in samples:
        key = f"{s['path']}/{s['sample']}"
        recs = s["records"]
        blk = {"path": s["path"], "path_label": s["path_label"], "sample": s["sample"], "view": s["view"],
               "participants": len(recs), "jumps": sum(r["n_fresh"] + r["n_post"] for r in recs),
               "by_group": {g: sum(r["group"] == g for r in recs) for g in ("control", "ACL")},
               "by_sex": {g: sum(r["sex"] == g for r in recs) for g in ("female", "male")}}
        # J-D: which measurements changed
        jd = {}
        for k in JUMP_INTERPRETED + JUMP_NOT_INTERPRETED:
            d = [r["measures"][k]["delta"] for r in recs]
            z = [r["measures"][k]["dz"] for r in recs]
            jd[k] = {"interpreted": k in JUMP_INTERPRETED, "delta": summarize(d), "dz": summarize(z),
                     "per_participant": {r["subject"]: {"delta": r["measures"][k]["delta"], "dz": r["measures"][k]["dz"]} for r in recs}}
        if s["path"] == "B" and s["sample"] == "primary":
            ps = []
            for k in JUMP_INTERPRETED:
                d = clean(jd[k]["per_participant"][sid]["delta"] for sid in jd[k]["per_participant"])
                p = float(wilcoxon(d).pvalue) if len([x for x in d if x != 0]) >= 1 else float("nan")
                jd[k]["wilcoxon_p"] = p
                jd[k]["rank_biserial"] = rank_biserial(d)
                ps.append(p)
            for k, a in zip(JUMP_INTERPRETED, holm(ps)):
                jd[k]["holm_p"] = a
        blk["J-D"] = jd
        # J-A and J-B
        ja, jb = {}, {}
        for sc in JUMP_SCORES:
            pers = [r["scores"][sc].get("personal") for r in recs]
            if all(p is not None for p in pers) and pers:
                ranks = [p["rank"] for p in pers]
                ja[sc] = {"rank": summarize(ranks), "share_rank_1": float(np.mean([x == 1 for x in ranks if fin(x)])),
                          "true_split_mean_score": summarize([p["true_mean"] for p in pers]),
                          "true_minus_median_of_20": summarize([p["true_mean"] - p["median_of_20"] for p in pers
                                                                if fin(p["true_mean"]) and fin(p["median_of_20"])]),
                          "per_participant": {r["subject"]: {"rank": p["rank"], "true_mean": p["true_mean"]} for r, p in zip(recs, pers)}}
            pop = [r["scores"][sc]["population"] for r in recs]
            jb[sc] = {"delta_score": summarize([p["delta"] for p in pop]),
                      "per_participant": {r["subject"]: {"delta": p["delta"], "rank": p.get("rank")} for r, p in zip(recs, pop)}}
            if all("rank" in p for p in pop) and pop:
                ranks = [p["rank"] for p in pop]
                jb[sc]["rank"] = summarize(ranks)
                jb[sc]["share_rank_1"] = float(np.mean([x == 1 for x in ranks if fin(x)]))
                if sc in ja:
                    jb[sc]["personal_minus_population_rank"] = summarize(
                        [r["scores"][sc]["personal"]["rank"] - r["scores"][sc]["population"]["rank"] for r in recs
                         if fin(r["scores"][sc]["personal"]["rank"]) and fin(r["scores"][sc]["population"]["rank"])])
        blk["J-A"], blk["J-B"] = ja, jb
        if s["sample"] == "primary":
            # J-C order probe
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
            # J-E direction checks
            app = [r["measures"]["jumpHeight"]["delta"] for r in recs]
            com = [r["reference"]["com_rise_delta"] for r in recs]
            fp = [r["reference"]["forceplate_delta_cm"] for r in recs]
            pairs = [(a, c) for a, c in zip(app, com) if fin(a) and fin(c)]
            pf = [(a, f) for a, f in zip(app, fp) if fin(a) and fin(f)]
            blk["J-E"] = {"app_vs_com_rise": {"n": len(pairs), "spearman": float(spearmanr(*zip(*pairs)).statistic) if len(pairs) > 2 else None,
                                              "share_same_sign": float(np.mean([np.sign(a) == np.sign(c) for a, c in pairs])) if pairs else None},
                          "app_vs_forceplate": {"n": len(pf), "share_same_sign": float(np.mean([np.sign(a) == np.sign(f) for a, f in pf])) if pf else None,
                                                "note": "participant_log.xlsx force-plate heights; provenance unverified; direction only"}}
            # J-F between-person variability
            jf = {}
            for split, values in (("group", ("control", "ACL")), ("sex", ("female", "male"))):
                for v in values:
                    sub = [r for r in recs if r[split] == v]
                    jf[f"{split}={v}"] = {"participants": len(sub),
                                          "dz": {k: summarize([r["measures"][k]["dz"] for r in sub]) for k in JUMP_INTERPRETED},
                                          "S0_personal_rank": summarize([r["scores"]["S0"]["personal"]["rank"] for r in sub])}
            blk["J-F"] = jf
        out["samples"][key] = blk
    # Same participants: paired Path B - Path A difference in Δz
    a = {r["subject"]: r for s in samples if s["path"] == "A" and s["sample"] == "same_participants" for r in s["records"]}
    b = {r["subject"]: r for s in samples if s["path"] == "B" and s["sample"] == "same_participants" for r in s["records"]}
    both = sorted(set(a) & set(b))
    out["paired_B_minus_A_same_participants"] = {
        "participants": len(both),
        "dz": {k: summarize([b[sid]["measures"][k]["dz"] - a[sid]["measures"][k]["dz"] for sid in both
                             if fin(b[sid]["measures"][k]["dz"]) and fin(a[sid]["measures"][k]["dz"])]) for k in JUMP_INTERPRETED},
        "S0_personal_rank": summarize([b[sid]["scores"]["S0"]["personal"]["rank"] - a[sid]["scores"]["S0"]["personal"]["rank"] for sid in both])}
    return out


# ------------------------------------------------------------------------------------------- REHAB24-6
def rehab_summary(sets):
    out = {}
    for s in sets:
        recs = s["records"]
        pa = {r["person"]: auc(r["personal"]["incorrect_mean_over_folds"], r["personal"]["heldout_correct"]) for r in recs}
        po = {r["person"]: auc(r["population"]["incorrect"], r["population"]["correct"]) for r in recs}
        keys = list(recs[0]["stddiff"]) if recs else []
        status = SQUAT_STATUS if s["exercise"] == "squat" else {k: ("passed" if k == "trunkLean" else "failed or not checked") for k in keys}
        out[s["set"]] = {
            "key": s["key"], "exercise": s["exercise"], "persons": len(recs),
            "reps_correct": sum(r["n_correct"] for r in recs), "reps_incorrect": sum(r["n_incorrect"] for r in recs),
            "R-1": {"personal_auc": summarize(pa.values()), "population_auc": summarize(po.values()),
                    "personal_minus_population": summarize([pa[p] - po[p] for p in pa if fin(pa[p]) and fin(po[p])]),
                    "per_person": {r["person"]: {"n_correct": r["n_correct"], "n_incorrect": r["n_incorrect"],
                                                 "personal_auc": pa[r["person"]], "population_auc": po[r["person"]]} for r in recs}},
            "R-2": {k: {"status": status.get(k, "not checked"), "interpreted": s["exercise"] == "squat" and k in SQUAT_INTERPRETED,
                        "stddiff": summarize([r["stddiff"][k] for r in recs])} for k in keys},
            "note": SQUAT_WEIGHT_NOTE if s["exercise"] == "squat" else
                    "Split squats: descriptive only. The app finds far fewer correct split squats than incorrect ones "
                    "(recall 0.72 vs 0.93), and only peak trunk lean passed the Phase 4A.5 criteria.",
        }
    return out


# ------------------------------------------------------------------------------------------- report
def header(labels, meta, title):
    L = [f"# {title}", ""]
    if labels != "actual":
        L += ["> **DEVELOPMENT OUTPUT ON SHUFFLED LABELS. These are not results.** Each participant's condition labels "
              f"(each person's correctness labels) were randomly reassigned among their own trials (reps) (seed {meta.get('seed')})."
              + (" Known shifts were injected as a positive control." if meta.get("inject") else ""), ""]
    L += ["Exploratory offline motion-capture evaluation: motion capture seen through a virtual camera and measured by "
          "BreakingPoint's own code. Not independent validation (the data and the Phase 4A.5 checks were inspected first), "
          "not a test of the production alert, and not a measure of MediaPipe or webcam accuracy. Kept separate from the "
          "synthetic UF HiPerGator study; nothing here is attributed to it.", ""]
    if meta.get("freeze"):
        L += [f"Protocol-freeze commit `{meta['freeze']['protocol_freeze_commit']}`; analysis freeze SHA-256 "
              f"`{meta['freeze']['analysis_freeze_sha256']}`.", ""]
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
    w("Δz is the change in units of the person's own spread (the app's `scale` from their 3 fresh jumps, with its noise floors). "
      "Means and medians are over participants; intervals resample participants.")
    w("")
    prim = sumj["samples"]["B/primary"]
    w(f"### Primary: Path B, advised view, {prim['participants']} participants (Holm-corrected Wilcoxon, exploratory)")
    w("")
    w("| Measurement | n | Mean Δ [95% CI] | Median Δ | Mean Δz [95% CI] | Share Δ > 0 | Rank-biserial r | Wilcoxon p | Holm p |")
    w("|---|---|---|---|---|---|---|---|---|")
    for k in JUMP_INTERPRETED:
        x = prim["J-D"][k]
        w(f"| {k} | {x['delta']['n']} | {fmt(x['delta'].get('mean'), 4)} {fci(x['delta'].get('mean_ci95'), 4)} | {fmt(x['delta'].get('median'), 4)} | "
          f"{fmt(x['dz'].get('mean'))} {fci(x['dz'].get('mean_ci95'))} | {fmt(x['delta'].get('share_above_zero'), 2)} | {fmt(x.get('rank_biserial'))} | "
          f"{fmt(x.get('wilcoxon_p'), 4)} | {fmt(x.get('holm_p'), 4)} |")
    w("")
    w("Not validated in Phase 4A.5 (reported, not interpreted):")
    w("")
    for k in JUMP_NOT_INTERPRETED:
        x = prim["J-D"][k]
        w(f"- {k}: mean Δ {fmt(x['delta'].get('mean'), 4)} {fci(x['delta'].get('mean_ci95'), 4)}, mean Δz {fmt(x['dz'].get('mean'))} {fci(x['dz'].get('mean_ci95'))}, n {x['delta']['n']}")
    w("")
    w("### Supporting (effect sizes and intervals; no hypothesis tests)")
    w("")
    w("| Sample | Path | n | " + " | ".join(f"{k} mean Δz [95% CI]" for k in JUMP_INTERPRETED) + " |")
    w("|---|---|---|" + "---|" * len(JUMP_INTERPRETED))
    for key, b in sumj["samples"].items():
        if key == "B/primary":
            continue
        cells = []
        for k in JUMP_INTERPRETED:
            x = b["J-D"][k]
            cells.append(f"{fmt(x['dz'].get('mean'))} {fci(x['dz'].get('mean_ci95'))}" if x["dz"]["n"] else f"Δ {fmt(x['delta'].get('mean'), 4)} {fci(x['delta'].get('mean_ci95'), 4)}")
        w(f"| {b['sample']} ({b['view']}) | {b['path']} | {b['participants']} | " + " | ".join(cells) + " |")
    w("")
    pr = sumj["paired_B_minus_A_same_participants"]
    w(f"Same participants ({pr['participants']}), paired Path B minus Path A difference in Δz: "
      + "; ".join(f"{k} {fmt(v.get('mean'))} {fci(v.get('mean_ci95'))}" for k, v in pr["dz"].items())
      + f". S0 personal true-split rank, B minus A: median {fmt(pr['S0_personal_rank'].get('median'), 1)}.")
    w("")
    w("## J-A. Separation under a personal baseline (descriptive; rank 1 of 20 = the fresh jumps as reference separate the most)")
    w("")
    w("These are descriptive separation statistics, not p-values: the order confound makes the six jumps non-exchangeable.")
    w("")
    w("| Sample | Path | Score | n | Median rank (IQR) | Share at rank 1 | Mean true-split score [95% CI] | True minus median of 20, mean |")
    w("|---|---|---|---|---|---|---|---|")
    for key, b in sumj["samples"].items():
        for sc, x in b["J-A"].items():
            w(f"| {b['sample']} ({b['view']}) | {b['path']} | {sc} | {x['rank']['n']} | {fmt(x['rank'].get('median'), 1)} ({fmt(x['rank'].get('q25'), 1)} to {fmt(x['rank'].get('q75'), 1)}) | "
              f"{fmt(x['share_rank_1'], 2)} | {fmt(x['true_split_mean_score'].get('mean'))} {fci(x['true_split_mean_score'].get('mean_ci95'))} | "
              f"{fmt(x['true_minus_median_of_20'].get('mean'))} |")
    w("")
    w("Scores: " + "; ".join(SCORE_LABEL.values()) + ".")
    w("")
    w("## J-B. Population baseline (leave one participant out)")
    w("")
    w("| Sample | Path | Score | n | Mean Δscore [95% CI] | Median rank (IQR) | Personal minus population rank, median |")
    w("|---|---|---|---|---|---|---|")
    for key, b in sumj["samples"].items():
        for sc, x in b["J-B"].items():
            r = x.get("rank")
            w(f"| {b['sample']} ({b['view']}) | {b['path']} | {sc} | {x['delta_score']['n']} | {fmt(x['delta_score'].get('mean'))} {fci(x['delta_score'].get('mean_ci95'))} | "
              f"{(fmt(r.get('median'), 1) + ' (' + fmt(r.get('q25'), 1) + ' to ' + fmt(r.get('q75'), 1) + ')') if r else '-'} | "
              f"{fmt(x.get('personal_minus_population_rank', {}).get('median'), 1)} |")
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
    w("## J-F. Between-person variability (primary samples, descriptive; no tests, no subgroup performance claims)")
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
              "Development used shuffled labels, but this is not a blinded study: the data and some reference outcomes were inspected beforehand."]:
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
    for name, x in sumr.items():
        w(f"## {name} ({x['key']}): {x['persons']} persons, {x['reps_correct']} correct and {x['reps_incorrect']} incorrect reps")
        w("")
        w(f"> {x['note']}")
        w("")
        r1 = x["R-1"]
        w("| Baseline | Median AUC [95% CI] | Mean AUC [95% CI] | n persons |")
        w("|---|---|---|---|")
        for lab, k in (("Personal (leave one correct rep out)", "personal_auc"), ("Population (leave one person out)", "population_auc")):
            s = r1[k]
            w(f"| {lab} | {fmt(s.get('median'))} {fci(s.get('median_ci95'))} | {fmt(s.get('mean'))} {fci(s.get('mean_ci95'))} | {s['n']} |")
        w(f"| Personal minus population, per person | median {fmt(r1['personal_minus_population'].get('median'))} | mean {fmt(r1['personal_minus_population'].get('mean'))} {fci(r1['personal_minus_population'].get('mean_ci95'))} | {r1['personal_minus_population']['n']} |")
        w("")
        w("Per person: " + "; ".join(f"{p}: correct {v['n_correct']}, incorrect {v['n_incorrect']}{' (flag: single incorrect rep)' if v['n_incorrect'] == 1 else ''}, "
                                     f"AUC personal {fmt(v['personal_auc'])} / population {fmt(v['population_auc'])}" for p, v in r1["per_person"].items()) + ".")
        w("")
        w("| Measurement | Status (Phase 4A.5) | Interpreted | Median standardized difference (incorrect - correct) [95% CI] | n |")
        w("|---|---|---|---|---|")
        for k, v in x["R-2"].items():
            w(f"| {k} | {v['status']} | {'yes' if v['interpreted'] else 'no'} | {fmt(v['stddiff'].get('median'))} {fci(v['stddiff'].get('median_ci95'))} | {v['stddiff'].get('n', 0)} |")
        w("")
    w("## Limits")
    w("")
    for t in ["Mistakes differ between people by design; correct and incorrect reps were recorded in blocks.",
              "Some people have few incorrect reps (person 2: one).",
              "A higher score means 'more different from this person's correct reps', never 'worse'.",
              "Best-case motion-capture input; not MediaPipe or webcam accuracy.",
              "Development used shuffled labels, but this is not a blinded study: the data were inspected beforehand."]:
        w(f"- {t}")
    return "\n".join(L) + "\n"


def main(records_path: str, out_dir: str, meta_extra: dict | None = None):
    rec = json.loads(Path(records_path).read_text(encoding="utf-8"))
    inclusion = json.loads((REPO / "research/protocols/phase4b_inclusion_v04.json").read_text(encoding="utf-8"))
    meta = {"labels": rec["labels"], "seed": rec["seed"], "inject": rec["inject"], **(meta_extra or {})}
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
