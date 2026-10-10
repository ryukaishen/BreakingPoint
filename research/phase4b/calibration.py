"""Phase 4B interval calibration: coverage, bias and error rates under shuffled labels (development only).

    python -I research/phase4b/calibration.py <null dir> <positive-control dir> <out dir>

Reads the outputs of calibration.ts. Two kinds of replicate:

- Jump measurement changes (J-D) and personal-baseline ranks (J-A): exact enumeration. Each participant's
  label-free splits are equally likely under random labelling, so a replicate draws one split per participant
  and the null target of every mean is the exact average over all splits.
- Population-baseline statistics (J-B) and REHAB24-6: replicates recomputed in calibration.ts. Targets are
  exact where the design makes them so (0 for J-B change; 10.5 for J-B rank; 0.5 for the fold-paired and
  population AUCs, by exchangeability within a fold or person), otherwise the replicate mean, which is then
  reported as the statistic's bias.

Every statistic is a summary over participants (people): one value per person per replicate. Interval methods
compared: percentile bootstrap (analysis v1), BCa bootstrap, Student t (means); percentile bootstrap and exact
order-statistic intervals (medians); Wilson (proportions). Resampling and t intervals treat the person as the
unit. Also: family-wise error of the Holm-corrected Wilcoxon tests (J-D primary), and power in the positive
controls.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from scipy.stats import binom, norm, t as tdist, wilcoxon

import os

FAST = os.environ.get("PHASE4B_CALIB_FAST") == "1"  # small sizes for debugging only; reported results never use it
B = 200 if FAST else 2000
R_ENUM = 200 if FAST else 4000
SEED = 20261010
INTERPRETED = ["jumpHeight", "countermovementDepth", "trunkLean", "landingKneeFlex", "rsiMod", "eccentricDuration"]
SCORES = ["S0", "S-P2", "S-P3", "S-P2P3", "S-valid"]
NOMINAL_LOW = 0.935  # acceptance rule (phase4b_deviations.md, entry 1)
REPORT_FLOOR = 0.85


# ------------------------------------------------------------------------------------------- interval methods
def boot_draws(X, stat, rng, chunk=50):
    """(R, B) bootstrap statistics, resampling people (columns) independently within each replicate (row)."""
    R, n = X.shape
    out = np.empty((R, B))
    for s in range(0, R, chunk):
        Xc = X[s:s + chunk]
        c = Xc.shape[0]
        idx = rng.integers(0, n, size=(c, B, n))
        res = Xc[np.arange(c)[:, None, None], idx]
        out[s:s + c] = res.mean(axis=2) if stat == "mean" else np.median(res, axis=2)
    return out


def percentile(boot):
    return np.percentile(boot, 2.5, axis=1), np.percentile(boot, 97.5, axis=1)


def bca_mean(X, boot):
    """BCa interval for the mean: bias correction from the bootstrap, acceleration from the jackknife."""
    R, n = X.shape
    theta = X.mean(axis=1)
    prop = (boot < theta[:, None]).mean(axis=1) + 0.5 * (boot == theta[:, None]).mean(axis=1)
    z0 = norm.ppf(np.clip(prop, 1e-6, 1 - 1e-6))
    jack = (theta[:, None] * n - X) / (n - 1)
    d = jack.mean(axis=1)[:, None] - jack
    den = 6 * (d ** 2).sum(axis=1) ** 1.5
    a = np.divide((d ** 3).sum(axis=1), den, out=np.zeros(R), where=den > 0)
    lo_hi = []
    for q in (0.025, 0.975):
        z = norm.ppf(q)
        p = norm.cdf(z0 + (z0 + z) / (1 - a * (z0 + z)))
        p = np.clip(np.nan_to_num(p, nan=q), 0.0, 1.0)
        lo_hi.append(np.array([np.percentile(boot[i], 100 * p[i]) for i in range(R)]))
    return lo_hi[0], lo_hi[1]


def t_interval(X):
    n = X.shape[1]
    m = X.mean(axis=1)
    se = X.std(axis=1, ddof=1) / math.sqrt(n)
    q = tdist.ppf(0.975, n - 1)
    return m - q * se, m + q * se


def order_stat_k(n):
    """Largest k with P(Bin(n, 0.5) <= k - 1) <= 0.025, and the exact coverage of (x_(k), x_(n-k+1))."""
    k = 1
    while binom.cdf(k, n, 0.5) <= 0.025:
        k += 1
    k = max(k, 1)
    return k, float(1 - 2 * binom.cdf(k - 1, n, 0.5))


def order_stat_median(X):
    n = X.shape[1]
    k, cov = order_stat_k(n)
    s = np.sort(X, axis=1)
    return s[:, k - 1], s[:, n - k], cov


def wilson(p, n):
    z = 1.959963984540054
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return c - h, c + h


def cover(lo, hi, target):
    c = (lo <= target) & (target <= hi)
    return {"coverage": float(c.mean()), "mc_se": float(math.sqrt(c.mean() * (1 - c.mean()) / len(c))),
            "median_width": float(np.median(hi - lo))}


def evaluate_mean(X, target, rng):
    boot = boot_draws(X, "mean", rng)
    res = {"n_people": X.shape[1], "replicates": X.shape[0], "target": float(target), "mean_of_estimates": float(X.mean()),
           "bias": float(X.mean(axis=1).mean() - target),
           "percentile_bootstrap": cover(*percentile(boot), target), "bca_bootstrap": cover(*bca_mean(X, boot), target),
           "student_t": cover(*t_interval(X), target)}
    return res


def evaluate_median(X, target, rng):
    boot = boot_draws(X, "median", rng)
    lo, hi, cov = order_stat_median(X)
    return {"n_people": X.shape[1], "replicates": X.shape[0], "target": float(target),
            "percentile_bootstrap": cover(*percentile(boot), target),
            "exact_order_statistic": {**cover(lo, hi, target), "exact_level": cov}}


def evaluate_share(X, target):
    p = X.mean(axis=1)
    return {"n_people": X.shape[1], "replicates": X.shape[0], "target": float(target), "wilson": cover(*wilson(p, X.shape[1]), target)}


# ------------------------------------------------------------------------------------------- loading
def load_blob(d: Path, name: str, index: dict):
    shape = next(b["shape"] for b in index["blobs"] if b["name"] == name)
    return np.fromfile(d / f"{name}.f32", dtype="<f4").reshape(shape).astype(float)


def enum_draws(people, field, key, rng, R=R_ENUM):
    """(R, n): one random label-free split per participant per replicate, and the exact target (mean over splits)."""
    vals = [np.asarray([np.nan if v is None else v for v in p[field][key]], float) for p in people]
    picks = [rng.integers(0, len(v), size=R) for v in vals]
    X = np.stack([v[k] for v, k in zip(vals, picks)], axis=1)
    target = float(np.mean([np.nanmean(v) for v in vals]))
    return X, target, vals


# ------------------------------------------------------------------------------------------- analyses
def calibrate(null_dir: Path, pos_dir: Path) -> dict:
    out = {"jump": {}, "rehab": {}, "tests": {}}
    for label, d in (("null", null_dir), ("positive_control", pos_dir)):
        rng = np.random.default_rng(SEED + (0 if label == "null" else 1))
        enum = json.loads((d / "jump_enumeration.json").read_text(encoding="utf-8"))
        parts = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(d.glob("index_*.json"))]
        index = {"population": [x for p in parts for x in p.get("population", [])],
                 "rehab": [x for p in parts for x in p.get("rehab", [])],
                 "blobs": [x for p in parts for x in p.get("blobs", [])]}
        injected = enum["inject"] or {}
        jd = {}
        for s in enum["samples"]:
            sk = f"{s['path']}/{s['sample']}"
            people = s["people"]
            block = {}
            for key in INTERPRETED + ["flightTime", "concentricDuration", "asymmetry"]:
                X, target, vals = enum_draws(people, "delta", key, rng)
                if np.isnan(X).any():
                    continue
                block[f"delta_mean/{key}"] = evaluate_mean(X, target, rng)
                if label == "null" or key in injected:  # median target: 0 under the null (symmetric), the shift when injected
                    block[f"delta_median/{key}"] = evaluate_median(X, injected.get(key, 0.0) if label != "null" else 0.0, rng)
                if s["three_plus_three"]:
                    Z, tz, _ = enum_draws(people, "dz", key, rng)
                    if not np.isnan(Z).any():
                        block[f"dz_mean/{key}"] = evaluate_mean(Z, tz, rng)  # v1: fresh spread
                    Z2, tz2, _ = enum_draws(people, "dz2", key, rng)
                    if not np.isnan(Z2).any():
                        block[f"dz2_mean/{key}"] = evaluate_mean(Z2, tz2, rng)  # v2: mean of fresh and post spreads
            if s["three_plus_three"]:
                for sc in SCORES:
                    Rk, tr, rvals = enum_draws(people, "rank", sc, rng)
                    if np.isnan(Rk).any():
                        continue
                    block[f"personal_rank_mean/{sc}"] = evaluate_mean(Rk, tr, rng)
                    if label == "null":
                        block[f"personal_rank_median/{sc}"] = evaluate_median(Rk, 10.5, rng)
                    share_target = float(np.mean([np.mean(v == 1) for v in rvals]))
                    block[f"personal_rank_share1/{sc}"] = evaluate_share((Rk == 1).astype(float), share_target)
                    Tm, tt, _ = enum_draws(people, "true_mean", sc, rng)
                    if not np.isnan(Tm).any():
                        block[f"personal_true_mean/{sc}"] = evaluate_mean(Tm, tt, rng)
            jd[sk] = block
        # Same participants: paired Path B minus Path A difference in Δz (same split for both paths: the same
        # trials, the same label-free order).
        a = {p["subject"]: p for s in enum["samples"] if s["path"] == "A" and s["sample"] == "same_participants" for p in s["people"]}
        b = {p["subject"]: p for s in enum["samples"] if s["path"] == "B" and s["sample"] == "same_participants" for p in s["people"]}
        both = sorted(set(a) & set(b))
        paired = {}
        for key in INTERPRETED:
            for field in ("dz", "dz2"):
                diffs = [np.asarray(b[sid][field][key], float) - np.asarray(a[sid][field][key], float) for sid in both]
                picks = [rng.integers(0, len(v), size=R_ENUM) for v in diffs]
                X = np.stack([v[k] for v, k in zip(diffs, picks)], axis=1)
                paired[f"paired_B_minus_A_{field}_mean/{key}"] = evaluate_mean(X, float(np.mean([v.mean() for v in diffs])), rng)
        jd["paired_same_participants"] = paired
        # Population baseline (J-B)
        jb = {}
        for pi in index["population"]:
            sk = f"{pi['path']}/{pi['sample']}"
            blk = {}
            for sc in SCORES:
                X = load_blob(d, f"pop_{pi['path']}_{pi['sample']}_{sc}_delta", index)
                if not np.isnan(X).any():
                    blk[f"pop_delta_mean/{sc}"] = evaluate_mean(X, 0.0 if label == "null" else float(X.mean()), rng)
                if pi["three_plus_three"]:
                    Rk = load_blob(d, f"pop_{pi['path']}_{pi['sample']}_{sc}_rank", index)
                    if not np.isnan(Rk).any():
                        blk[f"pop_rank_mean/{sc}"] = evaluate_mean(Rk, 10.5 if label == "null" else float(Rk.mean()), rng)
            jb[sk] = blk
        # REHAB24-6
        rh = {}
        for ri in index["rehab"]:
            blk = {"persons": ri["persons"], "n_correct": ri["n_correct"], "n_incorrect": ri["n_incorrect"]}
            for k, null_target in (("aucA", None), ("aucB", 0.5), ("aucPop", 0.5)):
                X = load_blob(d, f"rehab_{ri['set']}_{k}", index)
                tgt = null_target if (label == "null" and null_target is not None) else float(X.mean())
                blk[f"{k}_mean"] = evaluate_mean(X, tgt, rng)
                blk[f"{k}_mean"]["null_mean_minus_0.5"] = float(X.mean() - 0.5) if label == "null" else None
                if label == "null" and null_target is not None:
                    blk[f"{k}_median"] = evaluate_median(X, null_target, rng)
            for m in ri["measurements"]:
                # v1: (incorrect - correct) over the correct-rep spread; its null target is not 0, so the replicate
                # mean is used and reported as bias. v2: over the person's pooled spread (label-free): null target 0.
                X = load_blob(d, f"rehab_{ri['set']}_std_{m}", index)
                if not np.isnan(X).any():
                    blk[f"std_mean/{m}"] = evaluate_mean(X, float(X.mean()), rng)
                    blk[f"std_mean/{m}"]["null_mean"] = float(X.mean()) if label == "null" else None
                X2 = load_blob(d, f"rehab_{ri['set']}_std2_{m}", index)
                if not np.isnan(X2).any():
                    blk[f"std2_mean/{m}"] = evaluate_mean(X2, 0.0 if label == "null" else float(X2.mean()), rng)
                    blk[f"std2_median/{m}"] = evaluate_median(X2, float(np.median(X2)), rng)
            rh[ri["set"]] = blk
        out["jump"][label] = {"J-D_and_J-A": jd, "J-B": jb}
        out["rehab"][label] = rh
        # Holm-corrected Wilcoxon tests (primary family: Path B, primary sample, six interpreted measurements)
        prim = next(s for s in enum["samples"] if s["path"] == "B" and s["sample"] == "primary")
        draws = {k: enum_draws(prim["people"], "delta", k, rng, R=R_ENUM)[0] for k in INTERPRETED}
        rej_any = np.zeros(R_ENUM, bool)
        rej = {k: np.zeros(R_ENUM, bool) for k in INTERPRETED}
        for r in range(R_ENUM):
            ps = [wilcoxon(draws[k][r]).pvalue for k in INTERPRETED]
            order = np.argsort(ps)
            running = 0.0
            for j, i in enumerate(order):
                running = max(running, min(1.0, (len(ps) - j) * ps[i]))
                if running < 0.05:
                    rej[INTERPRETED[i]][r] = True
            rej_any[r] = any(rej[k][r] for k in INTERPRETED)
        out["tests"][label] = {"replicates": R_ENUM, "family_wise_rejection_rate": float(rej_any.mean()),
                               "per_measurement_rejection_rate": {k: float(v.mean()) for k, v in rej.items()},
                               "injected": injected}
    return out


def verdict(c: float) -> str:
    if c >= NOMINAL_LOW:
        return "95% CI"
    if c >= REPORT_FLOOR:
        return f"approximate ({100 * c:.0f}%)"
    return "not reported"


def tables(cal: dict) -> str:
    L = ["# Phase 4B interval calibration (generated)", "",
         "Generated by `research/phase4b/calibration.py` from shuffled-label replicates (no real labels). Coverage is the share "
         "of replicates whose interval contains the statistic's null target (positive control: the injected truth); Monte Carlo SE "
         "in brackets. Rule: '95% CI' needs >= 93.5% in both the null and the positive control.", ""]
    w = L.append
    meth = [("percentile_bootstrap", "Percentile bootstrap (v1)"), ("bca_bootstrap", "BCa bootstrap"), ("student_t", "Student t"),
            ("exact_order_statistic", "Exact order statistic"), ("wilson", "Wilson")]

    def row(name, nul, pos):
        cells = []
        for m, _ in meth:
            if m in nul:
                c = nul[m]["coverage"]
                p = (pos or {}).get(m, {}).get("coverage")
                lvl = f" (exact {100 * nul[m]['exact_level']:.1f}%)" if "exact_level" in nul[m] else ""
                cells.append(f"{100 * c:.1f}% [{100 * nul[m]['mc_se']:.1f}]{' / ' + format(100 * p, '.1f') + '%' if p is not None else ''}{lvl}")
            else:
                cells.append("")
        bias = f"{nul['bias']:+.4f}" if "bias" in nul else ""
        w(f"| {name} | {nul['n_people']} | {nul['target']:.4g} | {bias} | " + " | ".join(cells) + " |")

    w("Cells: null coverage [MC SE] / positive-control coverage.")
    w("")
    w("| Statistic | People | Null target | Bias | " + " | ".join(lbl for _, lbl in meth) + " |")
    w("|---|---|---|---|" + "---|" * len(meth))
    J0, J1 = cal["jump"]["null"]["J-D_and_J-A"], cal["jump"]["positive_control"]["J-D_and_J-A"]
    for sk, blk in J0.items():
        for name, nul in blk.items():
            row(f"jump {sk} {name}", nul, J1.get(sk, {}).get(name))
    B0, B1 = cal["jump"]["null"]["J-B"], cal["jump"]["positive_control"]["J-B"]
    for sk, blk in B0.items():
        for name, nul in blk.items():
            row(f"jump {sk} {name}", nul, B1.get(sk, {}).get(name))
    R0, R1 = cal["rehab"]["null"], cal["rehab"]["positive_control"]
    for sk, blk in R0.items():
        for name, nul in blk.items():
            if isinstance(nul, dict) and "n_people" in nul:
                row(f"rehab {sk} {name}", nul, R1.get(sk, {}).get(name))
    w("")
    w("## REHAB24-6 personal AUC construction under the null (target 0.5)")
    w("")
    for sk, blk in R0.items():
        w(f"- {sk}: v1 fold-averaged mean AUC {blk['aucA_mean']['mean_of_estimates']:.4f} (bias vs 0.5 {blk['aucA_mean']['null_mean_minus_0.5']:+.4f}); "
          f"v2 fold-paired {blk['aucB_mean']['mean_of_estimates']:.4f} ({blk['aucB_mean']['null_mean_minus_0.5']:+.4f}); "
          f"population {blk['aucPop_mean']['mean_of_estimates']:.4f} ({blk['aucPop_mean']['null_mean_minus_0.5']:+.4f}); persons {blk['persons']}, "
          f"incorrect reps per person {blk['n_incorrect']}")
    w("")
    w("## Holm-corrected Wilcoxon tests, Path B primary (6 measurements)")
    w("")
    for lab, x in cal["tests"].items():
        w(f"- {lab}: family-wise rejection rate {x['family_wise_rejection_rate']:.4f} over {x['replicates']} replicates; per measurement "
          + ", ".join(f"{k} {v:.3f}" for k, v in x["per_measurement_rejection_rate"].items())
          + (f" (injected: {x['injected']})" if x["injected"] else ""))
    return "\n".join(L) + "\n"


#: The interval method used for each kind of statistic in analysis v2 (fixed before the calibration was run).
METHOD_FOR = {"mean": "student_t", "median": "exact_order_statistic", "share1": "wilson"}


def kind_of(stat: str) -> str:
    if "_median" in stat:
        return "median"
    if "share1" in stat:
        return "share1"
    return "mean"


def verdicts(cal: dict) -> dict:
    """For every calibrated statistic: the v2 method, its null and positive-control coverage, and the label it may carry."""
    out = {}

    def add(scope, sample, stat, nul, pos):
        m = METHOD_FOR[kind_of(stat)]
        if m not in nul:
            return
        cn = nul[m]["coverage"]
        cp = (pos or {}).get(m, {}).get("coverage")
        worst = min(cn, cp) if cp is not None else cn
        if worst >= NOMINAL_LOW:
            label = "95% CI" if m != "exact_order_statistic" else f"{100 * nul[m]['exact_level']:.1f}% exact interval"
        elif worst >= REPORT_FLOOR:
            label = f"approximate interval (calibrated coverage {100 * worst:.0f}%)"
        else:
            label = "not reported (calibrated coverage below 85%)"
        out[f"{scope}|{sample}|{stat}"] = {"method": m, "null_coverage": cn, "null_mc_se": nul[m]["mc_se"],
                                           "positive_control_coverage": cp, "label": label}

    for lab_scope, part in (("jump", "J-D_and_J-A"), ("jump", "J-B")):
        n0, n1 = cal["jump"]["null"][part], cal["jump"]["positive_control"][part]
        for sample, blk in n0.items():
            for stat, nul in blk.items():
                add(lab_scope, sample, stat, nul, n1.get(sample, {}).get(stat))
    r0, r1 = cal["rehab"]["null"], cal["rehab"]["positive_control"]
    for sample, blk in r0.items():
        for stat, nul in blk.items():
            if isinstance(nul, dict) and "n_people" in nul:
                add("rehab", sample, stat, nul, r1.get(sample, {}).get(stat))
    return out


def main():
    null_dir, pos_dir, out = (Path(a) for a in sys.argv[1:4])
    cal = calibrate(null_dir, pos_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / "calibration.json").write_text(json.dumps(cal, indent=1), encoding="utf-8")
    (out / "calibration_tables.md").write_text(tables(cal), encoding="utf-8")
    v = {"rule": {"95% CI": f">= {NOMINAL_LOW} coverage in the null and the positive control", "approximate": f">= {REPORT_FLOOR}",
                  "not reported": f"< {REPORT_FLOOR}"}, "methods": METHOD_FOR, "fast_mode": FAST,
         "replicates": {"enumeration_draws": R_ENUM, "bootstrap": B}, "statistics": verdicts(cal)}
    (out / "calibration_verdicts.json").write_text(json.dumps(v, indent=1), encoding="utf-8")
    print(f"wrote {out}/calibration.json, calibration_tables.md and calibration_verdicts.json")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main()
