"""Phase 4B inclusion and exclusion lists, fixed before any outcome is computed.

    python -I research/measurement/inclusion.py

Writes research/protocols/phase4b_inclusion_v04.json. It reads only:
  - identifiers, condition labels, group and sex (dataset metadata),
  - data-quality flags (lab reference available, trial starts upright),
  - whether each measurement path found a rep (Phase 4A.5 runs, advised and side views),
  - REHAB24-6 annotations (correctness, motion-capture error flag) and rep linking.
It reads no measurement value and no score, and computes no comparison between conditions or between
correct and incorrect reps. Every input file's SHA-256 is recorded in the output.
"""
from __future__ import annotations

import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
P = REPO / "data" / "processed"
M = P / "measurement"
OUT = REPO / "research" / "protocols" / "phase4b_inclusion_v04.json"

PATHS = {
    "A": {"label": "Path A: unchanged production pipeline", "variant": "production"},
    "B": {"label": "Path B: experimental timing pipeline (P1: 6 Hz Butterworth timing, One Euro angles; research only)",
          "variant": "dual_butter6"},
}
VIEWS = {"advised": "az35_d3.5", "side": "az0_d3.5"}
INSIDE_MIN = 0.5  # a found rep is linked to an annotated rep when at least half of it lies inside


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path: Path, used: dict):
    used[str(path.relative_to(REPO)).replace("\\", "/")] = sha(path)
    return json.loads(path.read_text(encoding="utf-8"))


def jump(used: dict) -> dict:
    refs = {r["recording"]: r for r in load(M / "references" / "jump.json", used)["trials"]}
    part = load(M / "references" / "participants.json", used)
    trial_excl = {}
    for rid, r in sorted(refs.items()):
        if not r.get("reference_ok"):
            trial_excl[rid] = "no usable lab reference"
        elif not r.get("starts_upright"):
            trial_excl[rid] = f"starts crouched (starting hip height {r['start_hip_ratio']} of the person's highest; threshold 0.95)"
    out = {"trials_with_data": len(refs), "participants": len(part),
           "data_quality_exclusions": trial_excl, "paths": {}}
    for key, p in PATHS.items():
        blk = {"label": p["label"], "variant": p["variant"], "views": {}}
        for view, stream in VIEWS.items():
            runs = {r["recording"]: r for r in load(M / "runs" / "jump" / stream / f"{p['variant']}__s0__seed0.json", used)["recordings"]}
            found = {rid: len(runs[rid]["reps"]) == 1 for rid in refs}
            usable = {rid: found[rid] and rid not in trial_excl for rid in refs}
            not_found = sorted(rid for rid in refs if rid not in trial_excl and not found[rid])
            per = defaultdict(lambda: {"non_fatigued": [], "fatigued": []})
            for rid, ok in usable.items():
                if ok:
                    per[refs[rid]["subject"]][refs[rid]["condition"]].append(rid)
            subjects = sorted(part)

            def sample(nf, f):
                return [s for s in subjects if len(per[s]["non_fatigued"]) >= nf and len(per[s]["fatigued"]) >= f]

            def describe(ids):
                return {"n": len(ids), "by_group": dict(Counter(part[s]["group"] for s in ids)),
                        "by_sex": dict(Counter(part[s]["sex"] for s in ids)), "participants": ids}

            missing = defaultdict(lambda: [0, 0])
            for rid in refs:
                if rid in trial_excl:
                    continue
                k = f"{part[refs[rid]['subject']]['group']}/{refs[rid]['condition']}"
                missing[k][0] += not found[rid]
                missing[k][1] += 1
            blk["views"][view] = {
                "stream": stream,
                "trials_usable": sum(usable.values()),
                "trials_not_found": not_found,
                "not_found_by_group_condition": {k: {"missing": v[0], "of": v[1]} for k, v in sorted(missing.items())},
                "samples": {
                    "primary_3_plus_3": describe(sample(3, 3)),
                    "at_least_2_plus_2": describe(sample(2, 2)),
                    "at_least_1_plus_1_person_means": describe(sample(1, 1)),
                },
                "usable_trials_by_participant": {s: {c: per[s][c] for c in ("non_fatigued", "fatigued")} for s in subjects},
            }
        out["paths"][key] = blk
    a = set(out["paths"]["A"]["views"]["advised"]["samples"]["primary_3_plus_3"]["participants"])
    b = set(out["paths"]["B"]["views"]["advised"]["samples"]["primary_3_plus_3"]["participants"])
    out["path_b_on_path_a_sample"] = {"n": len(a & b), "participants": sorted(a & b),
                                      "note": "like-for-like comparison of the two paths on the same participants"}
    out["only_in_path_b_primary"] = sorted(b - a)
    out["only_in_path_a_primary"] = sorted(a - b)
    return out


