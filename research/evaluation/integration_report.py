"""Phase 4A: dataset integration report (processing coverage and checks, no evaluation results).

    python -I research/evaluation/integration_report.py

Reads the prepared data, the landmark indexes and the extracted features, re-checks what the
loaders assume, and writes:

  data/processed/qa/phase4a_summary.json       everything below in machine-readable form
  research/reports/phase4a_dataset_integration.md   the human-readable report

It reports which subjects, trials, reps and measurements were processed, and how the offline
measurements line up with the datasets' own laboratory measures. It does not score anyone
against a baseline, compare fresh with fatigued jumps or correct with incorrect reps, or
measure segmentation accuracy: those belong to Phase 4B, after its protocol is approved.
"""
from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from scipy.stats import spearmanr

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "research" / "adapters"))
import jump_fatigue as jf  # noqa: E402
import rehab24_6 as rh  # noqa: E402

P = REPO / "data" / "processed"
EXT = REPO / "data" / "external"
LANDMARKS, FEATURES = P / "landmarks", P / "features"
VIEWS = ["oblique35", "side"]


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def med(xs):
    xs = [x for x in xs if x is not None and np.isfinite(x)]
    return round(float(np.median(xs)), 3) if xs else None


def iqr(xs):
    xs = [x for x in xs if x is not None and np.isfinite(x)]
    return [round(float(np.percentile(xs, 25)), 3), round(float(np.percentile(xs, 75)), 3)] if xs else None


def rho(a, b):
    pairs = [(x, y) for x, y in zip(a, b) if x is not None and y is not None and np.isfinite(x) and np.isfinite(y)]
    if len(pairs) < 5:
        return None
    r = spearmanr([p[0] for p in pairs], [p[1] for p in pairs]).statistic
    return {"spearman_rho": round(float(r), 3), "n": len(pairs)}


def completeness(reps, keys):
    out = {}
    for k in keys:
        vals = [r["features"]["values"].get(k) for r in reps]
        out[k] = {"present": sum(v is not None for v in vals), "of": len(vals)}
    return out


def sources():
    out = {}
    for d in sorted(EXT.iterdir()):
        m = d / "SOURCE_MANIFEST.json"
        if m.exists():
            man = load(m)
            out[man["dataset"]] = {"doi": man["doi"], "files_verified": len(man["verified"]),
                                   "all_md5_match": all(v["published_md5"] == v["computed_md5"] for v in man["verified"].values()),
                                   "files_extracted": len(man["extracted"]), "prepared_at": man["prepared_at"]}
    return out


# ---------------------------------------------------------------- jump dataset
def marker_flight(t):
    """Take-off and touchdown times (s) from the feet: airborne while the lowest toe or heel marker is
    more than 3 cm above its standing height; the longest such run is the flight."""
    fs = t.sample_rate_hz
    foot = np.minimum.reduce([t.markers[m][:, 1] for m in ('LTOE', 'RTOE', 'LHEE', 'RHEE')])
    idx = np.where(foot > np.median(foot[: int(0.4 * fs)]) + 0.03)[0]
    if not len(idx):
        return None, None
    runs = np.split(idx, np.where(np.diff(idx) > 1)[0] + 1)
    run = max(runs, key=len)
    return run[0] / fs, (run[-1] + 1) / fs


def raw_touchdown(rid, view, t_takeoff):
    """When the unsmoothed ankle (as the app combines left and right) comes back within 1.5% of leg length."""
    rec = load(LANDMARKS / 'jump' / view / f'{rid}.json')
    fr = np.array(rec['frames']).reshape(len(rec['frames']), 33, 3)
    t = np.arange(len(fr)) / rec['fps']
    w = fr[0, :, 2]
    ank = (fr[:, 27, 1] * w[27] + fr[:, 28, 1] * w[28]) / (w[27] + w[28])
    leg = np.hypot((fr[0, 23, 0] - fr[0, 27, 0]) * rec['aspect'], fr[0, 23, 1] - fr[0, 27, 1])
    down = np.where((t >= t_takeoff) & ((ank[0] - ank) / leg < 0.015))[0]
    return float(t[down[0]]) if len(down) else None


