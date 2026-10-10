"""Loader for REHAB24-6 (Černek, Sedmidubsky and Budikova; Zenodo doi:10.5281/zenodo.13305826;
SISAP 2024). Licence CC BY-NC 4.0: non-commercial research only.

What the loader relies on, verified against the files (research/datasets/rehab24_6.md):

* 3d_joints/ExN/<video>-30fps.npy: arrays of shape (frames, 26, 4) holding homogeneous
  coordinates (x, y, z, 1) of a 26-joint OptiTrack skeleton (joints_names.txt). Positions are
  in metres (thigh and shank about 0.45 m, head about 1.6 m above the floor), y is up. The
  dataset page calls the unit "virtual centimetres"; the data are in metres.
* Segmentation.csv (semicolon-separated): one row per annotated repetition with video, person,
  exercise, first and last frame, the person's orientation towards camera 17, a motion-capture
  error flag, an exercise subtype, and correctness (1 correct, 0 incorrect).
* Frame numbers are treated as 1-based: one annotation ends exactly at the array length
  (PM_117a, frame 1185 of 1185), which only fits 1-based numbering. The choice moves a boundary
  by at most one frame (33 ms).
* "Incorrect" means a technique error performed on purpose under a physiotherapist's
  instruction. It is not fatigue.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List

import numpy as np

ROOT = Path(__file__).resolve().parents[2] / "data" / "external" / "rehab24_6_zenodo_13305826"
FPS = 30.0

EXERCISES = {
    1: "arm abduction",
    2: "arm VW",
    3: "push-ups (hands on a table)",
    4: "leg abduction",
    5: "leg lunge (split squat: back knee down, front knee at a right angle)",
    6: "squat",
}

#: Exercises with a BreakingPoint movement, and how well they match it.
APP_MOVEMENT = {
    6: ("squat", "same movement as the app's bodyweight squat"),
    5: ("lunge", "partial: an in-place split squat, while the app's lunge steps forward and back each rep"),
}


@dataclass
class Rep:
    video: str
    number: int
    exercise: int
    person: int
    first_frame: int       # 0-based, inclusive
    last_frame: int        # 0-based, inclusive
    orientation: str       # towards camera 17: front | half-profile | profile
    mocap_error: bool
    subtype: str
    correct: bool

    @property
    def duration_s(self) -> float:
        return (self.last_frame - self.first_frame + 1) / FPS


def joint_names() -> List[str]:
    lines = (ROOT / "joints_names.txt").read_text(encoding="utf-8").splitlines()
    return [ln.split(":", 1)[1].strip() for ln in lines if ":" in ln]


def load_reps() -> List[Rep]:
    reps = []
    with open(ROOT / "Segmentation.csv", encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f, delimiter=";"):
            reps.append(Rep(
                video=r["video_id"], number=int(r["repetition_number"]), exercise=int(r["exercise_id"]), person=int(r["person_id"]),
                first_frame=int(r["first_frame"]) - 1, last_frame=int(r["last_frame"]) - 1, orientation=r["cam17_orientation"],
                mocap_error=r["mocap_erroneous"] == "1", subtype=r["exercise_subtype"], correct=r["correctness"] == "1",
            ))
    return reps


def video_path(video: str, exercise: int) -> Path:
    return ROOT / "3d_joints" / f"Ex{exercise}" / f"{video}-30fps.npy"


def load_joints(video: str, exercise: int) -> Dict[str, np.ndarray]:
    """Joint name -> (T, 3) positions in metres (y up)."""
    arr = np.load(video_path(video, exercise), allow_pickle=False)
    if arr.ndim != 3 or arr.shape[1:] != (26, 4):
        raise ValueError(f"{video}: unexpected array shape {arr.shape}")
    if not np.allclose(arr[..., 3], 1.0):
        raise ValueError(f"{video}: fourth coordinate is not 1 (not homogeneous points)")
    return {name: arr[:, j, :3].astype(float) for j, name in enumerate(joint_names())}


def orientation_blocks(reps: List[Rep]) -> List[List[Rep]]:
    """Consecutive reps of one video that share an orientation towards camera 17."""
    blocks: List[List[Rep]] = []
    for r in sorted(reps, key=lambda x: x.first_frame):
        if blocks and blocks[-1][-1].orientation == r.orientation:
            blocks[-1].append(r)
        else:
            blocks.append([r])
    return blocks
