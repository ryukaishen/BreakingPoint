// Cross-language parity: BreakingPoint Lab (Python) validates the detector; the
// app runs it in TypeScript. This replays the Lab-generated fixture through the
// app's code and requires identical baselines, drift scores, states and alarms.
// Regenerate with:  cd lab && python -m breakingpoint_lab.parity
import { describe, expect, it } from 'vitest';
import fixture from './fixtures/parity_fixture.json';
import { buildBaseline } from '../src/baseline/baseline';
import { featureSpecs, type RepFeatures } from '../src/biomechanics/catalog';
import { parseDetectorConfig } from '../src/detection/config';
import { driftScore } from '../src/detection/driftScore';
import { runDetector } from '../src/detection/detector';

interface Expected {
  baseline: Record<string, { center: number; scale: number } | null>;
  mu0: number;
  sigma0: number;
  reference_source: string;
  scores: (number | null)[];
  states: string[];
  ewma: number[];
  cusum: number[];
  alarm_rep: number | null;
  onset_rep: number | null;
  first_warn_rep: number | null;
}

const fx = fixture as unknown as {
  configs: Record<string, unknown>[];
  sessions: { calibration: RepFeatures[]; monitoring: RepFeatures[] }[];
  expected: Expected[][];
};
const specs = featureSpecs('squat');
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9 * Math.max(1, Math.abs(b)));

describe('TypeScript detector matches the Python Lab reference', () => {
  fx.configs.forEach((rawCfg, ci) => {
    const cfg = parseDetectorConfig({ schema: 'breakingpoint.detector/v1', ...rawCfg });
    it(`config #${ci} (${cfg.mode}, ${cfg.featureWeighting}, ${cfg.missingHandling})`, () => {
      fx.sessions.forEach((s, si) => {
        const exp = fx.expected[ci][si];
        const bl = buildBaseline(s.calibration, 'squat', cfg);
        for (const spec of specs) {
          const e = exp.baseline[spec.key];
          const got = bl.features[spec.key];
          if (e === null) expect(got).toBeNull();
          else {
            expect(got).not.toBeNull();
            close(got!.center, e.center);
            close(got!.scale, e.scale);
          }
        }
        expect(bl.reference.source).toBe(exp.reference_source);
        close(bl.reference.mu0, exp.mu0);
        close(bl.reference.sigma0, exp.sigma0);
        const scores = s.monitoring.map((r) => driftScore(r, bl.features, specs, cfg).score);
        scores.forEach((d, t) => {
          const e = exp.scores[t];
          if (e === null) expect(d).toBeNull();
          else close(d as number, e);
        });
        const det = runDetector(cfg, bl.reference.mu0, bl.reference.sigma0, scores);
        expect(det.steps.map((x) => x.state)).toEqual(exp.states);
        det.steps.forEach((st, t) => {
          close(st.ewma, exp.ewma[t]);
          close(st.cusum, exp.cusum[t]);
        });
        expect(det.alarmRep).toBe(exp.alarm_rep);
        expect(det.onsetRep).toBe(exp.onset_rep);
        expect(det.firstWarnRep).toBe(exp.first_warn_rep);
      });
    });
  });
});