def jump_section():
    subjects = jf.load_subjects()
    trials = jf.load_trials()
    flight = {t.recording_id: marker_flight(t) for t in trials}
    rates = Counter(round(t.sample_rate_hz, 3) for t in trials)
    by_sub = defaultdict(lambda: Counter())
    for t in trials:
        by_sub[t.subject][t.condition] += 1
    ic_diff = [t.contact_frame_kinematic - t.contact_frame_analog for t in trials
               if t.contact_frame_kinematic is not None and t.contact_frame_analog is not None]
    out = {
        "subjects": len(subjects),
        "groups": dict(Counter(s.group for s in subjects.values())),
        "group_coding_reconciled": True,  # load_subjects raises if the two files disagree
        "subject_flags": {k: v.flags for k, v in subjects.items() if v.flags},
        "trials_with_data": len(trials),
        "trials_by_condition": dict(Counter(t.condition for t in trials)),
        "subjects_by_trial_count": dict(Counter(f"{c['non_fatigued']}+{c['fatigued']}" for c in by_sub.values())),
        "sample_rates_hz": {str(k): v for k, v in rates.items()},
        "trial_duration_s": {"min": round(min(t.time[-1] - t.time[0] for t in trials), 2), "max": round(max(t.time[-1] - t.time[0] for t in trials), 2)},
        "contact_index_kinematic_minus_analog_frames": {"median": float(np.median(ic_diff)), "within_12": sum(abs(d) <= 12 for d in ic_diff),
                                                        "of": len(ic_diff), "outliers": [f"{t.recording_id}: {t.contact_frame_kinematic - t.contact_frame_analog} frames"
                                                                                        for t in trials if t.contact_frame_kinematic is not None and t.contact_frame_analog is not None
                                                                                        and abs(t.contact_frame_kinematic - t.contact_frame_analog) > 12]},
        "views": {},
        "trials_per_subject": {s: [by_sub[s]["non_fatigued"], by_sub[s]["fatigued"]] for s in sorted(subjects)},
        "group_of": {s: v.group for s, v in sorted(subjects.items())},
    }
    keys = [f["key"] for f in load(REPO / "shared" / "feature_catalog.json")["exercises"]["cmj"]["features"]]
    for view in VIEWS:
        idx = load(LANDMARKS / "jump" / view / "index.json")
        feats = {r["recording"]: r for r in load(FEATURES / "jump" / view / "features.json")["recordings"]}
        meta = {m["recording"]: m for m in idx["recordings"]}
        reps_per = Counter(len(f["reps"]) for f in feats.values())
        usable = {rid: f["reps"][0] for rid, f in feats.items() if len(f["reps"]) == 1}
        # Held frames (end of trimmed trials) must never feed a measurement: landing measures use
        # the 0.5 s after landing, so landing + 0.5 s must fall inside the real recording.
        held = [rid for rid, r in usable.items() if r["closedInHeldFrames"]]
        last_real = {rid: (meta[rid]["frames"] - 1) / 30.0 for rid in feats}
        unsafe = [rid for rid in held if usable[rid]["tLanding"] + 0.5 > last_real[rid] + 1e-9]
        per_subject = defaultdict(lambda: Counter())
        for rid in usable:
            per_subject[meta[rid]["subject"]][meta[rid]["condition"]] += 1
        sub_ids = sorted(subjects)
        complete = [s for s in sub_ids if per_subject[s]["non_fatigued"] == 3 and per_subject[s]["fatigued"] == 3]
        two_each = [s for s in sub_ids if per_subject[s]["non_fatigued"] >= 2 and per_subject[s]["fatigued"] >= 2]
        missing = sorted(rid for rid, f in feats.items() if not f["reps"])
        phase_patterns = Counter("flight never ended" if f["phaseLog"] and all(p != "landing" for _, p in f["phaseLog"][f["phaseLog"].index(next(x for x in f["phaseLog"] if x[1] == "flight")):]) else "landing reached, jump rejected (flight time outside 0.12 to 1.0 s)"
                                 for rid, f in feats.items() if not f["reps"] and any(p == "flight" for _, p in f["phaseLog"]))
        # Compatibility checks: the app's 2D measurements against the dataset's lab measures (same trials).
        reps_list = list(usable.items())
        lab = lambda rid: meta[rid]["lab_reference"]  # noqa: E731
        leg = {s: subjects[s].leg_length_m for s in subjects}
        raw_td = {rid: raw_touchdown(rid, view, r["tTakeoff"]) for rid, r in reps_list}
        checks = {
            "landing_time_minus_lab_contact_ms": {"median": med([(r["tLanding"] - lab(rid)["contact_time_s"]) * 1000 for rid, r in reps_list]),
                                                  "iqr": iqr([(r["tLanding"] - lab(rid)["contact_time_s"]) * 1000 for rid, r in reps_list])},
            "unsmoothed_ankle_touchdown_minus_lab_contact_ms": {"median": med([(raw_td[rid] - lab(rid)["contact_time_s"]) * 1000 for rid, _ in reps_list if raw_td[rid] is not None]),
                                                                "iqr": iqr([(raw_td[rid] - lab(rid)["contact_time_s"]) * 1000 for rid, _ in reps_list if raw_td[rid] is not None])},
            "flight_time_app_ms": {"median": med([r["features"]["values"]["flightTime"] * 1000 for _, r in reps_list]),
                                   "iqr": iqr([r["features"]["values"]["flightTime"] * 1000 for _, r in reps_list])},
            "flight_time_markers_ms": {"median": med([(flight[rid][1] - flight[rid][0]) * 1000 for rid, _ in reps_list if flight[rid][0] is not None]),
                                       "iqr": iqr([(flight[rid][1] - flight[rid][0]) * 1000 for rid, _ in reps_list if flight[rid][0] is not None])},
            "landing_knee_flexion_vs_opensim": {**(rho([r["features"]["values"]["landingKneeFlex"] for _, r in reps_list],
                                                       [max(lab(rid)["opensim_knee_flex_peak_landing_deg"]) for rid, _ in reps_list]) or {}),
                                                "median_app_minus_opensim_deg": med([r["features"]["values"]["landingKneeFlex"] - max(lab(rid)["opensim_knee_flex_peak_landing_deg"])
                                                                                     for rid, r in reps_list if r["features"]["values"]["landingKneeFlex"] is not None])},
            "jump_height_proxy_vs_com_rise": rho([r["features"]["values"]["jumpHeight"] for _, r in reps_list],
                                                 [(lab(rid)["com_peak_m"] - lab(rid)["com_standing_m"]) / leg[meta[rid]["subject"]]
                                                  if leg.get(meta[rid]["subject"]) else None for rid, _ in reps_list]),
        }
        out["views"][view] = {
            "primary": idx["primary"], "camera": idx["camera"],
            "trials": len(feats), "reps_found_per_trial": {str(k): v for k, v in sorted(reps_per.items())},
            "usable_trials": len(usable), "usable_by_condition": dict(Counter(meta[r]["condition"] for r in usable)),
            "trials_without_a_jump": missing,
            "why_no_jump": dict(phase_patterns),
            "closed_in_held_frames": len(held), "held_frames_used_by_a_measurement": unsafe,
            "subjects_with_3_plus_3": len(complete), "subjects_with_at_least_2_plus_2": len(two_each),
            "subjects_below_2_plus_2": [s for s in sub_ids if s not in two_each],
            "per_subject_usable": {s: [per_subject[s]["non_fatigued"], per_subject[s]["fatigued"]] for s in sub_ids},
            "feature_completeness": completeness(list(usable.values()), keys),
            "compatibility_checks": checks,
            "in_frame_share_min": round(min(m["in_frame_share"] for m in idx["recordings"]), 3),
        }
    return out


