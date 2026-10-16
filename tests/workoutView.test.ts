// The live workout screen is a projection of the real session (src/session/workoutView.ts).
// These tests drive the real engine with the synthetic athlete and check each state it shows.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import type { ExerciseType } from '../src/biomechanics/catalog';
import { calibrationQuality } from '../src/data/quality';
import { DEFAULT_DETECTOR_CONFIG, parseDetectorConfig } from '../src/detection/config';
import { DemoController } from '../src/demo/demoController';
import { SessionEngine, type Snapshot } from '../src/session/engine';
import {
  CAMERA_OK,
  changedMost,
  continuingReps,
  CONTINUING_REPS,
  REQUESTING_CAMERA,
  scorePosition,
  workoutState,
  workoutView,
  type WorkoutInputs,
} from '../src/session/workoutView';

const config = existsSync('public/breakingpoint_detector_config.json')
  ? parseDetectorConfig(JSON.parse(readFileSync('public/breakingpoint_detector_config.json', 'utf8')) as Record<string, unknown>)
  : DEFAULT_DETECTOR_CONFIG;

const LIVE: WorkoutInputs = { mode: 'live', camera: CAMERA_OK, trackingLost: false, calibration: null, handsFree: true };
const DEMO: WorkoutInputs = { ...LIVE, mode: 'demo' };

/** Run the synthetic athlete through the real engine until `until` holds; returns that snapshot. */
function drive(until: (s: Snapshot) => boolean, exercise: ExerciseType = 'squat') {
  const engine = new SessionEngine(exercise, config, 'Test athlete', 'demo');
  const demo = new DemoController(engine, exercise);
  demo.start();
  for (let i = 0; i < 200000 && !until(engine.getSnapshot()); i++) demo.advance(1);
  const s = engine.getSnapshot();
  expect(until(s), 'the demo reached the state').toBe(true);
  return { engine, demo, s };
}

const idle = () => new SessionEngine('squat', config, 'Test athlete', 'live').getSnapshot();
const framed = (s: Snapshot): Snapshot => ({ ...s, live: { ...s.live, present: true, quality: 0.9, qualityLabel: 'Excellent', calibrated: true } });

describe('camera states (live only)', () => {
  it('the permission prompt, then the pose model loading', () => {
    expect(workoutState(idle(), { ...LIVE, camera: { status: REQUESTING_CAMERA, error: null } })).toBe('permission-pending');
    expect(workoutState(idle(), { ...LIVE, camera: { status: 'Loading pose model (runs locally)…', error: null } })).toBe('starting');
  });
  it('a refused permission, every other start failure, and a camera that stops mid-session', () => {
    const err = (problem: never) => ({ ...LIVE, camera: { status: '', error: { problem, text: 'why' } } });
    expect(workoutState(idle(), err('denied' as never))).toBe('permission-denied');
    for (const p of ['missing', 'busy', 'insecure', 'model', 'other']) expect(workoutState(idle(), err(p as never))).toBe('camera-unavailable');
    expect(workoutState(idle(), err('stopped' as never))).toBe('camera-failure');
  });
  it('the camera message carries the real error text, and the camera counts nothing meanwhile', () => {
    const v = workoutView(idle(), { ...LIVE, camera: { status: '', error: { problem: 'denied', text: 'Camera permission was denied.' } } });
    expect(v.instruction).toBe('Camera permission was denied.');
    expect(v.cameraMessage).toBe(true);
    expect(v.rep).toBeNull();
    expect(v.quality.label).toBe('Camera off');
  });
  it('pose tracking failing mid-set says so, keeps End set on offer, and shows the camera as off', () => {
    const { s } = drive((x) => x.phase === 'monitoring' && x.monitorReps.length >= 2);
    const failed = { ...LIVE, camera: { status: '', error: { problem: 'tracking' as const, text: '' } } };
    expect(workoutState(s, failed)).toBe('camera-failure');
    const v = workoutView(s, failed);
    expect(v.plate).toBe('Tracking stopped');
    expect(v.instruction).toMatch(/End the set to keep the reps so far/);
    expect(v.cameraMessage).toBe(true);
    expect(v.quality.label).toBe('Camera off');
    expect(workoutView(idle(), failed).instruction).not.toMatch(/End the set/);
  });
  it('a demo has no camera: camera fields never change its state', () => {
    expect(workoutState(idle(), { ...DEMO, camera: { status: '', error: { problem: 'denied', text: '' } } })).toBe('prepare');
    expect(workoutView(idle(), DEMO).cameraMessage).toBe(false);
  });
});

