"""Unit tests for the Phase 4B statistics (research/phase4b/stats.py, analysis v2) and the real-run guard (run.py)."""
from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "research" / "phase4b"))
sys.path.insert(0, str(ROOT / "research" / "measurement"))
import stats  # noqa: E402


class Holm(unittest.TestCase):
    def test_step_down_adjustment(self):
        adj = stats.holm([0.01, 0.04, 0.03, 0.2])
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
        self.assertEqual(stats.auc_pairs([2, 3], [1, 1]), 1.0)
        self.assertEqual(stats.auc_pairs([1], [1]), 0.5)
        self.assertIsNone(stats.auc_pairs([], [1]))

    def test_fold_paired_auc_compares_within_folds(self):
        folds = {"heldout": [1.0, 3.0], "incorrectByFold": [[2.0, 0.5], [2.0, 4.0]]}
        # fold 1: 2 > 1 yes, 0.5 > 1 no; fold 2: 2 > 3 no, 4 > 3 yes -> 2 of 4
        self.assertEqual(stats.auc_fold_paired(folds), 0.5)
        # v1 averages each incorrect rep over folds first: (2, 2.25) against (1, 3) -> 2 of 4
        self.assertEqual(stats.auc_fold_averaged(folds), 0.5)


class Intervals(unittest.TestCase):
    def test_t_interval(self):
        lo, hi = stats.t_interval([1.0, 2.0, 3.0])
        half = 4.302652729911275 * 1.0 / math.sqrt(3)  # t(2) 97.5% quantile, SD 1
        self.assertAlmostEqual(lo, 2.0 - half, 9)
        self.assertAlmostEqual(hi, 2.0 + half, 9)
        self.assertIsNone(stats.t_interval([1.0]))

    def test_exact_order_statistic_interval(self):
        ci, level = stats.order_stat_interval(list(range(1, 10)))  # n = 9: (x_(2), x_(8)), exact level 0.961
        self.assertEqual(ci, [2, 8])
        self.assertAlmostEqual(level, 1 - 2 * 10 / 512, 9)
        ci, level = stats.order_stat_interval(list(range(1, 39)))  # n = 38
        self.assertGreaterEqual(level, 0.95)

    def test_wilson(self):
        lo, hi = stats.wilson(0, 38)
        self.assertEqual(lo, 0.0)
        self.assertAlmostEqual(hi, 0.0918, 3)
        self.assertIsNone(stats.wilson(0, 0))


class OnePerPerson(unittest.TestCase):
    def test_summaries_take_exactly_one_value_per_person(self):
        people = [{"id": 1}, {"id": 2}]
        self.assertEqual(stats.one_per_person([0.1, None], people), [0.1, None])
        with self.assertRaises(ValueError):
            stats.one_per_person([0.1, 0.2, 0.3], people)

    def test_summary_ignores_missing_values(self):
        s = stats.summarize([1.0, None, 3.0, float("nan")])
        self.assertEqual(s["n"], 2)
        self.assertEqual(s["mean"], 2.0)


class RealRunGuard(unittest.TestCase):
    def test_actual_run_refuses_without_a_valid_analysis_freeze(self):
        import run
        if not run.ANALYSIS_FREEZE.exists():
            self.assertIn("no analysis freeze", run.verify_analysis())


if __name__ == "__main__":
    unittest.main()