def rehab(used: dict) -> dict:
    out = {}
    for ex, view, role in (("ex6_squat", "oblique35", "primary"), ("ex6_squat", "side", "sensitivity view"),
                           ("ex5_lunge", "side", "secondary, descriptive only")):
        idx = load(P / "landmarks" / "rehab" / ex / view / "index.json", used)
        runs = {r["recording"]: r for r in load(M / "runs" / "rehab" / ex / view / "production__s0__seed0.json", used)["recordings"]}
        excluded, unlinked = [], []
        per = defaultdict(lambda: {"correct": 0, "incorrect": 0, "linked_correct": 0, "linked_incorrect": 0})
        for m in idx["recordings"]:
            dets = runs[m["recording"]]["reps"]
            # Greedy one-to-one linking by the share of the found rep inside the annotated rep.
            pairs = sorted(((max(0.0, min(d["tEnd"], a["t_end"]) - max(d["tStart"], a["t_start"])) / max(1e-9, d["tEnd"] - d["tStart"]), i, j)
                            for i, d in enumerate(dets) for j, a in enumerate(m["reps"])), reverse=True)
            used_d, linked = set(), set()
            for s, i, j in pairs:
                if s < INSIDE_MIN:
                    break
                if i in used_d or j in linked:
                    continue
                used_d.add(i)
                linked.add(j)
            for j, a in enumerate(m["reps"]):
                rid = f"{m['recording']}#{a['number']}"
                if a["mocap_error"]:
                    excluded.append({"rep": rid, "person": m["person"], "correct": a["correct"], "reason": "flagged as a motion-capture error in the dataset"})
                    continue
                c = "correct" if a["correct"] else "incorrect"
                per[m["person"]][c] += 1
                if j in linked:
                    per[m["person"]][f"linked_{c}"] += 1
                else:
                    unlinked.append({"rep": rid, "person": m["person"], "correct": a["correct"]})
        eligible = {p: v["linked_correct"] >= 4 and v["linked_incorrect"] >= 1 for p, v in per.items()}
        out[f"{ex}/{view}"] = {
            "role": role, "annotated_reps": sum(len(m["reps"]) for m in idx["recordings"]),
            "excluded_reps": excluded, "reps_without_a_linked_found_rep": unlinked,
            "per_person": {str(p): v for p, v in sorted(per.items())},
            "eligible_for_personal_baseline": {
                "rule": "at least 4 linked correct reps (3 or more remain after holding one out) and at least 1 linked incorrect rep",
                "persons": sorted(str(p) for p, ok in eligible.items() if ok),
                "not_eligible": sorted(str(p) for p, ok in eligible.items() if not ok),
                "fewer_than_3_incorrect_reps": sorted(str(p) for p, v in per.items() if v["linked_incorrect"] < 3)},
        }
    return out


def main() -> None:
    used: dict = {}
    data = {"generated_by": "research/measurement/inclusion.py", "reads_no_outcomes": True,
            "jump_fatigue": jump(used), "rehab24_6": rehab(used)}
    data["inputs_sha256"] = used
    data["code_sha256"] = {"research/measurement/inclusion.py": sha(Path(__file__))}
    OUT.write_text(json.dumps(data, indent=1), encoding="utf-8")
    j = data["jump_fatigue"]["paths"]
    for k in ("A", "B"):
        s = j[k]["views"]["advised"]["samples"]
        print(f"jump {k}: 3+3 {s['primary_3_plus_3']['n']}, 2+2 {s['at_least_2_plus_2']['n']}, 1+1 {s['at_least_1_plus_1_person_means']['n']}")
    print("path B on path A sample:", data["jump_fatigue"]["path_b_on_path_a_sample"]["n"])
    for k, v in data["rehab24_6"].items():
        print(k, "excluded", len(v["excluded_reps"]), "unlinked", len(v["reps_without_a_linked_found_rep"]), "eligible", v["eligible_for_personal_baseline"]["persons"],
              "few incorrect", v["eligible_for_personal_baseline"]["fewer_than_3_incorrect_reps"])
    print(f"wrote {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