describe('set-up', () => {
  it('prepare until the athlete is framed and still, then pose-ready (the hands-free trigger)', () => {
    expect(workoutState(idle(), LIVE)).toBe('prepare');
    expect(workoutState(framed(idle()), LIVE)).toBe('pose-ready');
    expect(workoutView(framed(idle()), LIVE).instruction).toMatch(/Calibration starts automatically/);
    expect(workoutView(framed(idle()), { ...LIVE, handsFree: false }).instruction).toBe('Ready when you are.');
  });
  it('an empty room reads No athlete, and a stray pose shows nothing until presence holds', () => {
    // No pose from the camera at all.
    const empty = workoutView(idle(), { ...LIVE, athleteInView: false });
    expect(empty.state).toBe('prepare');
    expect(empty.quality.label).toBe('No athlete');
    expect(empty.athleteInView).toBe(false);
    // The pose model returns a low-confidence pose for a frame (measured on Chromium's empty fake camera:
    // frame quality under 0.2, smoothed quality under 0.03): still No athlete, nothing ticked.
    const stray = { ...idle(), live: { ...idle().live, present: true, quality: 0.03, qualityLabel: 'Poor' as const } };
    const v = workoutView(stray, { ...LIVE, athleteInView: false });
    expect(v.state).toBe('prepare');
    expect(v.quality.label).toBe('No athlete');
    expect(v.quality.detail).toBe('No athlete in frame');
    expect(v.instruction).toMatch(/Step into the frame/);
    expect(v.athleteInView).toBe(false);
    // Even a framed snapshot is not Ready until the screen has seen the athlete hold.
    expect(workoutState(framed(idle()), { ...LIVE, athleteInView: false })).toBe('prepare');
    expect(workoutState(framed(idle()), { ...LIVE, athleteInView: true })).toBe('pose-ready');
    expect(workoutView(framed(idle()), { ...LIVE, athleteInView: true }).quality.label).toBe('Excellent');
  });
  it('the prepare instruction follows what is missing', () => {
    expect(workoutView(idle(), LIVE).instruction).toMatch(/Step into the frame/);
    const partly = { ...idle(), live: { ...idle().live, present: true, quality: 0.4 } };
    expect(workoutView(partly, LIVE).instruction).toMatch(/whole body is visible/);
  });
});

describe('calibration and baseline', () => {
  it('calibrating counts real calibration reps against the target, with the finish threshold', () => {
    const { s } = drive((x) => x.phase === 'calibrating' && x.calibrationReps.length >= 2);
    const v = workoutView(s, DEMO);
    expect(v.state).toBe('calibrating');
    expect(v.calibration).toEqual({ done: s.calibrationReps.length, target: s.calibrationTarget, required: 5 });
    expect(v.rep).toEqual({ value: s.calibrationReps.length, label: `of ${s.calibrationTarget} fresh reps` });
  });
  it('tracking lost during calibration shows only in live sessions', () => {
    const { s } = drive((x) => x.phase === 'calibrating' && x.calibrationReps.length >= 1);
    expect(workoutState(s, { ...LIVE, trackingLost: true })).toBe('tracking-lost');
    expect(workoutState(s, { ...DEMO, trackingLost: true })).toBe('calibrating');
  });
  it('a good calibration locks the baseline; a poor one says why and that its sets will not count', () => {
    const { s } = drive((x) => x.phase === 'baseline');
    const quality = calibrationQuality(s.baseline!, config);
    expect(quality.ok).toBe(true);
    expect(workoutState(s, { ...LIVE, calibration: quality })).toBe('baseline');
    const poor = { ...quality, ok: false, reasons: ['Calibration reps were unusually inconsistent'] };
    const v = workoutView(s, { ...LIVE, calibration: poor });
    expect(v.state).toBe('calibration-issue');
    expect(v.issues).toEqual(poor.reasons);
    expect(v.instruction).toMatch(/will not count toward your records/);
  });
});

