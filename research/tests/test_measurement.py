"""Unit tests for the Phase 4A.5 measurement-validity helpers (synthetic inputs; no dataset needed)."""
from __future__ import annotations

import json
import math
import sys
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "research" / "measurement"))
sys.path.insert(0, str(ROOT / "research" / "adapters"))
import analyze as an  # noqa: E402
import build_streams as bs  # noqa: E402

G = bs.G


def free_fall(takeoff=1.0, flight=0.45, fs=250.0, v_push=1.5):
    """COM height and vertical velocity: still, push-off ramp, free fall, then stopped by the ground."""
    t = np.arange(0, 3.0, 1 / fs)
    v_to = G * flight / 2
    v = np.zeros_like(t)
    push = (t >= takeoff - 0.3) & (t < takeoff)
    v[push] = v_to * (t[push] - (takeoff - 0.3)) / 0.3
    air = (t >= takeoff) & (t < takeoff + flight)
    v[air] = v_to - G * (t[air] - takeoff)
    land = (t >= takeoff + flight) & (t < takeoff + flight + 0.2)
    v[land] = -v_to * (1 - (t[land] - takeoff - flight) / 0.2)
    y = 1.0 + np.cumsum(v) / fs
    return t, y, v


class BallisticEvents(unittest.TestCase):
    def test_finds_take_off_and_landing_of_free_fall(self):
        t, y, v = free_fall()
        ic = int(round((1.0 + 0.45) * 250))
        ev = bs.ballistic_events(t, y, v, ic)
        self.assertAlmostEqual(ev["takeoff_s"], 1.0, delta=0.012)
        self.assertAlmostEqual(ev["landing_s"], 1.45, delta=0.012)
        self.assertAlmostEqual(ev["apex_s"], 1.0 + 0.225, delta=0.008)


class AnkleRule(unittest.TestCase):
    def test_threshold_crossings_are_interpolated(self):
        fs = 250.0
        t = np.arange(0, 2.0, 1 / fs)
        lift = np.clip(0.4 * np.sin(np.pi * (t - 0.8) / 0.5), 0, None) * ((t > 0.8) & (t < 1.3))
        pos = np.zeros((len(t), 33, 3))
        pos[:, 27, 1] = pos[:, 28, 1] = 0.1 + lift * 0.9  # leg 0.9 m
        ev = bs.ankle_rule_events(t, pos, slice(0, 50), 0.9, 1.05)
        up = 0.8 + 0.5 * math.asin(0.035 / 0.4) / math.pi
        down = 1.3 - 0.5 * math.asin(0.015 / 0.4) / math.pi
        self.assertAlmostEqual(ev["ankle_rule_takeoff_s"], up, delta=0.002)
        self.assertAlmostEqual(ev["ankle_rule_touchdown_s"], down, delta=0.002)


class CrouchedStarts(unittest.TestCase):
    def test_flags_trials_far_below_the_persons_highest_start(self):
        refs = [{"recording": f"s_{k}", "subject": "s"} for k in "abc"]
        bs.flag_crouched_starts(refs, {"s_a": 0.93, "s_b": 0.90, "s_c": 0.70})
        self.assertEqual([r["starts_upright"] for r in refs], [True, True, False])
        self.assertAlmostEqual(refs[2]["start_hip_ratio"], 0.70 / 0.93, places=3)


class RepeatedMeasuresCorrelation(unittest.TestCase):
    def test_removes_between_person_differences(self):
        rng = np.random.default_rng(1)
        subj = np.repeat(np.arange(20), 6)
        within = rng.normal(size=subj.size)
        offset_x = rng.normal(scale=10, size=20)[subj]
        offset_y = -rng.normal(scale=10, size=20)[subj]  # between-person relation goes the other way
        x, y = within + offset_x, 2 * within + offset_y
        self.assertAlmostEqual(an.rmcorr(x, y, subj), 1.0, places=9)
        self.assertLess(abs(an.rmcorr(x, rng.normal(size=subj.size), subj)), 0.25)

    def test_within_sd_ignores_person_means(self):
        subj = np.array([0, 0, 1, 1])
        self.assertAlmostEqual(an.within_sd([1.0, 3.0, 101.0, 103.0], subj), math.sqrt(2.0), places=9)


class RepMatching(unittest.TestCase):
    def test_iou_inside_and_one_to_one_greedy(self):
        self.assertAlmostEqual(an.iou(0, 2, 1, 3), 1 / 3)
        self.assertAlmostEqual(an.inside(1, 2, 0, 4), 1.0)
        dets = [{"tStart": 1.0, "tEnd": 2.0}, {"tStart": 1.1, "tEnd": 2.1}]
        anns = [{"t_start": 0.0, "t_end": 3.0}, {"t_start": 5.0, "t_end": 6.0}]
        m = an.match_video(dets, anns, 0.3, "iou")
        self.assertEqual(len(m), 1)  # one annotation cannot take two detections
        self.assertEqual(len(an.match_video(dets, anns, 0.5, "iou")), 0)
        self.assertEqual(len(an.match_video(dets, anns, 0.5, "inside")), 1)


class Filters(unittest.TestCase):
    def test_butterworth_holds_a_constant_and_attenuates_6hz_by_3db(self):
        b = an.ButterPy(6.0)
        self.assertTrue(all(abs(b(0.3, 0 if i == 0 else 1 / 30) - 0.3) < 1e-12 for i in range(30)))
        b = an.ButterPy(6.0)
        fs = 250.0
        ys = [b(math.sin(2 * math.pi * 6 * i / fs), 0 if i == 0 else 1 / fs) for i in range(5000)]
        self.assertAlmostEqual(max(abs(y) for y in ys[2500:]), 1 / math.sqrt(2), delta=0.01)

    def test_one_euro_port_starts_on_the_first_value_and_lags_a_step(self):
        f = an.OneEuroPy()
        self.assertEqual(f(0.5, 0.0), 0.5)
        out = [f(1.0, k / 30) for k in range(1, 31)]
        # A 1.2 Hz first-order filter: about 63% of a step after one time constant (133 ms = 4 frames).
        self.assertAlmostEqual(out[3], 0.5 + 0.5 * (1 - math.exp(-4 / 30 / (1 / (2 * math.pi * 1.2)))), delta=0.06)


class InclusionReadsNoOutcomes(unittest.TestCase):
    """Phase 4B inclusion lists must be fixed without looking at any measurement or score."""

    def test_inclusion_script_never_reads_measurements_or_scores(self):
        src = (ROOT / "research" / "measurement" / "inclusion.py").read_text(encoding="utf-8")
        code = "\n".join(line.split("#")[0] for line in src.splitlines() if not line.strip().startswith(("#", '"""')))
        for forbidden in ('["features"]', "['features']", '"values"', "driftScore", "score(", "lab_reference", "flight_s", "com_rise"):
            self.assertNotIn(forbidden, code, forbidden)


class ProtocolFreeze(unittest.TestCase):
    """The Phase 4B protocol documents must stay exactly as frozen (changes are logged deviations, not edits)."""

    def test_frozen_protocol_documents_are_unchanged(self):
        import shutil
        if shutil.which("git") is None:
            self.skipTest("git not available")
        import freeze
        recorded = json.loads(freeze.PROTOCOL_FREEZE.read_text(encoding="utf-8"))["protocol_files"]
        self.assertEqual(sorted(recorded), sorted(freeze.PROTOCOL_FILES))
        for rel, d in recorded.items():
            self.assertEqual(freeze.git_blob(rel), d["git_blob"], rel)


if __name__ == "__main__":
    unittest.main()
