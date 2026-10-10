"""Loader checks against the real files. Skipped when the datasets have not been prepared
(python -I research/adapters/prepare_data.py ...)."""
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "adapters"))
import jump_fatigue as jf  # noqa: E402
import prepare_data  # noqa: E402
import rehab24_6 as rh  # noqa: E402

HAVE_JUMP = jf.CMJ_MAT.exists()
HAVE_REHAB = (rh.ROOT / "Segmentation.csv").exists()


class PrepareSafety(unittest.TestCase):
    def test_refuses_unsafe_archive_member_names(self):
        for bad in ("../x.npy", "/etc/passwd", "a/../../b", "\\\\server\\share"):
            with self.subTest(bad=bad), self.assertRaises(SystemExit):
                prepare_data.safe_name(bad)
        self.assertEqual(prepare_data.safe_name("Ex1/PM_000-30fps.npy"), "Ex1/PM_000-30fps.npy")


@unittest.skipUnless(HAVE_JUMP, "jump dataset not prepared")
class JumpDataset(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.trials = jf.load_trials()
        cls.subjects = jf.load_subjects()

    def test_participants_and_groups(self):
        self.assertEqual(len(self.subjects), 43)
        self.assertNotIn("sub05", self.subjects)
        groups = [s.group for s in self.subjects.values()]
        self.assertEqual((groups.count("control"), groups.count("ACL")), (22, 21))

    def test_trials_conditions_and_order(self):
        self.assertEqual(len(self.trials), 256)
        per = {}
        for t in self.trials:
            per.setdefault(t.subject, []).append((t.condition, t.trial))
        self.assertEqual(sorted(per["sub44"]), [("fatigued", 1), ("fatigued", 2), ("non_fatigued", 1), ("non_fatigued", 2)])
        self.assertTrue(all(len(v) == 6 for k, v in per.items() if k != "sub44"))
        labels = jf.trial_label_rows()
        self.assertTrue(all(sorted(v) == [0, 0, 0, 1, 1, 1] for v in labels.values()))

    def test_sampling_rate_and_units(self):
        for t in self.trials:
            self.assertAlmostEqual(t.sample_rate_hz, 250.0, places=3)
            hip_y = float(np.median(t.markers["LGT"][:50, 1]))
            self.assertTrue(0.6 < hip_y < 1.2, f"{t.recording_id}: hip height {hip_y} m")  # mm converted to m
        knee = jf.ik_column("knee_angle_r")
        self.assertTrue(all(np.nanmax(t.joint_angles[:, knee]) > 60 for t in self.trials))  # flexion positive, degrees

    def test_contact_indices_are_inside_the_trial_and_agree(self):
        agree = 0
        for t in self.trials:
            self.assertTrue(0 <= t.contact_frame_analog < len(t.time))
            agree += abs(t.contact_frame_kinematic - t.contact_frame_analog) <= 12
        self.assertGreaterEqual(agree, 255)


@unittest.skipUnless(HAVE_REHAB, "REHAB24-6 not prepared")
class RehabDataset(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.reps = rh.load_reps()

    def test_annotation_counts(self):
        self.assertEqual(len(self.reps), 1072)
        self.assertEqual(len({r.video for r in self.reps}), 65)
        self.assertEqual(len({r.person for r in self.reps}), 10)
        squats = [r for r in self.reps if r.exercise == 6]
        self.assertEqual((len(squats), sum(r.correct for r in squats)), (195, 134))

    def test_frames_are_one_based_and_inside_the_arrays(self):
        for v in sorted({(r.video, r.exercise) for r in self.reps}):
            n = np.load(rh.video_path(*v), allow_pickle=False).shape[0]
            last = max(r.last_frame for r in self.reps if r.video == v[0])
            self.assertLess(last, n, v)

    def test_units_are_metres_with_y_up(self):
        j = rh.load_joints("PM_000", 1)
        thigh = float(np.median(np.linalg.norm(j["LeftUpLeg"] - j["LeftLeg"], axis=1)))
        self.assertTrue(0.35 < thigh < 0.6)
        self.assertGreater(float(np.median(j["Head"][:, 1])), float(np.median(j["LeftFoot"][:, 1])) + 1.0)

    def test_orientation_blocks(self):
        reps = [r for r in self.reps if r.video == "PM_022"]
        blocks = rh.orientation_blocks(reps)
        self.assertGreaterEqual(len(blocks), 2)
        self.assertTrue(all(len({r.orientation for r in b}) == 1 for b in blocks))


if __name__ == "__main__":
    unittest.main()
