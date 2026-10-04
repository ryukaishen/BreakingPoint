import { describe, expect, it } from 'vitest';
import { buildBaseline } from '../src/baseline/baseline';
import { featureSpecs, type RepFeatures } from '../src/biomechanics/catalog';
import { DEFAULT_DETECTOR_CONFIG as CFG, parseDetectorConfig } from '../src/detection/config';
import { driftScore } from '../src/detection/driftScore';
import { runDetector } from '../src/detection/detector';
import { assessRecovery } from '../src/detection/recovery';

const specs = featureSpecs('squat');
const BASE: Record<string, number> = {
  kneeRomL: 110, kneeRomR: 108, hipRom: 95, depth: 0.42, trunkLean: 30, repDuration: 2.4,
  eccentricDuration: 1.2, concentricDuration: 0.9, peakVelocity: 210, asymmetry: 3,
};
const WIGGLE = [0, 0.8, -0.6, 0.4, -0.9, 0.5, -0.3, 0.7];

/** Deterministic synthetic rep; `shift` moves features in a fatigue direction (~baseline SD units). */
function rep(shift = 0, k = 0, missing: string[] = [], lowQ: string[] = []): RepFeatures {
  const w = WIGGLE[k % WIGGLE.length];
  const values: Record<string, number | null> = {
    kneeRomL: BASE.kneeRomL + 3 * w - 3 * shift,
    kneeRomR: BASE.kneeRomR + 3 * w - 3 * shift,
    hipRom: BASE.hipRom + 3 * w - 3 * shift,
    depth: BASE.depth + 0.02 * w - 0.02 * shift,
    trunkLean: BASE.trunkLean + 2 * w + 2.5 * shift,
    repDuration: BASE.repDuration + 0.1 * w + 0.12 * shift,
    eccentricDuration: BASE.eccentricDuration + 0.06 * w,
    concentricDuration: BASE.concentricDuration + 0.05 * w + 0.07 * shift,
    peakVelocity: BASE.peakVelocity + 10 * w - 14 * shift,
    asymmetry: BASE.asymmetry + 1.5 * w + 2 * shift,
  };
  for (const m of missing) values[m] = null;
  const quality: Record<string, number> = {};
  for (const key of Object.keys(values)) quality[key] = lowQ.includes(key) ? 0.2 : 0.95;
  return { values, quality };
}

const baseline = buildBaseline([0, 1, 2, 3, 4, 5].map((k) => rep(0, k)), 'squat', CFG);
const { mu0, sigma0 } = baseline.reference;
const scoresOf = (reps: RepFeatures[]) => reps.map((r) => driftScore(r, baseline.features, specs, CFG).score);

describe('personalized baseline', () => {
  it('learns per-feature center/scale and a LOO in-control reference', () => {
    expect(baseline.reference.source).toBe('loo');
    expect(baseline.features.kneeRomL?.center).toBeCloseTo(BASE.kneeRomL + 3 * 0.2, 0);
    for (const s of specs) expect(baseline.features[s.key]!.scale).toBeGreaterThanOrEqual(s.absFloor);
    expect(mu0).toBeGreaterThan(0);
    expect(sigma0).toBeGreaterThanOrEqual(CFG.reference.sigma0Min);
  });
});

