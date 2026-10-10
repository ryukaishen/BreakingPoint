"""Phase 4A.5: landmark streams and lab references for the measurement-validity checks.

    python -I research/measurement/build_streams.py

For every jump trial this writes, under data/processed/measurement/ (git-ignored):

  streams/jump/<stream>/<recording>.f64   frames of the eight landmarks the app reads, as float64
  streams/jump/<stream>/index.json        frame counts, rate, aspect ratio and camera per stream
  references/jump.json                    lab reference events and measures per trial
  references/participants.json            participant descriptors from participant_log.xlsx
  references/rehab.json                   REHAB24-6 rep boundaries under the app's own definition, from the 3D skeleton

Streams separate the steps between the athlete's body and the app's touchdown decision:

  ortho250   ideal side view: orthographic (no perspective), 250 Hz, straight from the markers
  ortho30    the same, resampled to 30 fps as in Phase 4A
  az<A>_d<D> pinhole camera at the app's advised hip height, azimuth A degrees, D metres, 30 fps
             (az35_d3.5 and az0_d3.5 reproduce the Phase 4A streams exactly)

Nothing here changes the Phase 4A outputs or any app code. Values are rounded to 5 decimals,
as in the Phase 4A JSON streams, so identical views give identical app results.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "research" / "adapters"))
import jump_fatigue as jf  # noqa: E402
import landmarks as lm  # noqa: E402

OUT = REPO / "data" / "processed" / "measurement"
APP_FPS = 30.0
G = 9.807  # the dataset's own gravity constant (COM_acceleration is a constant -9.807)

#: The eight MediaPipe landmarks the app's frame metrics read, in the order they are stored.
APP_LANDMARKS = [11, 12, 23, 24, 25, 26, 27, 28]

#: Webcam frame rates besides 30 fps, for the advised camera (streams az35_d3.5_f<fps>).
OTHER_FPS = (15, 60)

#: Camera placements. az35_d3.5 is the app's advice for jumps (Phase 4A primary view).
CAMERAS = {
    "az0_d3.5": lm.Camera(azimuth_deg=0, distance_m=3.5),
    "az20_d3.5": lm.Camera(azimuth_deg=20, distance_m=3.5),
    "az35_d3.5": lm.Camera(azimuth_deg=35, distance_m=3.5),
    "az50_d3.5": lm.Camera(azimuth_deg=50, distance_m=3.5),
    "az70_d3.5": lm.Camera(azimuth_deg=70, distance_m=3.5),
    "az35_d2.5": lm.Camera(azimuth_deg=35, distance_m=2.5),
    "az35_d4.5": lm.Camera(azimuth_deg=35, distance_m=4.5),
}

# Reference-event settings, fixed before any comparison with the app was made.
BALLISTIC_TOL_MPS = 0.05     # COM vertical velocity within 5 cm/s of a free-fall line = airborne
APEX_HALF_WINDOW_S = 0.08    # the free-fall line is fitted to +-80 ms around the apex
TOE_LIFT_M = 0.01            # secondary take-off: lowest toe marker 1 cm above its standing height
COM_MOVE_MPS = 0.05          # countermovement starts when COM moves down faster than 5 cm/s
CONTACT_AGREE_S = 0.05       # a contact index is trusted when the free-fall landing is within 50 ms of it
UPRIGHT_RATIO = 0.95         # a trial starts upright when its starting hip height is >= 95% of the person's highest
STANDING_S = 0.4


def ortho_side(pos: np.ndarray, have: np.ndarray, aspect: float, standing: slice, cam: lm.Camera) -> np.ndarray:
    """Orthographic view of the athlete's left side: image x = backwards, y = down, no perspective.

    Scaled like the pinhole camera at `cam.distance_m` at the pelvis, so body sizes in the image match.
    """
    lr, fwd = lm.body_axes(pos, standing)
    pelvis = np.nanmedian((pos[standing, 23, :] + pos[standing, 24, :]) / 2, axis=0)
    rel = pos - pelvis
    tan_half_v = math.tan(math.radians(cam.horizontal_fov_deg) / 2) * cam.height_px / cam.width_px
    metres_per_height = 2 * cam.distance_m * tan_half_v
    out = np.zeros(pos.shape[:2] + (3,))
    out[..., 0] = 0.5 - (rel @ fwd) / (metres_per_height * aspect)
    out[..., 1] = 0.5 - rel[..., 1] / metres_per_height
    for i in range(lm.NUM_LANDMARKS):
        out[:, i, 2] = 0.0 if not have[i] else (cam.far_visibility if i in lm.RIGHT_LANDMARKS else cam.near_visibility)
    return out


def write_stream(path: Path, poses: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    np.round(poses[:, APP_LANDMARKS, :], 5).astype("<f8").tofile(path)


def ballistic_events(t: np.ndarray, com_y: np.ndarray, v_y: np.ndarray, ic: int):
    """Take-off and landing from the COM vertical velocity: airborne while it follows v = c - g t.

    The free-fall line is fitted around the apex (highest COM before contact). Take-off is where the
    velocity last joins the line before the apex, landing where it first leaves it after.
    """
    fs = 1.0 / float(np.median(np.diff(t)))
    lo = max(0, ic - int(0.8 * fs))
    apex = lo + int(np.argmax(com_y[lo:ic]))
    h = int(round(APEX_HALF_WINDOW_S * fs))
    win = slice(max(0, apex - h), min(len(t), apex + h + 1))
    c = float(np.mean(v_y[win] + G * t[win]))
    resid = v_y - (c - G * t)
    i = apex
    while i > 0 and abs(resid[i - 1]) <= BALLISTIC_TOL_MPS:
        i -= 1
    j = apex
    while j < len(t) - 1 and abs(resid[j + 1]) <= BALLISTIC_TOL_MPS:
        j += 1
    takeoff, landing = float(t[i]), float(t[j + 1]) if j + 1 < len(t) else None
    return {"takeoff_s": takeoff, "landing_s": landing, "apex_s": float(t[apex]),
            "takeoff_velocity_mps": float(c - G * takeoff)}


def toe_takeoff(t: np.ndarray, markers: dict, ic: int, fs: float):
    """Secondary take-off: the last moment before the apex when the lower toe marker is within 1 cm of standing."""
    toe = np.minimum(markers["LTOE"][:, 1], markers["RTOE"][:, 1])
    base = float(np.median(toe[: int(STANDING_S * fs)]))
    up = np.where(toe[:ic] > base + TOE_LIFT_M)[0]
    if not len(up):
        return None
    runs = np.split(up, np.where(np.diff(up) > 1)[0] + 1)
    return float(t[max(runs, key=len)[0]])


def references(tr: jf.JumpTrial, pos: np.ndarray, knee_l: int, knee_r: int) -> dict:
    """Lab reference events and measures for one trial, all at 250 Hz, time 0 = first frame."""
    t = tr.time - tr.time[0]
    fs = tr.sample_rate_hz
    st = slice(0, int(STANDING_S * fs))
    com_y = tr.com_position[:, 1]
    v_y = np.asarray(_com_velocity(tr), dtype=float)[:, 1]
    # Contact: the force-plate index (IC_A), unless the free-fall landing disagrees with it by more than
    # CONTACT_AGREE_S; then the kinematic index (IC_K) if that one agrees. Otherwise the trial has no usable
    # reference and is flagged.
    ic, bal, source = None, None, None
    for name, cand in (("force plate (IC_A)", tr.contact_frame_analog), ("kinematic (IC_K)", tr.contact_frame_kinematic)):
        if cand is None or cand < int(0.5 * fs):
            continue
        b = ballistic_events(t, com_y, v_y, cand)
        if b["landing_s"] is not None and abs(b["landing_s"] - t[cand]) <= CONTACT_AGREE_S:
            ic, bal, source = cand, b, name
            break
    if ic is None:
        return {"recording": tr.recording_id, "subject": tr.subject, "condition": tr.condition, "trial": tr.trial,
                "reference_ok": False, "why": "neither contact index agrees with the free-fall landing of the centre of mass"}
    i_to = int(round(bal["takeoff_s"] * fs))
    com_stand = float(np.median(com_y[st]))
    # Countermovement: lowest COM before take-off. It starts where COM first moves down faster than 5 cm/s:
    # from the fastest downward speed before the lowest point, scan back while still faster than that.
    i_bot = int(np.argmin(com_y[:i_to]))
    k = int(np.argmin(v_y[:i_bot])) if i_bot > 0 else 0
    while k > 0 and v_y[k - 1] < -COM_MOVE_MPS:
        k -= 1
    lr, fwd = lm.body_axes(pos, st)
    hip_l, ank_l = pos[:, 23, :], pos[:, 27, :]
    leg3d = float(np.median(np.linalg.norm(hip_l[st] - ank_l[st], axis=1)))
    # Trunk inclination in the sagittal plane (hip midpoint to shoulder midpoint), as an ideal side camera sees it.
    trunk = (pos[:, 11, :] + pos[:, 12, :]) / 2 - (pos[:, 23, :] + pos[:, 24, :]) / 2
    sag = np.degrees(np.arctan2(np.abs(trunk @ fwd), trunk[:, 1]))
    # Landing position: ankle midpoint shortly after contact relative to standing, in the athlete's axes.
    ank_mid = (pos[:, 27, :] + pos[:, 28, :]) / 2
    post = slice(ic + int(0.2 * fs), min(len(t), ic + int(0.3 * fs)))
    disp = np.median(ank_mid[post], axis=0) - np.median(ank_mid[st], axis=0)
    land = slice(ic, min(len(t), ic + int(0.5 * fs)))
    ja = tr.joint_angles
    rule = ankle_rule_events(t, pos, st, leg3d, bal["apex_s"])
    return {
        "recording": tr.recording_id, "subject": tr.subject, "condition": tr.condition, "trial": tr.trial,
        "reference_ok": True, "contact_source": source,
        "duration_s": float(t[-1]),
        "contact_s": float(t[ic]),
        "takeoff_s": bal["takeoff_s"], "takeoff_toe_s": toe_takeoff(t, tr.markers, ic, fs),
        "landing_ballistic_s": bal["landing_s"], "apex_s": bal["apex_s"],
        "flight_s": float(t[ic]) - bal["takeoff_s"],
        "takeoff_velocity_mps": bal["takeoff_velocity_mps"],
        "leg_length_3d_m": leg3d,
        "com_rise_per_leg": (float(np.max(com_y[i_to:ic])) - com_stand) / leg3d,
        "impulse_height_m": bal["takeoff_velocity_mps"] ** 2 / (2 * G),
        "com_depth_per_leg": (com_stand - float(com_y[i_bot])) / leg3d,
        "move_start_s": float(t[k]), "bottom_s": float(t[i_bot]),
        "eccentric_s": float(t[i_bot] - t[k]), "concentric_s": bal["takeoff_s"] - float(t[i_bot]),
        "contraction_s": bal["takeoff_s"] - float(t[k]),
        "trunk_sagittal_peak_deg": float(np.max(sag[k:i_to + 1])),
        "opensim_knee_landing_peak_deg": [float(np.max(ja[land, knee_l])), float(np.max(ja[land, knee_r]))],
        "opensim_knee_at_contact_deg": [float(ja[ic, knee_l]), float(ja[ic, knee_r])],
        "landing_disp_forward_m": float(disp @ fwd), "landing_disp_left_m": float(disp @ lr),
        "start_hip_height_m": start_hip_height(pos, st),
        **rule,
    }


def ankle_rule_events(t: np.ndarray, pos: np.ndarray, st: slice, leg3d: float, apex_s: float) -> dict:
    """The app's take-off and touchdown thresholds (src/reps/segmenter.ts: ankle lift above 3.5% of leg length,
    back below 1.5%) applied directly to the true 3D ankle height at 250 Hz, outside the app's state machine.
    The ankle is combined as the app does (near side weight 1.0, far side 0.9). This isolates what the rule and
    the choice of the ankle as the landmark contribute, with no camera, frame rate or smoothing involved."""
    ank = (pos[:, 27, 1] * 1.0 + pos[:, 28, 1] * 0.9) / 1.9
    lift = (ank - float(np.median(ank[st]))) / leg3d
    i_apex = int(np.searchsorted(t, apex_s))
    i = i_apex
    while i > 0 and lift[i - 1] > 0.035:
        i -= 1
    j = i_apex
    while j < len(t) - 1 and lift[j + 1] >= 0.015:
        j += 1

    def cross(a, b, level):
        return float(t[a] + (level - lift[a]) / (lift[b] - lift[a]) * (t[b] - t[a])) if lift[b] != lift[a] else float(t[b])

    return {"ankle_rule_takeoff_s": cross(i - 1, i, 0.035) if i > 0 else None,
            "ankle_rule_touchdown_s": cross(j, j + 1, 0.015) if j < len(t) - 1 else None}


def start_hip_height(pos: np.ndarray, st: slice) -> float:
    return float(np.median((pos[st, 23, 1] + pos[st, 24, 1]) / 2))


def flag_crouched_starts(refs: list, pos_by_rec: dict) -> None:
    """Some trials begin with the participant still but already crouched. The app takes its standing reference
    from the first still frames, so those trials cannot be measured as the app intends. A trial is flagged
    when its starting hip height is below UPRIGHT_RATIO of the same participant's highest starting hip height."""
    best: dict = {}
    for r in refs:
        best[r["subject"]] = max(best.get(r["subject"], 0.0), pos_by_rec[r["recording"]])
    for r in refs:
        ratio = pos_by_rec[r["recording"]] / best[r["subject"]]
        r["start_hip_ratio"] = round(ratio, 4)
        r["starts_upright"] = bool(ratio >= UPRIGHT_RATIO)