describe('the monitored set', () => {
  it('stable shows the latest real Form Change Score and where it sits between the athlete’s own levels', () => {
    const { s } = drive((x) => x.phase === 'monitoring' && x.state === 'STABLE' && x.monitorReps.filter((r) => r.drift?.score != null).length >= 2);
    const v = workoutView(s, DEMO);
    expect(v.state).toBe('stable');
    const last = [...s.monitorReps].reverse().find((r) => r.step?.scored)!;
    expect(v.score?.value).toBe(last.drift!.score);
    expect(v.score?.position).toBe(scorePosition(last.drift!.score!, s.thresholds!));
    expect(v.rep).toEqual({ value: s.monitorReps.length, label: 'monitored reps' });
  });
  it('form changing is the detector’s DRIFT state; it reads as continuing once the persistence counter reaches 2', () => {
    const { s } = drive((x) => x.phase === 'monitoring' && x.state === 'DRIFT' && x.alarmRep === null);
    const st = workoutState(s, DEMO);
    expect(st).toBe(continuingReps(s) >= CONTINUING_REPS ? 'sustained' : 'warning');
    expect(changedMost(s).length).toBeGreaterThan(0);
  });
  it('STOP is the detector’s alarm: it names the rep, outranks tracking loss, and lists the alarm’s contributors', () => {
    const { s } = drive((x) => x.alarmRep !== null);
    const v = workoutView(s, { ...LIVE, trackingLost: true });
    expect(v.state).toBe('stop');
    expect(v.code).toBe(`Stop / alert at rep ${s.alarmRep}`);
    expect(v.instruction).toBe(`The alert triggered at rep ${s.alarmRep}. End the set and rest.`);
    expect(changedMost(s).map((d) => d.key)).toEqual(
      s.breakpointContributors!.filter((d) => d.used && d.zClipped !== null).slice(0, 3).map((d) => d.key),
    );
  });
  it('tracking lost in a live set before any alert', () => {
    const { s } = drive((x) => x.phase === 'monitoring' && x.monitorReps.length >= 1 && x.alarmRep === null);
    expect(workoutState(s, { ...LIVE, trackingLost: true })).toBe('tracking-lost');
  });
});

describe('after the set', () => {
  it('rest after an alert, set complete without one', () => {
    const { s } = drive((x) => x.phase === 'summary');
    expect(workoutState(s, DEMO)).toBe(s.alarmRep !== null ? 'rest' : 'complete');
    expect(workoutView(s, DEMO).plate).toBe(s.alarmRep !== null ? 'Rest' : 'Set complete');
  });
  it('the recovery check and its result', () => {
    const { engine, demo } = drive((x) => x.phase === 'summary');
    demo.startRecovery();
    for (let i = 0; i < 100000 && engine.getSnapshot().phase !== 'recoveryDone'; i++) demo.advance(1);
    const s = engine.getSnapshot();
    const v = workoutView(s, DEMO);
    expect(v.state).toBe('recovery-done');
    expect(['Back to your usual form', 'Partly back', 'Still different']).toContain(v.plate);
  });
});

describe('the score track', () => {
  it('puts the warning level at 33% and the alert level at 75%, rising with the score', () => {
    const t = { warningLevel: 2, breakpointLevel: 4 };
    expect(scorePosition(2, t)).toBeCloseTo(33);
    expect(scorePosition(4, t)).toBeCloseTo(75);
    const xs = [0, 0.5, 1, 2, 3, 4, 5, 9].map((x) => scorePosition(x, t));
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...xs)).toBeLessThanOrEqual(98);
  });
});
