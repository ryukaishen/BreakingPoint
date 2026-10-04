// Demo Mode regression test: the deterministic demo dataset runs through the full
// pipeline (synthetic landmarks → smoothing → kinematics → rep segmentation →
// features → personal baseline → drift score → sequential detector) and must tell
// the intended story with the shipped, Lab-selected detector configuration.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_DETECTOR_CONFIG, parseDetectorConfig } from '../src/detection/config';
import { SessionEngine } from '../src/session/engine';
import { DemoController } from '../src/demo/demoController';

const shipped = existsSync('public/breakingpoint_detector_config.json')
  ? parseDetectorConfig(JSON.parse(readFileSync('public/breakingpoint_detector_config.json', 'utf8')))
  : DEFAULT_DETECTOR_CONFIG;

function run(exercise: 'squat' | 'cmj', cfg = shipped) {
  const engine = new SessionEngine(exercise, cfg, 'Adam', 'demo');
  const demo = new DemoController(engine, exercise);
  demo.runToEnd(true);
  return engine.getSnapshot();
}

describe.each(['squat', 'cmj'] as const)('demo dataset (%s)', (exercise) => {
  const s = run(exercise);

  it('segments every scripted rep', () => {
    expect(s.calibrationReps.length).toBe(6);
    expect(s.monitorReps.length).toBe(14);
    expect(s.recoveryReps.length).toBe(3);
    expect(s.baseline?.reference.source).toBe('loo');
  });

  // Under the HiPerGator config (warning 1.0σ, BreakingPoint 2.0σ, α 0.4, clip 2.5) the smoothed drift needs at
  // least three reps to climb from a STABLE rep past 2.0σ, so the story is: 1-7 stable, 8-9 drift, 10 BreakingPoint.
  it('tells the story: 1-7 stable, 8-9 drift emerging, 10 BreakingPoint, onset ≈ 7', () => {
    const states = s.monitorReps.map((r) => r.step!.state);
    expect(states.slice(0, 7).every((x) => x === 'STABLE')).toBe(true);
    expect(states[7]).toBe('DRIFT');
    expect(states[8]).toBe('DRIFT');
    expect(s.alarmRep).toBe(10);
    expect(states.slice(9).every((x) => x === 'BREAKPOINT')).toBe(true);
    expect(s.onsetRep).toBeGreaterThanOrEqual(6);
    expect(s.onsetRep).toBeLessThanOrEqual(8);
  });

  it('drift rises during reps 7-8 before the alarm', () => {
    const d = s.monitorReps.map((r) => r.drift!.score as number);
    expect(d[6]).toBeGreaterThan(Math.max(...d.slice(0, 6)));
    expect(d[7]).toBeGreaterThan(d[6]);
    expect(Math.min(...d.slice(9))).toBeGreaterThan(Math.max(...d.slice(0, 6)));
  });

  it('explains the BreakingPoint with ranked contributors and a session summary', () => {
    expect(s.breakpointContributors?.length).toBeGreaterThanOrEqual(3);
    expect(s.summary?.breakpointRep).toBe(10);
    expect(s.summary?.stableReps).toBe(9);
    expect(s.summary?.postReps).toBe(5);
    expect(s.summary!.avgPost!).toBeGreaterThan(s.summary!.avgPre!);
  });

  it('recovery check shows partial return toward baseline', () => {
    expect(s.recovery).not.toBeNull();
    expect(s.recovery!.percent).toBeGreaterThan(0.5);
  });

  it('is deterministic', () => {
    const again = run(exercise);
    expect(again.monitorReps.map((r) => r.drift?.score)).toEqual(s.monitorReps.map((r) => r.drift?.score));
  });
});