_VEL_CACHE: dict = {}


def _com_velocity(tr: jf.JumpTrial):
    return _VEL_CACHE[tr.recording_id]


def load_com_velocity() -> None:
    """COM_velocity is not exposed by the Phase 4A loader; read it here (read-only, same file)."""
    import scipy.io as sio
    mat = sio.loadmat(str(jf.CMJ_MAT), squeeze_me=False, struct_as_record=False)
    cells = mat["CMJ"]
    for i in range(cells.shape[0]):
        if cells[i, 0].size == 0:
            continue
        sub_data = cells[i, 0][0, 0].CMJ_bil[0, 0].sub_data
        for k in range(sub_data.shape[0]):
            tr = sub_data[k, 0]
            label = str(tr.File.ravel()[0]) if tr.File.size else ""
            if tr.marker.size and tr.COM_velocity.size:
                _VEL_CACHE[f"sub{i + 1:02d}_{label}"] = np.asarray(tr.COM_velocity, dtype=float)


REP_CROSS = 0.06  # the app's rep boundary: hip drop of 6% of leg length (src/reps/segmenter.ts CROSS)


def rehab_references() -> dict:
    """For every annotated REHAB24-6 squat and lunge: the rep boundaries the app's own definition gives on the
    3D skeleton (hip drop crossing 6% of leg length), with an ideal standing reference (the 95th percentile of
    hip height in the video). Comparing the app with these separates segmentation errors from the different
    way the annotators marked a rep (start and end of the whole repetition, pauses included)."""
    import rehab24_6 as rh
    reps = rh.load_reps()
    out = {}
    for exercise, (movement, _) in rh.APP_MOVEMENT.items():
        for video in sorted({r.video for r in reps if r.exercise == exercise}):
            j = rh.load_joints(video, exercise)
            hip = (j["LeftUpLeg"][:, 1] + j["RightUpLeg"][:, 1]) / 2
            leg = float(np.median(np.linalg.norm(j["LeftUpLeg"] - j["LeftFoot"], axis=1)))
            d = (float(np.percentile(hip, 95)) - hip) / leg
            t = np.arange(len(d)) / rh.FPS
            # 3D trunk inclination (hips to neck, from vertical) and left hip flexion (shoulder-hip-knee).
            trunk = j["Neck"] - j["Hips"]
            incl = np.degrees(np.arctan2(np.linalg.norm(trunk[:, [0, 2]], axis=1), trunk[:, 1]))
            v1, v2 = j["LeftArm"] - j["LeftUpLeg"], j["LeftLeg"] - j["LeftUpLeg"]
            hip_flex = 180.0 - np.degrees(np.arccos(np.clip(np.sum(v1 * v2, axis=1) / (np.linalg.norm(v1, axis=1) * np.linalg.norm(v2, axis=1)), -1, 1)))
            rows = []
            for r in sorted((x for x in reps if x.video == video), key=lambda x: x.first_frame):
                lo, hi = r.first_frame, min(r.last_frame, len(d) - 1)
                deep = lo + int(np.argmax(d[lo:hi + 1]))
                row = {"number": r.number, "max_drop_per_leg": float(d[deep]), "t_start": None, "t_end": None,
                       "trunk_3d_peak_deg": float(incl[lo:hi + 1].max()),
                       "hip_flex_3d_rom_deg": float(hip_flex[lo:hi + 1].max() - hip_flex[lo:hi + 1].min())}
                if d[deep] > REP_CROSS:
                    a = deep
                    while a > 0 and d[a - 1] > REP_CROSS:
                        a -= 1
                    b = deep
                    while b < len(d) - 1 and d[b + 1] > REP_CROSS:
                        b += 1
                    if a > 0:
                        row["t_start"] = float(t[a - 1] + (REP_CROSS - d[a - 1]) / (d[a] - d[a - 1]) * (t[a] - t[a - 1]))
                    if b < len(d) - 1:
                        row["t_end"] = float(t[b] + (d[b] - REP_CROSS) / (d[b] - d[b + 1]) * (t[b + 1] - t[b]))
                rows.append(row)
            out[video] = {"exercise": exercise, "movement": movement, "leg_length_3d_m": leg, "reps": rows}
    return out


