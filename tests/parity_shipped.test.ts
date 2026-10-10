// Cross-language parity for the configuration the app actually ships.
// tests/parity.test.ts covers six test configurations; none of them is the shipped one.
// This fixture runs the same simulated sessions through the Python Lab with the shipped
// configuration (public/breakingpoint_detector_config.json), and the app's TypeScript
// code must reproduce every baseline, score, EWMA/CUSUM value, state and alarm.
// Regenerate with:  python -I research/tools/make_shipped_parity_fixture.py
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import fixture from './fixtures/parity_shipped_fixture.json';
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
  config_source: { path: string; config_id: string; sha256: string };
  configs: Record<string, unknown>[];
  sessions: { calibration: RepFeatures[]; monitoring: RepFeatures[] }[];
  expected: Expected[][];
};
const specs = featureSpecs('squat');
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9 * Math.max(1, Math.abs(b)));

describe('shipped detector configuration: TypeScript matches the Python Lab', () => {
  it('was generated from the exact config file the app loads', () => {
    const sha = createHash('sha256').update(readFileSync('public/breakingpoint_detector_config.json')).digest('hex');
    expect(fx.config_source.sha256).toBe(sha);
    expect(fx.config_source.config_id).toBe('ewma|a=0.4|bp=2|w=1|m=0|clip=2.5');
    expect(fx.configs).toHaveLength(1);
  });

  const cfg = parseDetectorConfig({ schema: 'breakingpoint.detector/v1', ...fx.configs[0] });
  const app = parseDetectorConfig(JSON.parse(readFileSync('public/breakingpoint_detector_config.json', 'utf8')));

  it('uses the same detector settings the app parses', () => {
    for (const k of ['mode', 'ewmaAlpha', 'cusumK', 'cusumH', 'warningThreshold', 'breakpointThreshold', 'minimumPersistentReps', 'outlierClip', 'zClip',
      'featureWeighting', 'missingHandling', 'qualityMin', 'minCoverage', 'reference'] as const) {
      expect(cfg[k], k).toEqual(app[k]);
    }
  });

  it('reproduces every simulated session', () => {
    fx.sessions.forEach((s, si) => {
      const exp = fx.expected[0][si];
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
