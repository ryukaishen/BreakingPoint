"""Behavioural tests for the sequential detector (scalar reference implementation)."""
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from breakingpoint_lab.core import (BREAKPOINT, STABLE, build_baseline, drift_score, feature_specs, make_config,  # noqa: E402
                                    run_detector)

SPECS = feature_specs("squat")
BASE = {"kneeRomL": 110.0, "kneeRomR": 108.0, "hipRom": 95.0, "depth": 0.42, "trunkLean": 30.0, "repDuration": 2.4,
        "eccentricDuration": 1.2, "concentricDuration": 0.9, "peakVelocity": 210.0, "asymmetry": 3.0}
# Deterministic +-1 SD style wiggle so baselines have realistic spread
WIGGLE = [0.0, 0.8, -0.6, 0.4, -0.9, 0.5, -0.3, 0.7]


def rep(shift=0.0, k=0, missing=(), lowq=()):
    """A synthetic rep: `shift` moves features in a fatigue direction (units ~ baseline SDs)."""
    w = WIGGLE[k % len(WIGGLE)]
    vals = {
        "kneeRomL": BASE["kneeRomL"] + 3 * w - 3 * shift, "kneeRomR": BASE["kneeRomR"] + 3 * w - 3 * shift,
        "hipRom": BASE["hipRom"] + 3 * w - 3 * shift, "depth": BASE["depth"] + 0.02 * w - 0.02 * shift,
        "trunkLean": BASE["trunkLean"] + 2 * w + 2.5 * shift, "repDuration": BASE["repDuration"] + 0.1 * w + 0.12 * shift,
        "eccentricDuration": BASE["eccentricDuration"] + 0.06 * w, "concentricDuration": BASE["concentricDuration"] + 0.05 * w + 0.07 * shift,
        "peakVelocity": BASE["peakVelocity"] + 10 * w - 14 * shift, "asymmetry": BASE["asymmetry"] + 1.5 * w + 2 * shift,
    }
    for m in missing:
        vals[m] = None
    return {"values": vals, "quality": {k_: (0.2 if k_ in lowq else 0.95) for k_ in vals}}


class DetectorBehaviour(unittest.TestCase):
    def setUp(self):
        self.cfg = make_config()
        self.bl = build_baseline([rep(0, k) for k in range(6)], SPECS, self.cfg)
        self.mu0 = self.bl["reference"]["mu0"]
        self.sigma0 = self.bl["reference"]["sigma0"]

    def scores(self, reps):
        return [drift_score(r, self.bl["features"], SPECS, self.cfg)["score"] for r in reps]

    def test_constant_normal_reps_do_not_trigger(self):
        det = run_detector(self.cfg, self.mu0, self.sigma0, self.scores([rep(0, k + 3) for k in range(40)]))
        self.assertIsNone(det.alarm_rep)
        self.assertEqual(det.state, STABLE)

    def test_single_outlier_does_not_trigger(self):
        reps = [rep(0, k) for k in range(5)] + [rep(6.0, 1)] + [rep(0, k) for k in range(10)]
        det = run_detector(self.cfg, self.mu0, self.sigma0, self.scores(reps))
        self.assertIsNone(det.alarm_rep)

    def test_progressive_drift_triggers_near_expected_rep(self):
        shifts = [0, 0, 0, 0, 0, 0, 0.5, 1.0, 1.6, 2.2, 2.8, 3.2, 3.5, 3.8]
        det = run_detector(self.cfg, self.mu0, self.sigma0, self.scores([rep(s, i) for i, s in enumerate(shifts)]))
        self.assertIsNotNone(det.alarm_rep)
        self.assertGreaterEqual(det.alarm_rep, 7)
        self.assertLessEqual(det.alarm_rep, 12)
        self.assertEqual(det.state, BREAKPOINT)
        self.assertGreaterEqual(det.onset_rep, 5)
        self.assertLessEqual(det.onset_rep, det.alarm_rep)

    def test_user_example_sequences(self):
        """The spec's conceptual sequences, with an in-control reference of mu0=0.45, sigma0=0.2."""
        normal = [0.3, 0.4, 0.5, 1.3, 0.4]
        drift = [0.4, 0.5, 0.8, 1.2, 1.7, 2.1, 2.5]
        self.assertIsNone(run_detector(self.cfg, 0.45, 0.2, normal).alarm_rep)
        self.assertIsNotNone(run_detector(self.cfg, 0.45, 0.2, drift).alarm_rep)

    def test_missing_and_low_quality_features_do_not_crash(self):
        r = rep(0, 2, missing=("kneeRomR", "asymmetry"), lowq=("trunkLean",))
        out = drift_score(r, self.bl["features"], SPECS, self.cfg)
        self.assertIsNotNone(out["score"])
        self.assertTrue(math.isfinite(out["score"]))
        empty = {"values": {k: None for k in BASE}, "quality": {}}
        self.assertIsNone(drift_score(empty, self.bl["features"], SPECS, self.cfg)["score"])
        det = run_detector(self.cfg, self.mu0, self.sigma0, [None, None, 1.0, None])
        self.assertIsNone(det.alarm_rep)
        self.assertFalse(det.steps[0]["scored"])

    def test_too_few_calibration_reps_use_default_reference(self):
        bl = build_baseline([rep(0, k) for k in range(3)], SPECS, self.cfg)
        self.assertEqual(bl["reference"]["source"], "default")

    def test_all_modes_run(self):
        shifts = [0] * 6 + [1, 2, 3, 3.5, 4, 4, 4]
        sc = self.scores([rep(s, i) for i, s in enumerate(shifts)])
        for mode in ("ewma", "cusum", "combined", "consecutive"):
            det = run_detector(make_config(mode=mode), self.mu0, self.sigma0, sc)
            self.assertIsNotNone(det.alarm_rep, mode)


if __name__ == "__main__":
    unittest.main()
