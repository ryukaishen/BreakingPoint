"""Simulator, vectorized implementation, metrics, sharding and finalize smoke tests."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from breakingpoint_lab import simulate as sim  # noqa: E402
from breakingpoint_lab.core import build_baseline, drift_score, make_config, run_detector  # noqa: E402
from breakingpoint_lab.evaluate import (StatsAccumulator, hist_median, hist_median_ci, select_config,  # noqa: E402
                                        wilson)
from breakingpoint_lab.experiment import load_shards, run_shard  # noqa: E402
from breakingpoint_lab.vectorized import config_to_params, personal_drift, run_detector_batch, spec_arrays  # noqa: E402

SA = spec_arrays(sim.SPECS)


def rep_dicts(X, Q, n):
    return [{"values": {k: (None if not np.isfinite(X[r, j]) else float(X[r, j])) for j, k in enumerate(sim.KEYS)},
             "quality": {k: float(Q[r, j]) for j, k in enumerate(sim.KEYS)}} for r in range(n)]


class SimulatorTests(unittest.TestCase):
    def test_reproducible(self):
        a = sim.generate_sessions(np.random.default_rng(7), sim.balanced_scenarios(64))
        b = sim.generate_sessions(np.random.default_rng(7), sim.balanced_scenarios(64))
        np.testing.assert_array_equal(np.nan_to_num(a.X, nan=-1), np.nan_to_num(b.X, nan=-1))
        np.testing.assert_array_equal(a.tau, b.tau)

    def test_scenario_ground_truth(self):
        b = sim.generate_sessions(np.random.default_rng(3), sim.balanced_scenarios(400))
        nc = np.isin(b.scenario, sim.NO_CHANGE)
        self.assertTrue((b.tau[nc] == 0).all())
        self.assertTrue((b.m_path[nc] == 0).all())
        ch = ~nc
        self.assertTrue((b.tau[ch] >= 4).all())
        for i in np.where(ch)[0]:
            self.assertTrue((b.m_path[i, : b.tau[i] - 1] == 0).all())
            self.assertGreater(b.m_path[i, b.tau[i] - 1], 0)
        self.assertTrue(b.bad_reps[b.scenario == sim.B].any(axis=1).all())
        self.assertTrue(np.isnan(b.X[b.scenario == sim.F]).any())


class VectorizedParityTests(unittest.TestCase):
    def test_vectorized_matches_scalar(self):
        b = sim.generate_sessions(np.random.default_rng(11), sim.balanced_scenarios(48))
        for cfg in (make_config(), make_config(mode="cusum", feature_weighting="equal", missing_feature_handling="impute"),
                    make_config(mode="consecutive", missing_feature_handling="skip_rep", minimum_persistent_reps=2)):
            D, mu0, s0 = personal_drift(b.XC, b.QC, b.ncal, b.X, b.Q, SA, cfg)
            al, on, fw = run_detector_batch(D, mu0, s0, config_to_params([cfg]), cfg["mode"])
            for i in range(b.n):
                bl = build_baseline(rep_dicts(b.XC[i], b.QC[i], b.ncal[i]), sim.SPECS, cfg)
                self.assertAlmostEqual(bl["reference"]["mu0"], mu0[i], places=10)
                self.assertAlmostEqual(bl["reference"]["sigma0"], s0[i], places=10)
                scores = [drift_score(r, bl["features"], sim.SPECS, cfg)["score"] for r in rep_dicts(b.X[i], b.Q[i], b.T[i])]
                for t, sc in enumerate(scores):
                    if sc is None:
                        self.assertTrue(np.isnan(D[i, t]))
                    else:
                        self.assertAlmostEqual(sc, D[i, t], places=10)
                det = run_detector(cfg, bl["reference"]["mu0"], bl["reference"]["sigma0"], scores)
                self.assertEqual(det.alarm_rep or 0, al[0, i])
                self.assertEqual(det.onset_rep or 0, on[0, i])
                self.assertEqual(det.first_warn_rep or 0, fw[0, i])


class MetricsTests(unittest.TestCase):
    def test_hist_median_and_ci(self):
        data = np.array([0, 1, 1, 2, 3, 3, 3, 8])
        h = np.bincount(data, minlength=10)
        self.assertEqual(hist_median(h), float(np.median(data)))
        lo, hi = hist_median_ci(h)
        self.assertLessEqual(lo, np.median(data))
        self.assertGreaterEqual(hi, np.median(data))

    def test_wilson(self):
        p, lo, hi = wilson(5, 100)
        self.assertAlmostEqual(p, 0.05)
        self.assertLess(lo, 0.05)
        self.assertGreater(hi, 0.05)

    def test_accumulator_merge_is_exact(self):
        rng = np.random.default_rng(0)
        scen = sim.balanced_scenarios(80)
        tau = np.where(np.isin(scen, sim.CHANGE), 6, 0)
        al = rng.integers(0, 15, (3, 80)).astype(np.int32)
        on = np.maximum(al - 2, 0)
        a, b, whole = StatsAccumulator(1, 3), StatsAccumulator(1, 3), StatsAccumulator(1, 3)
        a.add(1, 0, np.arange(3), al[:, :40], on[:, :40], scen[:40], tau[:40])
        b.add(1, 0, np.arange(3), al[:, 40:], on[:, 40:], scen[40:], tau[40:])
        whole.add(1, 0, np.arange(3), al, on, scen, tau)
        a.merge(b)
        for f in StatsAccumulator.FIELDS:
            np.testing.assert_array_equal(getattr(a, f), getattr(whole, f))

    def test_selection_rule(self):
        m = {"fpr": np.array([[0.02, 0.04, 0.20, 0.01]]), "fpr_max_scenario": np.array([[0.04, 0.05, 0.3, 0.02]]),
             "miss": np.array([[0.10, 0.09, 0.01, 0.30]]), "median_delay": np.array([[4.0, 3.0, 1.0, 5.0]]),
             "mean_delay": np.array([[4.2, 3.3, 1.1, 5.0]])}
        (v, c), ok = select_config(m, np.array([1, 1, 1, 1]))
        self.assertTrue(ok)
        self.assertEqual(c, 1)  # config 2 violates FPR; 0 and 1 within 2pp miss; 1 is faster


class ShardTests(unittest.TestCase):
    def test_shards_reproducible_and_worker_independent(self):
        with tempfile.TemporaryDirectory() as d1, tempfile.TemporaryDirectory() as d2:
            run_shard(120, 5, 3, 1, Path(d1), "quick", block_size=40, log=lambda *a: None)
            run_shard(120, 5, 3, 2, Path(d2), "quick", block_size=40, log=lambda *a: None)
            a, _ = load_shards(Path(d1), log=lambda *a: None)
            b, _ = load_shards(Path(d2), log=lambda *a: None)
            for f in StatsAccumulator.FIELDS:
                np.testing.assert_array_equal(getattr(a, f), getattr(b, f))
            self.assertEqual(int(a.n.sum()), 120)

    def test_corrupt_shard_is_skipped(self):
        with tempfile.TemporaryDirectory() as d:
            run_shard(80, 5, 0, 1, Path(d), "quick", block_size=40, log=lambda *a: None)
            (Path(d) / "shards" / "shard_00001.npz").write_bytes(b"not a zip")
            acc, metas = load_shards(Path(d), log=lambda *a: None)
            self.assertEqual(len(metas), 1)


class FinalizeSmokeTest(unittest.TestCase):
    def test_end_to_end_quick(self):
        from breakingpoint_lab.finalize import finalize
        with tempfile.TemporaryDirectory() as d:
            out = Path(d)
            run_shard(320, 9, 0, 1, out, "quick", block_size=80, log=lambda *a: None)
            export = finalize(out, grid_name="quick", eval_sessions=240, robustness_sessions=40, workers=1,
                              log=lambda *a: None)
            cfg = json.loads((out / "breakingpoint_detector_config.json").read_text(encoding="utf-8"))
            for key in ("ewma_alpha", "cusum_k", "cusum_h", "warning_threshold", "breakpoint_threshold",
                        "minimum_persistent_reps", "validation"):
                self.assertIn(key, cfg)
            for key in ("num_sessions", "false_positive_rate", "true_positive_rate", "miss_rate", "median_detection_delay"):
                self.assertIn(key, cfg["validation"])
            self.assertEqual(cfg["validation"]["num_sessions"], 320)
            for f in ("summary.csv", "config_results.csv", "scenario_results.csv", "VALIDATION_REPORT.md"):
                self.assertTrue((out / f).exists(), f)
            for f in ("detection_tradeoff", "noise_robustness", "changepoint_accuracy", "scenario_examples",
                      "parameter_heatmap"):
                self.assertTrue((out / "figures" / f"{f}.png").exists(), f)
            self.assertEqual(export["schema"], "breakingpoint.detector/v1")


if __name__ == "__main__":
    unittest.main()
