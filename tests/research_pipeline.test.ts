// The offline research pipeline must measure reps exactly as the app does. The demo's
// synthetic athlete is recorded during calibration and replayed through
// research/evaluation/offlinePipeline.ts; every rep and every feature must match what the
// app's SessionEngine recorded from the same frames.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import type { Pose } from '../src/pose/landmarks';
import { DEFAULT_DETECTOR_CONFIG, parseDetectorConfig } from '../src/detection/config';
import { DemoController } from '../src/demo/demoController';
import { SessionEngine } from '../src/session/engine';
import { extractRecording, poseFromFlat } from '../research/evaluation/offlinePipeline';

const cfg = existsSync('public/breakingpoint_detector_config.json')
  ? parseDetectorConfig(JSON.parse(readFileSync('public/breakingpoint_detector_config.json', 'utf8')))
  : DEFAULT_DETECTOR_CONFIG;

describe.each(['squat', 'cmj', 'lunge'] as const)('offline pipeline matches the app (%s demo)', (exercise) => {
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
  const app = engine.getSnapshot().calibrationReps;
  const offline = extractRecording(poses, times, 16 / 9, exercise);

  it('finds the same calibration reps', () => {
    expect(app.length).toBeGreaterThanOrEqual(5);
    expect(offline.reps.length).toBe(app.length);
    expect(offline.standingFound).toBe(true);
  });

  it('gives identical rep timing, quality and features', () => {
    offline.reps.forEach((r, i) => {
      const a = app[i];
      expect(r.tStart).toBe(a.tStart);
      expect(r.tBottom).toBe(a.tBottom);
      expect(r.tEnd).toBe(a.tEnd);
      expect(r.quality).toBe(a.quality);
      expect(r.features).toEqual(a.features);
    });
  });
});

describe('poseFromFlat', () => {
  it('reads 33 landmarks of [x, y, visibility]', () => {
    const flat = Array.from({ length: 99 }, (_, i) => i / 100);
    const p = poseFromFlat(flat);
    expect(p).toHaveLength(33);
    expect(p[11]).toEqual({ x: 0.33, y: 0.34, visibility: 0.35 });
    expect(() => poseFromFlat(flat.slice(1))).toThrow();
  });
});
