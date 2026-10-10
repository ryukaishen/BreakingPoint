"""Unit tests for the Phase 4B statistics (research/phase4b/stats.py) and the real-run guard (run.py)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "research" / "phase4b"))
sys.path.insert(0, str(ROOT / "research" / "measurement"))
import stats  # noqa: E402


class Holm(unittest.TestCase):
    def test_step_down_adjustment(self):
        adj = stats.holm([0.01, 0.04, 0.03, 0.2])
        # sorted 0.01 (x4) 0.03 (x3) 0.04 (x2) 0.2 (x1), monotone
        self.assertAlmostEqual(adj[0], 0.04)
        self.assertAlmostEqual(adj[2], 0.09)
        self.assertAlmostEqual(adj[1], 0.09)
        self.assertAlmostEqual(adj[3], 0.2)


class EffectSizes(unittest.TestCase):
    def test_rank_biserial(self):
        self.assertEqual(stats.rank_biserial([1, 2, 3]), 1.0)
        self.assertEqual(stats.rank_biserial([-1, -2]), -1.0)
        self.assertAlmostEqual(stats.rank_biserial([1, -2, 3, 0]), (1 + 3 - 2) / 6)
        self.assertAlmostEqual(stats.rank_biserial([1, -1]), 0.0)

    def test_auc_counts_ties_as_half(self):
        self.assertEqual(stats.auc([2, 3], [1, 1]), 1.0)
        self.assertEqual(stats.auc([1], [1]), 0.5)
        self.assertEqual(stats.auc([0, 2], [1]), 0.5)
        self.assertIsNone(stats.auc([], [1]))


class Bootstrap(unittest.TestCase):
    def test_interval_covers_the_mean_and_is_reproducible(self):
        rng = np.random.default_rng(0)
        x = rng.normal(5.0, 1.0, size=40).tolist()
        a, b = stats.boot_ci(x), stats.boot_ci(x)
        self.assertEqual(a, b)
        self.assertLess(a[0], np.mean(x))
        self.assertGreater(a[1], np.mean(x))
        self.assertIsNone(stats.boot_ci([1.0]))

    def test_summary_ignores_missing_values(self):
        s = stats.summarize([1.0, None, 3.0, float("nan")])
        self.assertEqual(s["n"], 2)
        self.assertEqual(s["mean"], 2.0)
        self.assertEqual(s["share_above_zero"], 1.0)


class RealRunGuard(unittest.TestCase):
    def test_actual_run_refuses_without_a_valid_analysis_freeze(self):
        import run
        if not run.ANALYSIS_FREEZE.exists():
            self.assertIn("no analysis freeze", run.verify_analysis())


if __name__ == "__main__":
    unittest.main()
