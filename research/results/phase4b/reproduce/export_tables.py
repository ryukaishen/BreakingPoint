"""Phase 4B result tables as CSV, copied from the frozen run's summary.json files.

Written after the single real-label run, for readability only. It computes no statistic: every number is
read from jump_fatigue/summary.json or rehab24_6/summary.json exactly as the frozen analysis (v2) wrote it.

    python -I -B research/results/phase4b/reproduce/export_tables.py
"""
import csv
import json
from pathlib import Path

RESULTS = Path(__file__).resolve().parents[1]
TABLES = RESULTS / "tables"
STAT_FIELDS = ["n", "mean", "mean_interval_lo", "mean_interval_hi", "mean_interval_label", "median", "median_interval_lo",
               "median_interval_hi", "median_interval_label", "q25", "q75", "min", "max", "share_above_zero"]


def flat(s: dict | None, prefix: str = "") -> dict:
    """One summary block as columns. Missing entries stay empty; nothing is derived."""
    s = s or {}
    row = {}
    for f in STAT_FIELDS:
        if f.endswith("_lo") or f.endswith("_hi"):
            iv = s.get(f.rsplit("_", 1)[0])
            v = None if not iv else iv[0 if f.endswith("_lo") else 1]
        else:
            v = s.get(f)
        row[prefix + f] = v
    return row


def write(name: str, rows: list) -> None:
    cols = []
    for r in rows:
        cols += [c for c in r if c not in cols]
    with (TABLES / name).open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    print(f"{name}: {len(rows)} rows")


def jump() -> None:
    s = json.loads((RESULTS / "jump_fatigue/summary.json").read_text(encoding="utf-8"))["jump_fatigue"]
    jd, ja, jb, jc, je, jf, pp = [], [], [], [], [], [], []
    for key, b in s["samples"].items():
        base = {"path": b["path"], "sample": b["sample"], "view": b["view"], "participants": b["participants"], "jumps": b["jumps"]}
        for m, x in b["J-D"].items():
            for stat in ("delta", "dz"):
                jd.append({**base, "measurement": m, "interpreted": x["interpreted"], "statistic": stat, **flat(x[stat]),
                           "wilcoxon_p": x.get("wilcoxon_p") if stat == "delta" else None,
                           "holm_p": x.get("holm_p") if stat == "delta" else None,
                           "rank_biserial": x.get("rank_biserial") if stat == "delta" else None})
            for pid, v in x["per_participant"].items():
                pp.append({**base, "participant": pid, "analysis": "J-D", "item": m, "delta": v.get("delta"), "dz": v.get("dz")})
        for sc, x in b["J-A"].items():
            r1 = x["rank_1"]
            ja.append({**base, "score": sc, **flat(x["rank"], "rank_"), "rank1_count": r1["count"], "rank1_of": r1["of"],
                       "rank1_share": r1["share"], "rank1_interval_lo": r1["interval"][0], "rank1_interval_hi": r1["interval"][1],
                       "rank1_interval_label": r1["interval_label"], **flat(x["true_split_mean_score"], "true_split_score_"),
                       **flat(x["true_minus_median_of_20"], "true_minus_median_of_20_")})
            for pid, v in x["per_participant"].items():
                pp.append({**base, "participant": pid, "analysis": "J-A", "item": sc, "rank": v.get("rank"), "true_mean": v.get("true_mean")})
        for sc, x in b["J-B"].items():
            jb.append({**base, "score": sc, **flat(x["delta_score"], "delta_score_"), **flat(x.get("rank"), "rank_"),
                       "share_rank_1": x.get("share_rank_1"), **flat(x.get("personal_minus_population_rank"), "personal_minus_population_rank_")})
            for pid, v in x["per_participant"].items():
                pp.append({**base, "participant": pid, "analysis": "J-B", "item": sc, "delta": v.get("delta"), "rank": v.get("rank")})
        if "J-C" in b:
            for m, x in b["J-C"].items():
                jc.append({**base, "measurement": m, **x})
        if "J-E" in b:
            for k, x in b["J-E"].items():
                je.append({**base, "comparison": k, **x})
        if "J-F" in b:
            for g, x in b["J-F"].items():
                for m, st in x["dz"].items():
                    jf.append({**base, "subgroup": g, "subgroup_participants": x["participants"], "item": f"{m} dz", **flat(st)})
                jf.append({**base, "subgroup": g, "subgroup_participants": x["participants"], "item": "S0 personal true-split rank",
                           **flat(x["S0_personal_rank"])})
    pr = s["paired_B_minus_A_same_participants"]
    paired = [{"participants": pr["participants"], "item": f"{m} dz, Path B minus Path A", **flat(x)} for m, x in pr["dz"].items()]
    paired.append({"participants": pr["participants"], "item": "S0 personal true-split rank, Path B minus Path A", **flat(pr["S0_personal_rank"])})
    write("jump_JD_change.csv", jd)
    write("jump_JD_paired_B_minus_A_same_participants.csv", paired)
    write("jump_JA_personal_baseline.csv", ja)
    write("jump_JB_population_baseline.csv", jb)
    write("jump_JC_order_probe.csv", jc)
    write("jump_JE_direction_checks.csv", je)
    write("jump_JF_between_person.csv", jf)
    write("jump_per_participant.csv", pp)


def rehab() -> None:
    r = json.loads((RESULTS / "rehab24_6/summary.json").read_text(encoding="utf-8"))["rehab24_6"]
    auc, per, sd = [], [], []
    for name, x in r.items():
        base = {"set": name, "key": x["key"], "persons": x["persons"], "reps_correct": x["reps_correct"], "reps_incorrect": x["reps_incorrect"]}
        for k, label in (("personal_auc", "personal baseline, fold-paired (v2)"), ("population_auc", "population baseline, leave one person out"),
                         ("personal_minus_population", "personal minus population, per person"),
                         ("personal_auc_v1_fold_averaged_superseded", "personal baseline, v1 fold-averaged (superseded, not interpreted)")):
            if k in x["R-1"]:
                auc.append({**base, "statistic": label, **flat(x["R-1"][k])})
        for pid, v in x["R-1"]["per_person"].items():
            per.append({**base, "person": pid, **v})
        for m, v in x["R-2"].items():
            sd.append({**base, "measurement": m, "status": v["status"], "interpreted": v["interpreted"], **flat(v["stddiff"])})
    write("rehab_R1_auc.csv", auc)
    write("rehab_R1_per_person.csv", per)
    write("rehab_R2_standardized_difference.csv", sd)


if __name__ == "__main__":
    TABLES.mkdir(exist_ok=True)
    jump()
    rehab()