# ---------------------------------------------------------------- REHAB24-6
def rehab_section():
    reps = rh.load_reps()
    out = {
        "annotated_reps": len(reps), "videos": len({r.video for r in reps}), "persons": len({r.person for r in reps}),
        "reps_by_exercise": {f"{e}: {rh.EXERCISES[e]}": n for e, n in sorted(Counter(r.exercise for r in reps).items())},
        "exercises_used": {}, "views": {},
    }
    for ex, (movement, match) in rh.APP_MOVEMENT.items():
        xr = [r for r in reps if r.exercise == ex]
        min_dur = 0.6 if movement == "squat" else 0.8
        out["exercises_used"][f"ex{ex}_{movement}"] = {
            "exercise": rh.EXERCISES[ex], "match_to_app": match, "videos": len({r.video for r in xr}), "persons": sorted({r.person for r in xr}),
            "reps": len(xr), "correct": sum(r.correct for r in xr), "incorrect": sum(not r.correct for r in xr),
            "mocap_error_reps": sum(r.mocap_error for r in xr), "subtypes": dict(Counter(r.subtype or "-" for r in xr)),
            "reps_shorter_than_app_minimum": {"minimum_s": min_dur, "count": sum(r.duration_s < min_dur for r in xr)},
            "rep_duration_s": {"median": round(float(np.median([r.duration_s for r in xr])), 2), "min": round(min(r.duration_s for r in xr), 2), "max": round(max(r.duration_s for r in xr), 2)},
        }
        keys = [f["key"] for f in load(REPO / "shared" / "feature_catalog.json")["exercises"][movement]["features"]]
        for view in VIEWS:
            base = f"ex{ex}_{movement}"
            idx = load(LANDMARKS / "rehab" / base / view / "index.json")
            feats = {r["recording"]: r for r in load(FEATURES / "rehab" / base / view / "features.json")["recordings"]}
            detected = covered = 0
            outside = 0
            all_reps = []
            turns = []
            for m in idx["recordings"]:
                found = feats[m["recording"]]["reps"]
                detected += len(found)
                all_reps += found
                f = [b["facing_deg"] for b in m["blocks"]]
                turns += [abs(((b - a + 180) % 360) - 180) for a, b in zip(f, f[1:])]
                for a in m["reps"]:
                    if any(min(d["tEnd"], a["t_end"]) - max(d["tStart"], a["t_start"]) > 0 for d in found):
                        covered += 1
                for d in found:
                    if not any(min(d["tEnd"], a["t_end"]) - max(d["tStart"], a["t_start"]) > 0 for a in m["reps"]):
                        outside += 1
            # Compatibility: app knee range of motion (larger side) vs the skeleton's 3D peak knee flexion,
            # for detected reps that overlap exactly one annotated rep.
            app_knee, lab_knee = [], []
            for m in idx["recordings"]:
                for d in feats[m["recording"]]["reps"]:
                    hits = [a for a in m["reps"] if min(d["tEnd"], a["t_end"]) - max(d["tStart"], a["t_start"]) > 0]
                    v = d["features"]["values"]
                    if len(hits) == 1 and v.get("kneeRomL") is not None and v.get("kneeRomR") is not None:
                        app_knee.append(max(v["kneeRomL"], v["kneeRomR"]))
                        lab_knee.append(max(hits[0]["lab_reference"]["knee_flex_3d_peak_deg"]))
            out["views"][f"{base}/{view}"] = {
                "primary": idx["primary"], "videos": len(feats), "annotated_reps": sum(len(m["reps"]) for m in idx["recordings"]),
                "reps_detected": detected, "annotated_reps_overlapped_by_a_detected_rep": covered, "detected_reps_outside_annotations": outside,
                "turn_between_orientation_blocks_deg": [round(min(turns), 1), round(max(turns), 1)] if turns else None,
                "feature_completeness": completeness(all_reps, keys),
                "compatibility_checks": {"knee_rom_app_vs_skeleton_peak_flexion": rho(app_knee, lab_knee)},
                "why_annotated_reps_were_not_found": missed_rep_reasons(base, view, 0.15),
            }
    return out