describe('sequential BreakingPoint detection', () => {
  it('1. constant normal reps do not trigger', () => {
    const det = runDetector(CFG, mu0, sigma0, scoresOf(Array.from({ length: 40 }, (_, k) => rep(0, k + 3))));
    expect(det.alarmRep).toBeNull();
    expect(det.state).toBe('STABLE');
  });

  it('2. one isolated outlier does not trigger a persistent BreakingPoint', () => {
    const reps = [...[0, 1, 2, 3, 4].map((k) => rep(0, k)), rep(6, 1), ...Array.from({ length: 10 }, (_, k) => rep(0, k))];
    const det = runDetector(CFG, mu0, sigma0, scoresOf(reps));
    expect(det.alarmRep).toBeNull();
  });

  it('3 & 4. progressive drift triggers, approximately where expected', () => {
    const shifts = [0, 0, 0, 0, 0, 0, 0.5, 1.0, 1.6, 2.2, 2.8, 3.2, 3.5, 3.8];
    const det = runDetector(CFG, mu0, sigma0, scoresOf(shifts.map((s, i) => rep(s, i))));
    expect(det.state).toBe('BREAKPOINT');
    expect(det.alarmRep).toBeGreaterThanOrEqual(7);
    expect(det.alarmRep).toBeLessThanOrEqual(12);
    expect(det.onsetRep).toBeGreaterThanOrEqual(5);
    expect(det.onsetRep!).toBeLessThanOrEqual(det.alarmRep!);
  });

  it("spec's conceptual sequences behave as described", () => {
    expect(runDetector(CFG, 0.45, 0.2, [0.3, 0.4, 0.5, 1.3, 0.4]).alarmRep).toBeNull();
    expect(runDetector(CFG, 0.45, 0.2, [0.4, 0.5, 0.8, 1.2, 1.7, 2.1, 2.5]).alarmRep).not.toBeNull();
  });

  it('5. missing / low-confidence features do not crash and are not falsely precise', () => {
    const r = driftScore(rep(0, 2, ['kneeRomR', 'asymmetry'], ['trunkLean']), baseline.features, specs, CFG);
    expect(r.score).not.toBeNull();
    expect(Number.isFinite(r.score!)).toBe(true);
    expect(r.deviations.find((d) => d.key === 'trunkLean')?.reason).toBe('low-quality');
    const empty: RepFeatures = { values: {}, quality: {} };
    expect(driftScore(empty, baseline.features, specs, CFG).score).toBeNull();
    const det = runDetector(CFG, mu0, sigma0, [null, null, 1.0, null]);
    expect(det.alarmRep).toBeNull();
    expect(det.steps[0].scored).toBe(false);
  });

  it('every detector family runs and detects strong drift', () => {
    const sc = scoresOf([0, 0, 0, 0, 0, 0, 1, 2, 3, 3.5, 4, 4, 4].map((s, i) => rep(s, i)));
    for (const mode of ['ewma', 'cusum', 'combined', 'consecutive'] as const) {
      expect(runDetector({ ...CFG, mode }, mu0, sigma0, sc).alarmRep).not.toBeNull();
    }
  });

  it('ranks the features that changed most (explanation)', () => {
    const r = driftScore(rep(3, 0), baseline.features, specs, CFG);
    const top = r.ranked.slice(0, 3).map((d) => d.key);
    expect(top.length).toBe(3);
    expect(r.ranked[0].zClipped !== null && Math.abs(r.ranked[0].zClipped) >= Math.abs(r.ranked[2].zClipped!)).toBe(true);
  });
});

describe('Lab config loading', () => {
  it('parses the exported Lab JSON schema', () => {
    const c = parseDetectorConfig({
      schema: 'breakingpoint.detector/v1', mode: 'ewma', ewma_alpha: 0.55, cusum_k: 0.3, cusum_h: 6,
      warning_threshold: 1.2, breakpoint_threshold: 2.7, minimum_persistent_reps: 3, outlier_clip: null,
      validation: { num_sessions: 1000, false_positive_rate: 0.03 },
    });
    expect(c.mode).toBe('ewma');
    expect(c.ewmaAlpha).toBe(0.55);
    expect(c.outlierClip).toBeNull();
    expect(c.validation?.numSessions).toBe(1000);
  });
});

describe('recovery check', () => {
  it('reports recovery toward baseline', () => {
    const r = assessRecovery([1.1, 1.0, 1.2], [3.0, 3.2, 2.9], 1.0, 0.3, 2);
    expect(r!.percent).toBeGreaterThan(0.85);
    expect(r!.status).toBe('recovered');
    expect(assessRecovery([2.9, 3.1, 3.0], [3.0, 3.2, 2.9], 1.0, 0.3, 2)!.status).toBe('persistent');
  });
});
