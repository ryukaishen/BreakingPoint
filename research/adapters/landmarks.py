"""Motion-capture positions to BreakingPoint-style 2D landmarks, through a virtual webcam.

BreakingPoint's app reads MediaPipe Pose landmarks: 33 points in normalized image
coordinates (x right, y down, 0..1) with a visibility per point. The offline evaluation
replaces MediaPipe with motion-capture positions:

1. Each MediaPipe landmark the app uses is mapped to a marker (jump dataset) or skeleton
   joint (REHAB24-6). The mapping tables below are explicit; see
   research/datasets/measurement_differences.md for what each substitution means.
2. The 3D positions (metres, y up) are viewed by a virtual pinhole camera placed the way
   the app's setup screen tells athletes to place a phone or laptop: at hip height, a few
   metres away, side-on or slightly oblique.
3. The projected points are resampled to the webcam frame rate.

This tests BreakingPoint's own measurement and scoring code on motion-capture movement.
It does not reproduce MediaPipe's tracking: there is no detection noise, no occlusion and
no depth ambiguity, so results from it are a best case and say nothing about how well
MediaPipe tracks real video.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, Optional, Sequence, Tuple

import numpy as np

NUM_LANDMARKS = 33

#: MediaPipe indices the app's metrics and segmentation read (src/biomechanics/frameMetrics.ts).
USED_BY_APP = {11: "leftShoulder", 12: "rightShoulder", 23: "leftHip", 24: "rightHip",
               25: "leftKnee", 26: "rightKnee", 27: "leftAnkle", 28: "rightAnkle"}

# Each entry: MediaPipe index -> marker names whose mean gives the point (jump dataset,
# Plug-in-Gait-style marker set; positions in mm, converted to m).
JUMP_MARKER_MAP: Dict[int, Tuple[str, ...]] = {
    0: ("LFHD", "RFHD"),          # nose  -> mean of the front head markers
    7: ("LFHD", "LBHD"),          # left ear -> left side of the head
    8: ("RFHD", "RBHD"),          # right ear
    11: ("LSHO",),                # shoulder -> acromion marker (sits above the joint centre)
    12: ("RSHO",),
    13: ("LELB",),
    14: ("RELB",),
    15: ("LWRA", "LWRB"),         # wrist -> mean of the two wrist markers
    16: ("RWRA", "RWRB"),
    23: ("LGT",),                 # hip -> greater trochanter marker (lateral, not the joint centre)
    24: ("RGT",),
    25: ("LKNE", "LKNEM"),        # knee -> midpoint of lateral and medial epicondyle markers
    26: ("RKNE", "RKNEM"),
    27: ("LANK", "LANKM"),        # ankle -> midpoint of lateral and medial malleolus markers
    28: ("RANK", "RANKM"),
    29: ("LHEE",),
    30: ("RHEE",),
    31: ("LTOE",),
    32: ("RTOE",),
}

# REHAB24-6 3D skeleton (OptiTrack Motive, 26 joints; joints_names.txt) -> MediaPipe index.
REHAB_JOINT_NAMES = ["Hips", "Spine", "Spine1", "Neck", "Head", "Head_end", "LeftShoulder", "LeftArm", "LeftForeArm",
                     "LeftHand", "LeftHand_end", "RightShoulder", "RightArm", "RightForeArm", "RightHand", "RightHand_end",
                     "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase", "LeftToeBase_end", "RightUpLeg", "RightLeg",
                     "RightFoot", "RightToeBase", "RightToeBase_end"]
REHAB_JOINT_MAP: Dict[int, Tuple[str, ...]] = {
    0: ("Head",),
    11: ("LeftArm",),             # shoulder -> glenohumeral joint centre ("LeftShoulder" is the clavicle)
    12: ("RightArm",),
    13: ("LeftForeArm",),         # elbow
    14: ("RightForeArm",),
    15: ("LeftHand",),            # wrist
    16: ("RightHand",),
    23: ("LeftUpLeg",),           # hip joint centre
    24: ("RightUpLeg",),
    25: ("LeftLeg",),             # knee joint centre
    26: ("RightLeg",),
    27: ("LeftFoot",),            # ankle joint centre
    28: ("RightFoot",),
    31: ("LeftToeBase",),
    32: ("RightToeBase",),
}

LEFT_LANDMARKS = {7, 11, 13, 15, 23, 25, 27, 29, 31}
RIGHT_LANDMARKS = {8, 12, 14, 16, 24, 26, 28, 30, 32}


@dataclass(frozen=True)
class Camera:
    """Virtual webcam. Defaults follow the app's setup advice (src/components/SidePanel.tsx):
    camera at hip height, 2.5 to 3.5 m away, side-on (squat and jump: 30 to 45 degrees)."""

    #: Angle between the camera's line of sight and the athlete's left-right axis, in degrees.
    #: 0 = pure side view of the athlete's left side; 90 = facing the athlete.
    azimuth_deg: float = 35.0
    distance_m: float = 3.0
    width_px: int = 1280
    height_px: int = 720
    horizontal_fov_deg: float = 65.0
    #: Visibility given to landmarks on the side facing the camera and on the far side.
    near_visibility: float = 1.0
    far_visibility: float = 0.9

    @property
    def aspect(self) -> float:
        return self.width_px / self.height_px

    @property
    def focal_px(self) -> float:
        return (self.width_px / 2) / math.tan(math.radians(self.horizontal_fov_deg) / 2)


def mapped_positions(source: Dict[str, np.ndarray], mapping: Dict[int, Tuple[str, ...]]) -> Tuple[np.ndarray, np.ndarray]:
    """(T, 33, 3) positions and (33,) availability flags from named source points (T, 3) each."""
    T = next(iter(source.values())).shape[0]
    out = np.zeros((T, NUM_LANDMARKS, 3))
    have = np.zeros(NUM_LANDMARKS, dtype=bool)
    for idx, names in mapping.items():
        if all(n in source for n in names):
            out[:, idx, :] = np.mean([source[n] for n in names], axis=0)
            have[idx] = True
    return out, have


def body_axes(pos: np.ndarray, frames: Optional[slice] = None) -> Tuple[np.ndarray, np.ndarray]:
    """Unit horizontal left-right axis (pointing to the athlete's left) and forward axis (y is up).

    Left-right comes from right hip -> left hip; forward is up x left-right, i.e. the way the athlete faces.
    """
    sel = pos if frames is None else pos[frames]
    lr = np.nanmedian(sel[:, 23, :] - sel[:, 24, :], axis=0)
    lr[1] = 0.0
    n = np.linalg.norm(lr)
    if not np.isfinite(n) or n < 1e-6:
        raise ValueError("cannot find the left-right axis: hips coincide")
    lr /= n
    up = np.array([0.0, 1.0, 0.0])
    fwd = np.cross(lr, up)
    fwd /= np.linalg.norm(fwd)
    # The datasets do not state their axis handedness, so confirm "forward" from the feet:
    # toes sit in front of the ankles. Flip if the cross product pointed backwards.
    toe_ahead = np.nanmedian(np.concatenate([sel[:, 31, :] - sel[:, 27, :], sel[:, 32, :] - sel[:, 28, :]]), axis=0)
    toe_ahead[1] = 0.0
    if np.linalg.norm(toe_ahead) > 1e-6 and float(toe_ahead @ fwd) < 0:
        fwd = -fwd
    return lr, fwd


def project(pos: np.ndarray, have: np.ndarray, cam: Camera, axes_frames: Optional[slice] = None) -> Tuple[np.ndarray, Dict[str, float]]:
    """Project (T, 33, 3) world positions (m, y up) to (T, 33, 3) [x_norm, y_norm, visibility].

    The camera sits on the athlete's left at `azimuth_deg` from the left-right axis (turned towards
    the athlete's front), `distance_m` from the median pelvis position, at the median standing hip
    height, looking horizontally at the pelvis.
    """
    lr, fwd = body_axes(pos, axes_frames)
    sel = pos if axes_frames is None else pos[axes_frames]
    pelvis = np.nanmedian((sel[:, 23, :] + sel[:, 24, :]) / 2, axis=0)
    a = math.radians(cam.azimuth_deg)
    # Direction from the athlete to the camera: their left side, rotated towards their front.
    to_cam = math.cos(a) * lr + math.sin(a) * fwd
    centre = pelvis + cam.distance_m * to_cam
    centre[1] = pelvis[1]
    look = -to_cam  # optical axis, horizontal
    right = np.cross(look, np.array([0.0, 1.0, 0.0]))
    right /= np.linalg.norm(right)
    down = np.cross(look, right)  # image y grows downwards
    rel = pos - centre
    zc = rel @ look
    xc = rel @ right
    yc = rel @ down
    f = cam.focal_px
    u = cam.width_px / 2 + f * xc / zc
    v = cam.height_px / 2 + f * yc / zc
    out = np.zeros(pos.shape[:2] + (3,))
    out[..., 0] = u / cam.width_px
    out[..., 1] = v / cam.height_px
    vis = np.zeros(NUM_LANDMARKS)
    for i in range(NUM_LANDMARKS):
        if not have[i]:
            continue
        vis[i] = cam.far_visibility if i in RIGHT_LANDMARKS else cam.near_visibility
    out[..., 2] = vis
    # Landmarks with no source keep visibility 0; give them the pelvis position so no value is NaN.
    for i in np.where(~have)[0]:
        out[:, i, 0] = out[:, 23, 0]
        out[:, i, 1] = out[:, 23, 1]
    info = {"camera_x_m": float(centre[0]), "camera_z_m": float(centre[2]), "camera_height_m": float(centre[1]),
            "min_depth_m": float(np.nanmin(zc)), "forward_x": float(fwd[0]), "forward_z": float(fwd[2])}
    return out, info


def resample(t_src: np.ndarray, values: np.ndarray, fps: float) -> Tuple[np.ndarray, np.ndarray]:
    """Linearly resample (T, ...) values from times t_src (s) to a uniform `fps` grid starting at t_src[0]."""
    t_new = np.arange(t_src[0], t_src[-1] + 1e-9, 1.0 / fps)
    flat = values.reshape(values.shape[0], -1)
    out = np.empty((t_new.size, flat.shape[1]))
    for j in range(flat.shape[1]):
        out[:, j] = np.interp(t_new, t_src, flat[:, j])
    return t_new, out.reshape((t_new.size,) + values.shape[1:])


def frame_quality(poses: np.ndarray) -> Dict[str, float]:
    """Share of frames where the app's in-frame check would pass for the near (left) side."""
    side = [11, 23, 25, 27]
    x = poses[:, side, 0]
    y = poses[:, side, 1]
    inside = (x > 0.01) & (x < 0.99) & (y > 0.01) & (y < 0.995)
    return {"in_frame_share": float(inside.all(axis=1).mean())}


def flatten_for_app(poses: np.ndarray, decimals: int = 5) -> list:
    """(T, 33, 3) -> list of frames, each a flat [x0, y0, v0, x1, ...] list, rounded for JSON."""
    return np.round(poses.reshape(poses.shape[0], -1), decimals).tolist()


def check_mapping_complete(have: np.ndarray, required: Sequence[int] = tuple(USED_BY_APP)) -> None:
    missing = [USED_BY_APP[i] for i in required if not have[i]]
    if missing:
        raise ValueError(f"landmarks the app needs are missing: {missing}")
