"""Build app-ready landmark streams from the prepared datasets.

    python -I research/adapters/build_landmarks.py [--dataset jump|rehab|all]

For every recording (one jump trial, or one REHAB24-6 video) this writes
data/processed/landmarks/<dataset>/<view>/<recording>.json with 30 fps frames of 33
MediaPipe-style landmarks [x, y, visibility] as BreakingPoint's app would receive them from a
webcam placed as the app advises, plus an index.json describing every recording. Views:

  jump  (countermovement jump): "oblique35" (app advice: side-on, 30 to 45 degrees; 3.5 m so the
                                 head stays in frame during flight) and "side" (0 degrees)
  rehab squat (Exercise 6):      "oblique35" (app advice for squats; 3.0 m) and "side"
  rehab lunge (Exercise 5):      "side" (app advice for lunges: side-on, about 90 degrees) and "oblique35"

These are motion-capture positions seen by a virtual camera, not MediaPipe output.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import jump_fatigue as jf  # noqa: E402
import landmarks as lm  # noqa: E402
import rehab24_6 as rh  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "data" / "processed" / "landmarks"
APP_FPS = 30.0

VIEWS = {
    "jump": {"oblique35": lm.Camera(azimuth_deg=35, distance_m=3.5), "side": lm.Camera(azimuth_deg=0, distance_m=3.5)},
    "squat": {"oblique35": lm.Camera(azimuth_deg=35, distance_m=3.0), "side": lm.Camera(azimuth_deg=0, distance_m=3.0)},
    "lunge": {"side": lm.Camera(azimuth_deg=0, distance_m=3.0), "oblique35": lm.Camera(azimuth_deg=35, distance_m=3.0)},
}
#: The view the app's setup advice describes, per movement.
PRIMARY_VIEW = {"jump": "oblique35", "squat": "oblique35", "lunge": "side"}


def angle3(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> np.ndarray:
    """Flexion angle at b in 3D (degrees; 0 = straight), per frame."""
    v1, v2 = a - b, c - b
    cos = np.sum(v1 * v2, axis=1) / (np.linalg.norm(v1, axis=1) * np.linalg.norm(v2, axis=1))
    return 180.0 - np.degrees(np.arccos(np.clip(cos, -1, 1)))


def write_recording(path: Path, rec: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rec, separators=(",", ":")), encoding="utf-8")


def build_jump() -> None:
    subjects = jf.load_subjects()
    trials = jf.load_trials()
    knee_r, knee_l = jf.ik_column("knee_angle_r"), jf.ik_column("knee_angle_l")
    hip_r, hip_l = jf.ik_column("hip_flexion_r"), jf.ik_column("hip_flexion_l")
    for view, cam in VIEWS["jump"].items():
        index = []
        for tr in trials:
            pos_250, have = lm.mapped_positions(tr.markers, lm.JUMP_MARKER_MAP)
            lm.check_mapping_complete(have)
            t30, pos = lm.resample(tr.time - tr.time[0], pos_250, APP_FPS)
            standing = slice(0, int(round(0.4 * APP_FPS)))  # every trial starts with a still stand
            poses, cam_info = lm.project(pos, have, cam, axes_frames=standing)
            # Lab references (not used by the app): OpenSim angles and the centre of mass.
            ja = tr.joint_angles
            ic = tr.contact_frame_analog if tr.contact_frame_analog is not None else tr.contact_frame_kinematic
            com_y = tr.com_position[:, 1]
            before = slice(0, ic) if ic else slice(None)
            after = slice(ic, min(len(ja), ic + int(0.5 * tr.sample_rate_hz))) if ic else slice(0, 0)
            ref = {
                "contact_time_s": float(tr.time[ic] - tr.time[0]) if ic is not None and ic < len(tr.time) else None,
                "com_standing_m": float(np.median(com_y[: int(0.4 * tr.sample_rate_hz)])),
                "com_peak_m": float(np.max(com_y[before])) if ic else None,
                "opensim_knee_flex_peak_before_contact_deg": [float(np.max(ja[before, knee_l])), float(np.max(ja[before, knee_r]))],
                "opensim_knee_flex_peak_landing_deg": [float(np.max(ja[after, knee_l])), float(np.max(ja[after, knee_r]))] if ic else None,
                "opensim_hip_flex_peak_before_contact_deg": [float(np.max(ja[before, hip_l])), float(np.max(ja[before, hip_r]))],
            }
            rec_id = tr.recording_id
            s = subjects[tr.subject]
            meta = {"recording": rec_id, "subject": tr.subject, "condition": tr.condition, "trial": tr.trial, "label": tr.label,
                    "group": s.group, "sex": s.sex, "fatigued_leg": s.fatigued_leg, "leg_dominance": s.leg_dominance,
                    "source_rate_hz": round(tr.sample_rate_hz, 3), "source_frames": int(tr.time.size), "duration_s": round(float(tr.time[-1] - tr.time[0]), 3),
                    "frames": int(poses.shape[0]), "camera": cam_info, **lm.frame_quality(poses), "lab_reference": ref}
            write_recording(OUT / "jump" / view / f"{rec_id}.json",
                            {"dataset": "jump_fatigue", "exercise": "cmj", "view": view, "recording": rec_id, "fps": APP_FPS,
                             "aspect": cam.aspect, "frames": lm.flatten_for_app(poses)})
            index.append(meta)
        (OUT / "jump" / view / "index.json").write_text(json.dumps({
            "dataset": "jump_fatigue", "exercise": "cmj", "view": view, "primary": view == PRIMARY_VIEW["jump"],
            "camera": cam.__dict__, "built_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "subjects": {k: v.__dict__ for k, v in subjects.items()}, "recordings": index}, indent=1), encoding="utf-8")
        print(f"[jump/{view}] {len(index)} trials", flush=True)


def build_rehab() -> None:
    reps = rh.load_reps()
    for exercise, (movement, match) in rh.APP_MOVEMENT.items():
        ex_reps = [r for r in reps if r.exercise == exercise]
        videos = sorted({r.video for r in ex_reps})
        for view, cam in VIEWS[movement].items():
            index = []
            for video in videos:
                vreps = sorted([r for r in ex_reps if r.video == video], key=lambda r: r.first_frame)
                joints = rh.load_joints(video, exercise)
                pos, have = lm.mapped_positions(joints, lm.REHAB_JOINT_MAP)
                lm.check_mapping_complete(have)
                T = pos.shape[0]
                # People turn between blocks of reps (e.g. ten reps facing camera 17, then ten half-profile).
                # The virtual camera is re-aimed for each block so every rep is filmed from the view the app
                # advises, as if the athlete kept facing the same way. It switches midway through the pause
                # between blocks.
                blocks = rh.orientation_blocks(vreps)
                bounds = [0]
                for prev, nxt in zip(blocks, blocks[1:]):
                    bounds.append((prev[-1].last_frame + nxt[0].first_frame) // 2)
                bounds.append(T)
                poses = np.zeros((T, lm.NUM_LANDMARKS, 3))
                cams = []
                for b, block in enumerate(blocks):
                    frames = np.concatenate([np.arange(r.first_frame, min(r.last_frame, T - 1) + 1) for r in block])
                    seg = slice(bounds[b], bounds[b + 1])
                    p_all, info = lm.project(pos, have, cam, axes_frames=frames)
                    poses[seg] = p_all[seg]
                    lr, fwd = lm.body_axes(pos, frames)
                    cams.append({"block": b, "orientation": block[0].orientation, "reps": [r.number for r in block],
                                 "frames": [int(bounds[b]), int(bounds[b + 1])], "facing_deg": round(math.degrees(math.atan2(fwd[0], fwd[2])), 1), **info})
                # Lab reference per rep: 3D knee flexion from the skeleton (not used by the app).
                kl = angle3(joints["LeftUpLeg"], joints["LeftLeg"], joints["LeftFoot"])
                kr = angle3(joints["RightUpLeg"], joints["RightLeg"], joints["RightFoot"])
                hip_y = (joints["LeftUpLeg"][:, 1] + joints["RightUpLeg"][:, 1]) / 2
                rep_meta = []
                for r in vreps:
                    seg = slice(r.first_frame, min(r.last_frame, T - 1) + 1)
                    rep_meta.append({"number": r.number, "t_start": r.first_frame / rh.FPS, "t_end": (r.last_frame + 1) / rh.FPS,
                                     "frames": [r.first_frame, r.last_frame], "correct": r.correct, "orientation": r.orientation,
                                     "subtype": r.subtype, "mocap_error": r.mocap_error,
                                     "lab_reference": {"knee_flex_3d_peak_deg": [float(kl[seg].max()), float(kr[seg].max())],
                                                       "hip_drop_m": float(np.percentile(hip_y[: max(1, r.first_frame)], 90) - hip_y[seg].min()) if r.first_frame else None}})
                rec_id = video
                meta = {"recording": rec_id, "video": video, "exercise": exercise, "movement": movement, "person": vreps[0].person,
                        "frames": int(T), "duration_s": round(T / rh.FPS, 2), "blocks": cams, "reps": rep_meta, **lm.frame_quality(poses)}
                write_recording(OUT / "rehab" / f"ex{exercise}_{movement}" / view / f"{rec_id}.json",
                                {"dataset": "rehab24_6", "exercise": movement, "view": view, "recording": rec_id, "fps": rh.FPS,
                                 "aspect": cam.aspect, "frames": lm.flatten_for_app(poses)})
                index.append(meta)
            (OUT / "rehab" / f"ex{exercise}_{movement}" / view / "index.json").write_text(json.dumps({
                "dataset": "rehab24_6", "exercise_id": exercise, "exercise": rh.EXERCISES[exercise], "movement": movement,
                "match_to_app": match, "view": view, "primary": view == PRIMARY_VIEW[movement], "camera": cam.__dict__,
                "built_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "recordings": index}, indent=1), encoding="utf-8")
            print(f"[rehab/ex{exercise}_{movement}/{view}] {len(index)} videos, {sum(len(m['reps']) for m in index)} annotated reps", flush=True)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--dataset", choices=["jump", "rehab", "all"], default="all")
    a = p.parse_args()
    if a.dataset in ("jump", "all"):
        build_jump()
    if a.dataset in ("rehab", "all"):
        build_rehab()


if __name__ == "__main__":
    main()