def missed_rep_reasons(base, view, min_depth):
    """For annotated reps with no found rep: did the hip return near standing before the rep, and was it deep enough?"""
    idx = load(LANDMARKS / "rehab" / base / view / "index.json")
    feats = {x["recording"]: x for x in load(FEATURES / "rehab" / base / view / "features.json")["recordings"]}
    no_return = shallow = other = 0
    for m in idx["recordings"]:
        rec = load(LANDMARKS / "rehab" / base / view / f"{m['recording']}.json")
        fr = np.array(rec["frames"]).reshape(len(rec["frames"]), 33, 3)
        hip = (fr[:, 23, 1] + fr[:, 24, 1]) / 2
        leg = float(np.hypot((fr[0, 23, 0] - fr[0, 27, 0]) * rec["aspect"], fr[0, 23, 1] - fr[0, 27, 1]))
        for a in m["reps"]:
            if any(min(d["tEnd"], a["t_end"]) - max(d["tStart"], a["t_start"]) > 0 for d in feats[m["recording"]]["reps"]):
                continue
            i0, i1 = a["frames"][0], min(a["frames"][1], len(hip) - 1)
            if (hip[max(0, i0 - 3):i0 + 3].min() - hip[0]) / leg > 0.06:
                no_return += 1
            elif (hip[i0:i1 + 1].max() - hip[0]) / leg < min_depth:
                shallow += 1
            else:
                other += 1
    return {"no_return_near_standing_before_the_rep": no_return, "shallower_than_app_minimum": shallow, "other": other}


def fmt_completeness(c):
    return ", ".join(f"{k} {v['present']}/{v['of']}" for k, v in c.items())


