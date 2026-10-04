// Forward-lunge primitive (BETA): segmentation, robustness to one bad rep, and drift detection,
// all through the full pipeline with deterministic synthetic landmarks.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_DETECTOR_CONFIG, parseDetectorConfig } from '../src/detection/config';
import { DemoController } from '../src/demo/demoController';
import { demoPlan, DEMO_PRESETS, MAKE_REP } from '../src/demo/demoScript';
import { sessionPattern } from '../src/protocols/patterns';
import { SessionEngine } from '../src/session/engine';
import { mulberry32 } from '../src/utils/stats';

const shipped = existsSync('public/breakingpoint_detector_config.json')
  ? parseDetectorConfig(JSON.parse(readFileSync('public/breakingpoint_detector_config.json', 'utf8')))
  : DEFAULT_DETECTOR_CONFIG;
const { seed, effect } = DEMO_PRESETS.lunge;

function run(plan = demoPlan('lunge')) {
  const engine = new SessionEngine('lunge', shipped, 'Adam', 'demo');
  new DemoController(engine, 'lunge', 16 / 9, seed, effect, plan).runToEnd(true);
  return engine.getSnapshot();
}

describe('forward lunge primitive', () => {
  const s = run();

  it('10. segments every deterministic demo lunge and extracts features', () => {
    expect(s.calibrationReps.length).toBe(6);
    expect(s.monitorReps.length).toBe(14);
    expect(s.recoveryReps.length).toBe(3);
    for (const r of s.calibrationReps) {
      const v = r.features.values;
      expect(v.depth!).toBeGreaterThan(0.25);
      expect(v.depth!).toBeLessThan(0.55);
      expect(v.stepLength!).toBeGreaterThan(0.6);
      expect(v.kneeRomL!).toBeGreaterThan(50);
      expect(v.concentricDuration!).toBeGreaterThan(0.3);
      expect(v.recoveryVelocity!).toBeGreaterThan(0.3);
    }
    expect(s.baseline?.reference.source).toBe('loo');
  });

  it('11. one isolated malformed lunge does not create a persistent BreakingPoint', () => {
    const rand = mulberry32(seed + 1000);
    const plan = demoPlan('lunge');
    plan.monitoring = Array.from({ length: 14 }, () => MAKE_REP.lunge(0, rand));
    plan.monitoring[5] = { ...plan.monitoring[5], depth: 0.6, trunk: 12, conc: 1.5, step: 0.7 };
    const bad = run(plan);
    expect(bad.monitorReps.length).toBe(14);
    const d6 = bad.monitorReps[5].drift!.score!;
    const others = bad.monitorReps.filter((r) => r.index !== 6).map((r) => r.drift!.score!);
    expect(d6).toBeGreaterThan(Math.max(...others)); // the bad rep is clearly seen …
    expect(bad.alarmRep).toBeNull(); // … but it is not a regime change
  });

  it('12. progressive lunge drift eventually triggers, after the drift begins', () => {
    expect(s.alarmRep).not.toBeNull();
    expect(s.alarmRep!).toBeGreaterThanOrEqual(8);
    expect(s.alarmRep!).toBeLessThanOrEqual(12);
    expect(s.onsetRep!).toBeGreaterThanOrEqual(6);
    expect(s.onsetRep!).toBeLessThanOrEqual(s.alarmRep!);
    expect(s.monitorReps.slice(0, 6).every((r) => r.step!.state === 'STABLE')).toBe(true);
  });

  it('describes the change as recovery slowing', () => {
    const p = sessionPattern('lunge', s.monitorReps, s.onsetRep, s.baseline?.reference.sigma0);
    expect(p?.id).toBe('recovery');
    expect(p?.label).toBe('RECOVERY SLOWING');
  });
});