def participants() -> dict:
    """Descriptors from participant_log.xlsx (columns as in its header row)."""
    import openpyxl
    rows = list(openpyxl.load_workbook(jf.PARTICIPANT_LOG, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True))
    num = lambda v: float(v) if isinstance(v, (int, float)) else None  # noqa: E731
    subs = jf.load_subjects()
    out = {}
    for r in rows:
        name = str(r[0]).strip() if r[0] is not None else ""
        if name in subs:
            s = subs[name]
            out[name] = {"group": s.group, "sex": s.sex, "age_y": num(r[3]), "height_m": num(r[4]), "mass_kg": num(r[5]),
                         "bmi": num(r[6]), "leg_length_m": s.leg_length_m, "jump_height_pre_cm": s.jump_height_pre_cm,
                         "jump_height_post_cm": s.jump_height_post_cm, "borg_pre": num(r[13]), "borg_post": num(r[14]),
                         "activity_days_per_week": num(r[17]), "leg_dominance": s.leg_dominance, "fatigued_leg": s.fatigued_leg,
                         "flags": s.flags}
    return out


def main() -> None:
    trials = jf.load_trials()
    load_com_velocity()
    knee_l, knee_r = jf.ik_column("knee_angle_l"), jf.ik_column("knee_angle_r")
    cam_ref = CAMERAS["az35_d3.5"]
    index = {name: [] for name in ["ortho250", "ortho30", *CAMERAS, *(f"az35_d3.5_f{f}" for f in OTHER_FPS)]}
    refs = []
    start_hip = {}
    for tr in trials:
        pos250, have = lm.mapped_positions(tr.markers, lm.JUMP_MARKER_MAP)
        lm.check_mapping_complete(have)
        t250 = tr.time - tr.time[0]
        st250 = slice(0, int(STANDING_S * tr.sample_rate_hz))
        t30, pos30 = lm.resample(t250, pos250, APP_FPS)
        st30 = slice(0, int(round(STANDING_S * APP_FPS)))
        streams = {
            "ortho250": (ortho_side(pos250, have, cam_ref.aspect, st250, cam_ref), float(tr.sample_rate_hz)),
            "ortho30": (ortho_side(pos30, have, cam_ref.aspect, st30, cam_ref), APP_FPS),
        }
        for name, cam in CAMERAS.items():
            streams[name] = (lm.project(pos30, have, cam, axes_frames=st30)[0], APP_FPS)
        for fps in OTHER_FPS:  # the advised camera at other webcam frame rates
            _, pos_f = lm.resample(t250, pos250, float(fps))
            st_f = slice(0, int(round(STANDING_S * fps)))
            streams[f"az35_d3.5_f{fps}"] = (lm.project(pos_f, have, cam_ref, axes_frames=st_f)[0], float(fps))
        for name, (poses, fps) in streams.items():
            write_stream(OUT / "streams" / "jump" / name / f"{tr.recording_id}.f64", poses)
            index[name].append({"recording": tr.recording_id, "frames": int(poses.shape[0]), "fps": fps,
                                **lm.frame_quality(poses)})
        refs.append(references(tr, pos250, knee_l, knee_r))
        start_hip[tr.recording_id] = start_hip_height(pos250, st250)
    flag_crouched_starts(refs, start_hip)
    for name, recs in index.items():
        cam = CAMERAS.get(name, cam_ref)
        (OUT / "streams" / "jump" / name / "index.json").write_text(json.dumps({
            "stream": name, "aspect": cam.aspect, "landmarks": APP_LANDMARKS, "values_per_landmark": ["x", "y", "visibility"],
            "camera": None if name.startswith("ortho") else cam.__dict__,
            "projection": "orthographic side view (no perspective)" if name.startswith("ortho") else "pinhole",
            "recordings": recs}, indent=1), encoding="utf-8")
    ref_dir = OUT / "references"
    ref_dir.mkdir(parents=True, exist_ok=True)
    settings = {"ballistic_tol_mps": BALLISTIC_TOL_MPS, "apex_half_window_s": APEX_HALF_WINDOW_S, "toe_lift_m": TOE_LIFT_M,
                "com_move_mps": COM_MOVE_MPS, "contact_agree_s": CONTACT_AGREE_S, "upright_ratio": UPRIGHT_RATIO,
                "g": G, "standing_s": STANDING_S}
    (ref_dir / "jump.json").write_text(json.dumps({"settings": settings, "trials": refs}, indent=1), encoding="utf-8")
    (ref_dir / "participants.json").write_text(json.dumps(participants(), indent=1), encoding="utf-8")
    (ref_dir / "rehab.json").write_text(json.dumps({"rep_cross": REP_CROSS, "videos": rehab_references()}, indent=1), encoding="utf-8")
    print(f"{len(trials)} trials, {len(index)} streams each, references for {len(refs)} trials")


if __name__ == "__main__":
    main()