def write_markdown(s):
    j, r = s["jump"], s["rehab"]
    jo, js = j["views"]["oblique35"], j["views"]["side"]
    L = []
    w = L.append
    w("# Phase 4A: dataset integration report")
    w("")
    w("Generated by `research/evaluation/integration_report.py`. This is a processing report: which data went in, what came out, and what had to be assumed. "
      "It contains **no evaluation results**. Nothing here compares fresh with fatigued jumps or correct with incorrect reps, scores anyone against a baseline, "
      "or measures how accurately reps are segmented; that is Phase 4B, once its protocol is approved.")
    w("")
    w("All measurements come from **motion-capture positions seen through a virtual camera**, run through the app's own code. "
      "They are an offline biomechanics check of BreakingPoint's measurement and segmentation code. They are not MediaPipe output and say nothing about how well "
      "MediaPipe tracks people in real webcam video.")
    w("")
    w("## 1. Source files")
    w("")
    w("| Dataset | DOI | Files checked against published MD5 | All match | Files extracted |")
    w("|---|---|---|---|---|")
    for name, v in s["sources"].items():
        w(f"| {name} | {v['doi']} | {v['files_verified']} | {'yes' if v['all_md5_match'] else '**no**'} | {v['files_extracted']} |")
    w("")
    w("## 2. Jump-landing dataset (countermovement jumps)")
    w("")
    w(f"- **Participants:** {j['subjects']} ({j['groups'].get('control', 0)} control, {j['groups'].get('ACL', 0)} after ACL reconstruction). sub05 is absent (excluded by the authors). "
      "The two spreadsheets code the group in opposite ways (labeling_CMJ.xlsx: 1 = control; participant_log.xlsx: 1 = ACL); after decoding, every participant's group agrees.")
    w(f"- **Trials with data:** {j['trials_with_data']} ({j['trials_by_condition'].get('non_fatigued', 0)} non-fatigued, {j['trials_by_condition'].get('fatigued', 0)} fatigued). "
      f"Participants by trial count (non-fatigued+fatigued): {', '.join(f'{k}: {v}' for k, v in sorted(j['subjects_by_trial_count'].items()))}.")
    for sid, flags in j["subject_flags"].items():
        w(f"  - {sid}: {'; '.join(flags)}. Its third trial in each condition is empty in CMJ.mat, so it has 2 + 2 trials.")
    w(f"- **Sampling rate:** {', '.join(f'{k} Hz ({v} trials)' for k, v in j['sample_rates_hz'].items())}. Trial length {j['trial_duration_s']['min']} to {j['trial_duration_s']['max']} s.")
    w("- **Units and axes (checked):** markers in mm with y up, x to the participant's left, z forward; centre of mass in m; OpenSim angles in degrees with knee flexion positive. Converted to metres for the pipeline.")
    ic = j["contact_index_kinematic_minus_analog_frames"]
    w(f"- **Contact indices:** IC_K and IC_A are 1-based MATLAB frame numbers; they agree within 12 frames (48 ms) in {ic['within_12']} of {ic['of']} trials"
      + (f"; outlier: {', '.join(ic['outliers'])}" if ic["outliers"] else "") + ". The analog index (force plate) is used as the lab contact time.")
    w("- **Trial boundaries:** every trial starts with the participant standing still (hip height steady within 4 mm), which the app's segmenter needs. Trials end 1.2 to 3 s after landing.")
    w("")
    w("### Processing through the app's code")
    w("")
    w("| | App-advised view (35° oblique) | Pure side view |")
    w("|---|---|---|")
    w(f"| Trials processed | {jo['trials']} | {js['trials']} |")
    w(f"| Jump found (exactly one per trial) | {jo['usable_trials']} | {js['usable_trials']} |")
    w(f"| No jump found | {len(jo['trials_without_a_jump'])} | {len(js['trials_without_a_jump'])} |")
    w(f"| Jump closed only in the held frames after the recording ended | {jo['closed_in_held_frames']} | {js['closed_in_held_frames']} |")
    w(f"| Held frames used by any measurement | {len(jo['held_frames_used_by_a_measurement'])} | {len(js['held_frames_used_by_a_measurement'])} |")
    w(f"| Participants with all 3 + 3 jumps found | {jo['subjects_with_3_plus_3']} | {js['subjects_with_3_plus_3']} |")
    w(f"| Participants with at least 2 + 2 | {jo['subjects_with_at_least_2_plus_2']} | {js['subjects_with_at_least_2_plus_2']} |")
    w("")
    w(f"Participants below 2 + 2 in the advised view: {', '.join(jo['subjects_below_2_plus_2']) or 'none'}.")
    w("")
    w("**Why some trials give no jump.** The recordings were trimmed soon after landing, often with the participant still crouched, and the app's jump segmenter only closes a jump once "
      "the athlete stands again or 1.6 s after landing. Each trial's last frame is therefore held for 1.7 s, which lets the segmenter close the jump through its own timeout; "
      "the jump measurements read nothing later than 0.5 s after landing, and the check above confirms no held frame entered a measurement. The remaining failures: "
      + "; ".join(f"{v} trials: {k}" for k, v in jo["why_no_jump"].items())
      + " (advised view). In these trials the true 3D ankle height had returned to standing. Two things in the app's touchdown rule (smoothed ankle back within 1.5% of leg length) "
        "combine: its smoothing already delays touchdown by about a third of a second (see the checks below), and these participants landed a few centimetres farther from the camera "
        "than they took off (median about 3 cm, versus about 0 cm where touchdown was found). From a camera at hip height, a foot that lands farther away appears higher in the image, "
        "so the smoothed ankle stays just above the threshold: the detected flight passes the 1.0 s limit, or touchdown is never seen. This is the app's 2D jump segmentation "
        "reproduced faithfully, not a pipeline error. It is recorded for Phase 4B and for future app work; the app was not changed.")
    w("")
    w("**Measurement completeness** (jumps found, advised view): " + fmt_completeness(jo["feature_completeness"]) + ".")
    w("")
    w("**Compatibility checks** (same trials; the app's 2D measurement from the virtual camera against the dataset's own lab measures). These show the offline pipeline measures "
      "what it should; they are not accuracy figures for BreakingPoint or MediaPipe.")
    w("")
    w("| Check | Advised view | Side view |")
    w("|---|---|---|")
    co, cs = jo["compatibility_checks"], js["compatibility_checks"]
    mi = lambda d: f"{d['median']:.0f} ({d['iqr'][0]:.0f} to {d['iqr'][1]:.0f})"  # noqa: E731
    w(f"| Touchdown detected by the app minus force-plate contact, ms: median (IQR) | {mi(co['landing_time_minus_lab_contact_ms'])} | {mi(cs['landing_time_minus_lab_contact_ms'])} |")
    w(f"| Same rule on the unsmoothed ankle, ms: median (IQR) | {mi(co['unsmoothed_ankle_touchdown_minus_lab_contact_ms'])} | {mi(cs['unsmoothed_ankle_touchdown_minus_lab_contact_ms'])} |")
    w(f"| Flight time, app measure, ms: median (IQR) | {mi(co['flight_time_app_ms'])} | {mi(cs['flight_time_app_ms'])} |")
    w(f"| Flight time from the foot markers, ms: median (IQR) | {mi(co['flight_time_markers_ms'])} | {mi(cs['flight_time_markers_ms'])} |")
    w(f"| Landing knee flexion: app (2D) vs OpenSim (3D), Spearman ρ (n) | {co['landing_knee_flexion_vs_opensim'].get('spearman_rho')} ({co['landing_knee_flexion_vs_opensim'].get('n')}) | {cs['landing_knee_flexion_vs_opensim'].get('spearman_rho')} ({cs['landing_knee_flexion_vs_opensim'].get('n')}) |")
    w(f"| Landing knee flexion: median app minus OpenSim, degrees | {co['landing_knee_flexion_vs_opensim'].get('median_app_minus_opensim_deg'):.1f} | {cs['landing_knee_flexion_vs_opensim'].get('median_app_minus_opensim_deg'):.1f} |")
    jh_o, jh_s = co["jump_height_proxy_vs_com_rise"] or {}, cs["jump_height_proxy_vs_com_rise"] or {}
    w(f"| Jump-height proxy (hip rise / leg) vs centre-of-mass rise / leg length, Spearman ρ (n) | {jh_o.get('spearman_rho')} ({jh_o.get('n')}) | {jh_s.get('spearman_rho')} ({jh_s.get('n')}) |")
    w("")
    w("**What the checks show.** The app's own smoothing (a One Euro filter, minimum cutoff 1.2 Hz) delays its touchdown decision by about a third of a second: "
      f"the same touchdown rule on the unsmoothed ankle fires about {co['unsmoothed_ankle_touchdown_minus_lab_contact_ms']['median']:.0f} ms after force-plate contact (the heel settling and the 30 fps frame step), "
      f"the smoothed one about {co['landing_time_minus_lab_contact_ms']['median']:.0f} ms. As a result the app's *flight time* (about {co['flight_time_app_ms']['median']:.0f} ms) is not the true flight time "
      f"(about {co['flight_time_markers_ms']['median']:.0f} ms from the foot markers), and *landing knee flexion* is read from a window that starts after the deepest part of the landing, "
      "which is why it reads lower than OpenSim's landing peak. Both still change consistently with the true quantities, which is what comparing an athlete with their own baseline needs, "
      "but their names overstate what they measure. This is the app's code behaving as written on clean data; it is reported here and the app was not changed.")
    w("")
    w("## 3. REHAB24-6")
    w("")
    w(f"- **Annotations:** {r['annotated_reps']} reps in {r['videos']} videos from {r['persons']} people. By exercise: "
      + "; ".join(f"{k} ({v})" for k, v in r["reps_by_exercise"].items()) + ".")
    w("- **Units (checked):** metres, y up (thigh and shank about 0.45 m). The dataset page says \"virtual centimetres\"; the data are in metres. "
      "Frames are 30 fps; annotation frame numbers are treated as 1-based (one annotation ends exactly at the array length).")
    w("- **Exercises used:** only the two with a BreakingPoint movement. Exercises 1 to 4 (arm abduction, arm VW, push-ups, leg abduction) have none and are not processed.")
    w("")
    w("| | Squats (exercise 6) | Lunges (exercise 5) |")
    w("|---|---|---|")
    e6, e5 = r["exercises_used"]["ex6_squat"], r["exercises_used"]["ex5_lunge"]
    w(f"| Match to the app | {e6['match_to_app']} | {e5['match_to_app']} |")
    w(f"| Videos, people | {e6['videos']}, {len(e6['persons'])} | {e5['videos']}, {len(e5['persons'])} |")
    w(f"| Annotated reps (correct / incorrect) | {e6['reps']} ({e6['correct']} / {e6['incorrect']}) | {e5['reps']} ({e5['correct']} / {e5['incorrect']}) |")
    w(f"| Reps flagged with motion-capture errors | {e6['mocap_error_reps']} | {e5['mocap_error_reps']} |")
    w(f"| Rep duration, median (range), s | {e6['rep_duration_s']['median']} ({e6['rep_duration_s']['min']} to {e6['rep_duration_s']['max']}) | {e5['rep_duration_s']['median']} ({e5['rep_duration_s']['min']} to {e5['rep_duration_s']['max']}) |")
    w(f"| Reps shorter than the app's minimum rep time | {e6['reps_shorter_than_app_minimum']['count']} (minimum {e6['reps_shorter_than_app_minimum']['minimum_s']} s) | {e5['reps_shorter_than_app_minimum']['count']} (minimum {e5['reps_shorter_than_app_minimum']['minimum_s']} s) |")
    w("")
    w("Processing through the app's code:")
    w("")
    w("| | Squats, 35° oblique (advised) | Squats, side | Lunges, side (advised) | Lunges, 35° oblique |")
    w("|---|---|---|---|---|")
    cols = [r["views"][k] for k in ("ex6_squat/oblique35", "ex6_squat/side", "ex5_lunge/side", "ex5_lunge/oblique35")]
    w("| Annotated reps | " + " | ".join(str(c['annotated_reps']) for c in cols) + " |")
    w("| Reps the app's segmenter found | " + " | ".join(str(c['reps_detected']) for c in cols) + " |")
    w("| Annotated reps with a found rep overlapping them | " + " | ".join(str(c['annotated_reps_overlapped_by_a_detected_rep']) for c in cols) + " |")
    w("| Annotated reps with no found rep | " + " | ".join(str(c['annotated_reps'] - c['annotated_reps_overlapped_by_a_detected_rep']) for c in cols) + " |")
    w("| Found reps outside every annotation | " + " | ".join(str(c['detected_reps_outside_annotations']) for c in cols) + " |")
    w("")
    lw = r["views"]["ex5_lunge/side"]["why_annotated_reps_were_not_found"]
    w(f"**Lunges without a found rep (advised view).** {lw['no_return_near_standing_before_the_rep']} start without the hip first coming back near its standing height "
      "(in this split squat the top position stays below upright standing, and the app's lunge segmenter needs that return to separate reps); "
      f"{lw['shallower_than_app_minimum']} drop less than the app's minimum depth (15% of leg length); {lw['other']} other.")
    w("")
    w("These counts say which annotated reps have app measurements available. They are not a segmentation evaluation: matching rules, boundary errors and results by "
      "correctness are defined in the Phase 4B protocol.")
    w("")
    turns = r["views"]["ex6_squat/oblique35"]["turn_between_orientation_blocks_deg"]
    w(f"**Orientation.** In 35 of the 65 videos people turn partway through (for example ten reps facing camera 17, then ten half-profile). The 3D data show turns of {turns[0]} to {turns[1]} degrees "
      "between these blocks. The virtual camera is re-aimed for each block, so every rep is filmed from the view the app advises, as if the athlete kept facing the same way.")
    w("")
    for key, label in [("ex6_squat", "Squats"), ("ex5_lunge", "Lunges")]:
        v = r["views"][f"{key}/oblique35" if key == "ex6_squat" else f"{key}/side"]
        c = v["compatibility_checks"]["knee_rom_app_vs_skeleton_peak_flexion"] or {}
        w(f"**{label}, advised view.** Measurement completeness: {fmt_completeness(v['feature_completeness'])}. "
          f"Compatibility check, app knee range of motion vs the skeleton's 3D peak knee flexion: Spearman ρ {c.get('spearman_rho')} (n {c.get('n')}).")
        w("")
    w("## 4. Assumptions the pipeline makes")
    w("")
    for a in s["assumptions"]:
        w(f"- {a}")
    w("")
    w("## 5. What cannot be reconstructed faithfully")
    w("")
    for a in s["unsupported"]:
        w(f"- {a}")
    w("")
    w("## Appendix A. Jumps found per participant (non-fatigued + fatigued)")
    w("")
    w("| Participant | Group | Trials with data | Found, advised view | Found, side view |")
    w("|---|---|---|---|---|")
    for sid, (nf, f) in jo["per_subject_usable"].items():
        have = j["trials_per_subject"][sid]
        sv = js["per_subject_usable"][sid]
        w(f"| {sid} | {j['group_of'][sid]} | {have[0]} + {have[1]} | {nf} + {f} | {sv[0]} + {sv[1]} |")
    w("")
    w("## Appendix B. Trials with no jump found")
    w("")
    w("Advised view: " + ", ".join(jo["trials_without_a_jump"]) + ".")
    w("")
    w("Side view: " + ", ".join(js["trials_without_a_jump"]) + ".")
    w("")
    return "\n".join(L) + "\n"


