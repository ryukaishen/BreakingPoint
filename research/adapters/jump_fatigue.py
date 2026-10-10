"""Loader for the jump-landing dataset (Calisti, Mohr and Federolf; figshare
doi:10.6084/m9.figshare.28890545.v1; Scientific Data 2025, doi:10.1038/s41597-025-05934-5).

Only the bilateral countermovement jumps (CMJ.mat, field CMJ_bil) are used. What the loader
relies on, all verified against the files (research/datasets/jump_fatigue.md):

* CMJ.mat holds a 44 x 1 cell array, one cell per participant in order sub01..sub44.
  Cell 5 (sub05) is empty: that participant was excluded by the authors.
* Each participant has up to six trials, labelled CMJ_t1..CMJ_t3 (non-fatigued) and
  f_CMJ_t1..f_CMJ_t3 (fatigued). sub44's CMJ_t3 and f_CMJ_t3 are empty.
* Sampling is 250 Hz (marker `time` steps of 0.004 s). Trial lengths vary.
* Marker positions are in millimetres, y vertical (up), x towards the participant's left,
  z forward. Joint_Angles holds the 44 OpenSim coordinates (column 1 is time; angles in
  degrees, translations in metres; knee flexion positive). COM_position is in metres.
* IC_K and IC_A are 1-based MATLAB frame indices of initial ground contact (the paper defines
  contact from vertical force > 20 N; the two fields agree to within a few frames).

Labels come from two spreadsheets that code the group in opposite ways:
labeling_CMJ.xlsx uses 1 = control, 2 = ACL; participant_log.xlsx uses 1 = ACL, 2 = control.
`load_subjects` decodes both and refuses to continue if they disagree.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

ROOT = Path(__file__).resolve().parents[2] / "data" / "external" / "jump_fatigue_figshare_28890545"
CMJ_MAT = ROOT / "Kinematic_data" / "Joint_angles" / "CMJ.mat"
IK_LABELS = ROOT / "Kinematic_data" / "Joint_angles" / "IK_column_labels.xlsx"
LABELING = ROOT / "Data_processing" / "labeling_CMJ.xlsx"
PARTICIPANT_LOG = ROOT / "Participants" / "participant_log.xlsx"

SAMPLE_RATE_HZ = 250.0
TRIAL_LABEL = re.compile(r"^(f_)?CMJ_t([123])$")


@dataclass
class JumpTrial:
    subject: str                 # "sub01"
    condition: str               # "non_fatigued" | "fatigued"
    trial: int                   # 1..3, the order within the condition
    label: str                   # the dataset's own label, e.g. "f_CMJ_t2"
    time: np.ndarray             # (T,) s
    markers: Dict[str, np.ndarray]  # name -> (T, 3) metres, y up
    joint_angles: np.ndarray     # (T, 44) OpenSim coordinates, column 0 = time
    com_position: np.ndarray     # (T, 3) m
    contact_frame_kinematic: Optional[int]  # 0-based frame index (IC_K - 1)
    contact_frame_analog: Optional[int]     # 0-based frame index (IC_A - 1)

    @property
    def sample_rate_hz(self) -> float:
        return 1.0 / float(np.median(np.diff(self.time)))

    @property
    def recording_id(self) -> str:
        return f"{self.subject}_{self.label}"


@dataclass
class Subject:
    subject: str
    group: str                   # "control" | "ACL"
    sex: str                     # "female" | "male"
    leg_dominance: str           # "right" | "left"
    fatigued_leg: str            # "right" | "left"
    leg_length_m: Optional[float]
    jump_height_pre_cm: Optional[float]
    jump_height_post_cm: Optional[float]
    flags: List[str] = field(default_factory=list)


def _ik_labels() -> List[str]:
    import openpyxl
    rows = list(openpyxl.load_workbook(IK_LABELS, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True))
    for row in rows:
        if row and row[0] == "time":
            return [str(x) for x in row]
    raise ValueError("IK_column_labels.xlsx has no header row starting with 'time'")


def ik_column(name: str) -> int:
    """Column index of an OpenSim coordinate in Joint_Angles (0 = time)."""
    return _ik_labels().index(name)


def load_trials(path: Path = CMJ_MAT) -> List[JumpTrial]:
    """Every bilateral CMJ trial that has data. Empty trials and the empty sub05 cell are skipped."""
    import scipy.io as sio  # MAT v5; no pickle involved

    mat = sio.loadmat(str(path), squeeze_me=False, struct_as_record=False)
    cells = mat["CMJ"]
    trials: List[JumpTrial] = []
    for i in range(cells.shape[0]):
        cell = cells[i, 0]
        if cell.size == 0:
            continue
        subject = f"sub{i + 1:02d}"
        sub_data = cell[0, 0].CMJ_bil[0, 0].sub_data
        for k in range(sub_data.shape[0]):
            tr = sub_data[k, 0]
            label = str(tr.File.ravel()[0]) if tr.File.size else ""
            m = TRIAL_LABEL.match(label)
            if not m:
                raise ValueError(f"{subject}: unexpected trial label {label!r}")
            if tr.marker.size == 0 or tr.Joint_Angles.size == 0:
                continue  # empty trial (sub44 t3)
            mk = tr.marker[0, 0]
            markers = {name: np.asarray(getattr(mk, name), dtype=float) / 1000.0 for name in mk._fieldnames if name != "time"}
            ic_k = int(tr.IC_K.ravel()[0]) - 1 if tr.IC_K.size else None
            ic_a = int(tr.IC_A.ravel()[0]) - 1 if tr.IC_A.size else None
            trials.append(JumpTrial(
                subject=subject,
                condition="fatigued" if m.group(1) else "non_fatigued",
                trial=int(m.group(2)),
                label=label,
                time=np.asarray(mk.time, dtype=float).ravel(),
                markers=markers,
                joint_angles=np.asarray(tr.Joint_Angles, dtype=float),
                com_position=np.asarray(tr.COM_position, dtype=float),
                contact_frame_kinematic=ic_k,
                contact_frame_analog=ic_a,
            ))
    return trials


def _rows(path: Path) -> List[tuple]:
    import openpyxl
    return [r for r in openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True)]


def load_subjects() -> Dict[str, Subject]:
    """Participant metadata, with both group codings decoded and cross-checked."""
    # labeling_CMJ.xlsx: one row per trial. Columns: jump, sub, group (1 control, 2 ACL), gender
    # (1 female, 2 male), trial (0 non-fatigued, 1 fatigued), leg dominance (1 right, 2 left),
    # fatigued leg (1 right, 2 left), ACL leg, missing data (0/1), notes.
    lab = [r for r in _rows(LABELING)[1:] if r[1] is not None]
    by_sub: Dict[str, List[tuple]] = {}
    for r in lab:
        by_sub.setdefault(f"sub{int(r[1]):02d}", []).append(r)
    # participant_log.xlsx: two blocks (control, ACL) each with its own header row.
    # Columns: participant, group (1 ACL, 2 control), gender, age, height m, weight kg, BMI,
    # leg length cm, 50% leg length, jump height pre cm, jump height post cm, ..., leg dominance,
    # fatigued leg, ...
    log: Dict[str, tuple] = {}
    for r in _rows(PARTICIPANT_LOG):
        name = str(r[0]).strip() if r[0] is not None else ""
        if re.fullmatch(r"sub\d\d", name):
            log[name] = r
    subjects: Dict[str, Subject] = {}
    for sid, rows in sorted(by_sub.items()):
        r = rows[0]
        if len({x[2] for x in rows}) != 1:
            raise ValueError(f"{sid}: group differs between its trials in labeling_CMJ.xlsx")
        group = {1: "control", 2: "ACL"}[int(r[2])]
        flags = []
        if any(x[8] == 1 for x in rows):
            flags.append("labeling_CMJ.xlsx: missing data in .mat (" + "; ".join(sorted({str(x[9]) for x in rows if x[9]})) + ")")
        lg = log.get(sid)
        if lg is None:
            flags.append("not in participant_log.xlsx")
        else:
            log_group = {1: "ACL", 2: "control"}[int(lg[1])]
            if log_group != group:
                raise ValueError(f"{sid}: group is {group} in labeling_CMJ.xlsx but {log_group} in participant_log.xlsx")
        num = lambda v: float(v) if isinstance(v, (int, float)) else None  # noqa: E731
        subjects[sid] = Subject(
            subject=sid,
            group=group,
            sex={1: "female", 2: "male"}[int(r[3])],
            leg_dominance={1: "right", 2: "left"}[int(r[5])],
            fatigued_leg={1: "right", 2: "left"}[int(r[6])],
            leg_length_m=(num(lg[7]) / 100.0) if lg is not None and num(lg[7]) else None,
            jump_height_pre_cm=num(lg[9]) if lg is not None else None,
            jump_height_post_cm=num(lg[10]) if lg is not None else None,
            flags=flags,
        )
    return subjects


def trial_label_rows() -> Dict[str, List[int]]:
    """Per subject, the condition codes (0 non-fatigued, 1 fatigued) in labeling_CMJ.xlsx row order."""
    out: Dict[str, List[int]] = {}
    for r in _rows(LABELING)[1:]:
        if r[1] is not None:
            out.setdefault(f"sub{int(r[1]):02d}", []).append(int(r[4]))
    return out


# Marker -> MediaPipe mapping lives in landmarks.JUMP_MARKER_MAP.
