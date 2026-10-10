"""Virtual-camera geometry and landmark mapping.

    python -I -m unittest discover -s research/tests
"""
import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "adapters"))
import landmarks as lm  # noqa: E402


def standing_body(T=10, knee_flex_deg=0.0):
    """A stick figure facing +z with its left side towards +x, knee bent by `knee_flex_deg` (sagittal plane)."""
    pos = np.zeros((T, lm.NUM_LANDMARKS, 3))
    have = np.zeros(lm.NUM_LANDMARKS, dtype=bool)
    th = math.radians(knee_flex_deg)
    for side, x in ((0, 0.1), (1, -0.1)):  # left, right
        hip, knee, ankle, shoulder, toe = (23 + side, 25 + side, 27 + side, 11 + side, 31 + side)
        pos[:, hip] = [x, 0.9, 0.0]
        pos[:, knee] = [x, 0.45, 0.0]
        # shank rotated backwards by the flexion angle around the knee
        pos[:, ankle] = [x, 0.45 - 0.45 * math.cos(th), -0.45 * math.sin(th)]
        pos[:, shoulder] = [x, 1.4, 0.0]
        pos[:, toe] = pos[:, ankle] + np.array([0.0, -0.05, 0.15])
        have[[hip, knee, ankle, shoulder, toe]] = True
    return pos, have


def app_knee_flexion(p, aspect):
    """The app's 2D knee flexion (src/biomechanics/frameMetrics.ts): 180 - interior angle, x scaled by aspect."""
    a, b, c = (np.array([p[i, 0] * aspect, p[i, 1]]) for i in (23, 25, 27))
    v1, v2 = a - b, c - b
    cos = float(v1 @ v2 / (np.linalg.norm(v1) * np.linalg.norm(v2)))
    return 180.0 - math.degrees(math.acos(max(-1.0, min(1.0, cos))))


class Projection(unittest.TestCase):
    def test_side_view_preserves_sagittal_knee_angle(self):
        for flex in (0, 30, 60, 90):
            pos, have = standing_body(knee_flex_deg=flex)
            out, _ = lm.project(pos, have, lm.Camera(azimuth_deg=0, distance_m=30.0))  # far away: nearly orthographic
            self.assertAlmostEqual(app_knee_flexion(out[0], lm.Camera().aspect), flex, delta=1.0)

    def test_oblique_view_foreshortens_flexion(self):
        pos, have = standing_body(knee_flex_deg=60)
        side, _ = lm.project(pos, have, lm.Camera(azimuth_deg=0))
        oblique, _ = lm.project(pos, have, lm.Camera(azimuth_deg=35))
        self.assertLess(app_knee_flexion(oblique[0], lm.Camera().aspect), app_knee_flexion(side[0], lm.Camera().aspect))

    def test_image_y_grows_downward_and_people_fit_in_frame(self):
        pos, have = standing_body()
        out, _ = lm.project(pos, have, lm.Camera())
        self.assertLess(out[0, 11, 1], out[0, 23, 1])  # shoulder above hip
        self.assertLess(out[0, 23, 1], out[0, 27, 1])  # hip above ankle
        self.assertTrue(((out[0, [11, 23, 25, 27], :2] > 0) & (out[0, [11, 23, 25, 27], :2] < 1)).all())

    def test_camera_sits_on_the_left_and_near_side_is_more_visible(self):
        pos, have = standing_body()
        out, info = lm.project(pos, have, lm.Camera(azimuth_deg=0))
        self.assertGreater(info["camera_x_m"], 0)  # +x is the athlete's left here
        self.assertEqual(out[0, 23, 2], 1.0)
        self.assertEqual(out[0, 24, 2], 0.9)
        self.assertEqual(out[0, 29, 2], 0.0)  # no source for the heel in this figure

    def test_forward_axis_follows_the_feet_whatever_the_handedness(self):
        pos, have = standing_body()
        _, fwd = lm.body_axes(pos)
        self.assertGreater(fwd[2], 0.9)
        mirrored = pos.copy()
        mirrored[..., 2] *= -1  # flip z: toes now point to -z
        _, fwd_m = lm.body_axes(mirrored)
        self.assertLess(fwd_m[2], -0.9)

    def test_resample_to_30_fps(self):
        t = np.arange(0, 1.0001, 0.004)
        vals = np.stack([t, 2 * t], axis=1)
        t30, v30 = lm.resample(t, vals, 30.0)
        self.assertAlmostEqual(t30[1] - t30[0], 1 / 30)
        np.testing.assert_allclose(v30[:, 1], 2 * t30, atol=1e-9)


class Mapping(unittest.TestCase):
    def test_every_landmark_the_app_reads_is_mapped_in_both_datasets(self):
        for table in (lm.JUMP_MARKER_MAP, lm.REHAB_JOINT_MAP):
            for idx in lm.USED_BY_APP:
                self.assertIn(idx, table)

    def test_rehab_joint_names_match_the_dataset_order(self):
        self.assertEqual(len(lm.REHAB_JOINT_NAMES), 26)
        self.assertEqual(lm.REHAB_JOINT_NAMES[16], "LeftUpLeg")
        self.assertEqual(lm.REHAB_JOINT_NAMES[22], "RightLeg")

    def test_missing_required_landmark_is_refused(self):
        have = np.ones(lm.NUM_LANDMARKS, dtype=bool)
        have[25] = False
        with self.assertRaises(ValueError):
            lm.check_mapping_complete(have)

    def test_mapped_positions_average_marker_pairs(self):
        src = {"LKNE": np.array([[1.0, 0.0, 0.0]]), "LKNEM": np.array([[0.0, 0.0, 0.0]])}
        pos, have = lm.mapped_positions(src, {25: ("LKNE", "LKNEM")})
        np.testing.assert_allclose(pos[0, 25], [0.5, 0.0, 0.0])
        self.assertTrue(have[25])
        self.assertFalse(have[26])


if __name__ == "__main__":
    unittest.main()