ASSUMPTIONS = [
    "Landmark mapping (research/adapters/landmarks.py): jump dataset hip = greater-trochanter marker, knee and ankle = midpoints of the medial and lateral markers, shoulder = acromion marker; REHAB24-6 uses the skeleton's joint centres. MediaPipe's landmarks are learned image keypoints and sit somewhat differently.",
    "Virtual webcam: pinhole camera, 1280 x 720, 65 degree horizontal field of view, at the participant's standing hip height, 3.5 m away for jumps (head stays in frame in flight) and 3.0 m for squats and lunges. Views follow the app's setup advice: 35 degrees oblique for squats and jumps, pure side for lunges; the other view is processed as a sensitivity check.",
    "Visibility is synthetic: 1.0 for the side facing the camera and 0.9 for the far side, so the app's \"more visible side\" logic picks the near side, as it would with MediaPipe. No landmark ever drops out.",
    "Jump trials are resampled from 250 Hz to the app's 30 fps by linear interpolation; REHAB24-6 already provides 30 fps joints. Time starts at 0 at the first frame.",
    "Each jump trial is a separate recording with its own standing reference. Its last frame is held for 1.7 s so the jump can close; no measurement reads the held frames (checked).",
    "REHAB24-6 annotation frame numbers are 1-based; the virtual camera is re-aimed per orientation block (see section 3).",
    "Participants and trials are identified by the datasets' own IDs (sub01 to sub44; PM_xxx videos and person IDs). Group, sex, leg dominance and fatigued leg come from the datasets' spreadsheets.",
]

