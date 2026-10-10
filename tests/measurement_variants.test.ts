// Phase 4A.5 harness checks. The experimental signal chains in research/measurement/variants.ts
// may differ from the app only where they say they do: the "production" variant must reproduce
// the app's offline path exactly, and the diagnostic One Euro copy must return what the app's
// filter returns.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import type { Pose } from '../src/pose/landmarks';
import { OneEuroFilter } from '../src/pose/smoothing';
import { DEFAULT_DETECTOR_CONFIG, parseDetectorConfig } from '../src/detection/config';
import { DemoController } from '../src/demo/demoController';
import { SessionEngine } from '../src/session/engine';
import { extractRecording } from '../research/evaluation/offlinePipeline';
import { Butterworth2, TracedOneEuro, gaussian, jitter, runVariant, VARIANTS } from '../research/measurement/variants';

const cfg = existsSync('public/breakingpoint_detector_config.json')
  ? parseDetectorConfig(JSON.parse(readFileSync('public/breakingpoint_detector_config.json', 'utf8')))
  : DEFAULT_DETECTOR_CONFIG;

function demoRecording(exercise: 'squat' | 'cmj' | 'lunge') {
  const engine = new SessionEngine(exercise, cfg, 'Adam', 'demo');
  const demo = new DemoController(engine, exercise);
  const poses: Pose[] = [];
  const times: number[] = [];
  const push = demo.pipeline.push.bind(demo.pipeline);
  demo.pipeline.push = (pose, t) => {
    if (demo.stage === 'calibration' && pose) {
      poses.push(pose.map((p) => ({ ...p })));
      times.push(t);
    }
    return push(pose, t);
  };
  demo.runToEnd(false);
  return { poses, times };
}

describe.each(['squat', 'cmj', 'lunge'] as const)('production variant is the app path (%s demo)', (exercise) => {
  const { poses, times } = demoRecording(exercise);
  const app = extractRecording(poses, times, 16 / 9, exercise, 0.5);
  const prod = runVariant(poses, times, 16 / 9, exercise, 'production', 0.5);

  it('finds the same reps with identical timing and measurements', () => {
    expect(app.reps.length).toBeGreaterThanOrEqual(5);
    expect(prod.reps.length).toBe(app.reps.length);
    expect(prod.standingFound).toBe(app.standingFound);
    expect(prod.phaseLog).toEqual(app.phaseLog);
    prod.reps.forEach((r, i) => {
      const a = app.reps[i];
      expect([r.tStart, r.tBottom, r.tEnd, r.tTakeoff, r.tLanding, r.maxDepth, r.maxRise, r.legLength, r.closedInHeldFrames])
        .toEqual([a.tStart, a.tBottom, a.tEnd, a.tTakeoff, a.tLanding, a.maxDepth, a.maxRise, a.legLength, a.closedInHeldFrames]);
      expect(r.features).toEqual(a.features.values);
      expect(r.quality).toEqual(a.features.quality);
    });
  });

  it('every variant runs and leaves its input unchanged', () => {
    const before = JSON.stringify(poses);
    for (const v of VARIANTS) expect(runVariant(poses, times, 16 / 9, exercise, v, 0.5).standingFound).toBe(true);
    runVariant(poses, times, 16 / 9, exercise, 'production', 0.5, { sigma: 0.003, seed: 7 });
    expect(JSON.stringify(poses)).toBe(before);
  });
});

describe('dual-path variants', () => {
  it('keep the event path timing and take angles from the production smoothing', () => {
    const { poses, times } = demoRecording('cmj');
    const prod = runVariant(poses, times, 16 / 9, 'cmj', 'production', 0.5);
    const none = runVariant(poses, times, 16 / 9, 'cmj', 'none', 0.5);
    const dual = runVariant(poses, times, 16 / 9, 'cmj', 'dual_none', 0.5);
    expect(dual.reps.map((r) => [r.tTakeoff, r.tLanding, r.maxRise])).toEqual(none.reps.map((r) => [r.tTakeoff, r.tLanding, r.maxRise]));
    // Trunk lean before take-off reads the smoothed angles; with the same windows it differs from the raw one.
    expect(dual.reps.length).toBe(prod.reps.length);
    expect(dual.reps.some((r, i) => r.features.trunkLean !== none.reps[i].features.trunkLean)).toBe(true);
  });
});

describe('diagnostic One Euro copy', () => {
  it('returns exactly what the app filter returns, and reports its cutoff', () => {
    const app = new OneEuroFilter();
    const traced = new TracedOneEuro();
    const rnd = gaussian(3);
    for (let i = 0; i < 400; i++) {
      const t = i / 30;
      const x = 0.6 + 0.1 * Math.sin(2 * Math.PI * 1.5 * t) + 0.002 * rnd();
      expect(traced.filter(x, t)).toBe(app.filter(x, t));
      expect(traced.lastCutoff).toBeGreaterThanOrEqual(1.2);
    }
  });
});

describe('6 Hz Butterworth', () => {
  const run = (f: number, fs: number, n: number) => {
    const b = new Butterworth2(6);
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const y = b.filter(Math.sin(2 * Math.PI * f * (i / fs)), i === 0 ? 0 : 1 / fs);
      if (i > n / 2) peak = Math.max(peak, Math.abs(y));
    }
    return peak;
  };
  it('passes slow movement, halves power at 6 Hz, and holds a constant', () => {
    expect(run(0.5, 30, 600)).toBeCloseTo(1, 2);
    expect(run(6, 250, 5000)).toBeCloseTo(Math.SQRT1_2, 2);
    const b = new Butterworth2(6);
    for (let i = 0; i < 50; i++) expect(b.filter(0.42, i === 0 ? 0 : 1 / 30)).toBeCloseTo(0.42, 12);
  });
});

describe('landmark jitter', () => {
  it('is seeded, has the requested spread, and is round in pixels', () => {
    const pose: Pose = [{ x: 0.5, y: 0.5, visibility: 1 }];
    const a = gaussian(11);
    const b = gaussian(11);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < 20000; i++) {
      const p = jitter(pose, 16 / 9, 0.004, a)[0];
      expect(jitter(pose, 16 / 9, 0.004, b)[0]).toEqual(p);
      xs.push((p.x - 0.5) * (16 / 9));
      ys.push(p.y - 0.5);
    }
    const sd = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
    expect(sd(ys)).toBeCloseTo(0.004, 3);
    expect(sd(xs)).toBeCloseTo(0.004, 3);
  });
});