UNSUPPORTED = [
    "MediaPipe tracking behaviour: detection noise, jitter, occlusion of the far limb, depth ambiguity and lost frames. Results from this pipeline are a best case for the measurement code and say nothing about webcam accuracy; that needs real recorded video run through MediaPipe.",
    "Capture-quality handling: with synthetic visibility every rep is fully scored, so the app's low-confidence and unscored-rep paths are never exercised.",
    "The app's full calibration and alert sequence on the jump data: 3 fresh jumps per person (2 for sub44) is below the app's 4-rep calibration minimum, and each trial is a single jump recorded separately rather than a continuous set.",
    "Left/right comparisons from a side or oblique view: the far leg is perfectly visible here but often hidden from a real camera, so asymmetry measures are likely more informative here than they would be live.",
    "REHAB24-6 lunges: the exercise is an in-place split squat, not the app's forward lunge. Step length and the push back to standing do not mean the same thing, and some reps are shorter than the app's minimum lunge time.",
    "REHAB24-6 heel positions (the skeleton has none); the app does not use heels in any measurement.",
    "OpenSim joint angles are 3D anatomical angles and are not the same quantity as the app's 2D angles; they serve only as a reference that the measurements move together.",
    "Exact fatigue onset within a trial or a set: the jump dataset labels whole trials as non-fatigued or fatigued, and REHAB24-6 has no fatigue labels at all.",
]


def main():
    summary = {"sources": sources(), "jump": jump_section(), "rehab": rehab_section(), "assumptions": ASSUMPTIONS, "unsupported": UNSUPPORTED}
    qa = P / "qa"
    qa.mkdir(parents=True, exist_ok=True)
    (qa / "phase4a_summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    report = REPO / "research" / "reports" / "phase4a_dataset_integration.md"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(write_markdown(summary), encoding="utf-8")
    print(f"wrote {report.relative_to(REPO)} and {(qa / 'phase4a_summary.json').relative_to(REPO)}")


if __name__ == "__main__":
    main()
