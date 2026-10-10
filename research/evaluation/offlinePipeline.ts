// Offline version of the app's frame path, for recorded landmark streams.
//
// For one continuous recording it does exactly what the live app does within one phase of a
// session (src/session/pipeline.ts PosePipeline.push, then src/session/engine.ts pushFrame and
// onRep): One Euro smoothing, per-frame kinematics, rep segmentation, and the movement's rep
// features. It imports those functions from src/ and changes none of them. The only thing it
// leaves out is the engine's phase logic (calibrate, monitor, recover), which does not affect
// how a rep is found or measured. tests/research_pipeline.test.ts checks that this path gives
// the same reps and features as the app's engine.

import type { ExerciseType, RepFeatures } from '../../src/biomechanics/catalog';
import { computeFrameMetrics } from '../../src/biomechanics/frameMetrics';
import { cmjFeatures, lungeFeatures, squatFeatures } from '../../src/biomechanics/repFeatures';
import { NUM_LANDMARKS, type Pose } from '../../src/pose/landmarks';
import { PoseSmoother } from '../../src/pose/smoothing';
import { CmjSegmenter, LungeSegmenter, SquatSegmenter, type RepWindow } from '../../src/reps/segmenter';

export interface OfflineRep {
  index: number;
  tStart: number;
  tBottom: number;
  tEnd: number;
  tTakeoff: number | null;
  tLanding: number | null;
  maxDepth: number;
  maxRise: number | null;
  legLength: number;
  /** True when the rep only closed during the held frames after the recording ended. */
  closedInHeldFrames: boolean;
  /** Mean frame quality over the rep, as the engine computes it. */
  quality: number;
  features: RepFeatures;
}

export interface OfflineResult {
  frames: number;
  /** Frames appended by holding the last recorded pose (see extractRecording). */
  heldFrames: number;
  framesPresent: number;
  framesInFrame: number;
  meanFrameQuality: number;
  /** Whether the segmenter found a standing reference (it needs a still stand at the start). */
  standingFound: boolean;
  /** Every change of segmenter phase as [time s, phase], to explain recordings where no rep was found. */
  phaseLog: [number, string][];
  reps: OfflineRep[];
}

/** The same choices SessionEngine makes in its constructor. */
export function segmenterFor(exercise: ExerciseType) {
  return exercise === 'squat' ? new SquatSegmenter() : exercise === 'lunge' ? new LungeSegmenter() : new CmjSegmenter();
}

export function featuresFor(exercise: ExerciseType): (w: RepWindow) => RepFeatures {
  return exercise === 'squat' ? squatFeatures : exercise === 'lunge' ? lungeFeatures : cmjFeatures;
}

/** A flat [x0, y0, v0, x1, y1, v1, ...] frame as a Pose. */
export function poseFromFlat(flat: readonly number[]): Pose {
  if (flat.length !== NUM_LANDMARKS * 3) throw new Error(`expected ${NUM_LANDMARKS * 3} numbers per frame, got ${flat.length}`);
  const pose: Pose = [];
  for (let i = 0; i < NUM_LANDMARKS; i++) pose.push({ x: flat[3 * i], y: flat[3 * i + 1], visibility: flat[3 * i + 2] });
  return pose;
}

/**
 * Run one continuous recording through the app's frame path. `times` are in seconds.
 *
 * `holdLastFrameSeconds` appends copies of the last pose. Recorded trials can end while the
 * athlete is still landing; live, the athlete would keep standing and the segmenter would close
 * the jump. Holding the last pose lets it close through its own timeout. A rep that closes in
 * the held frames is marked, and the caller must check that its measurements do not use them.
 */
export function extractRecording(
  recorded: readonly (Pose | null)[],
  recordedTimes: readonly number[],
  aspect: number,
  exercise: ExerciseType,
  holdLastFrameSeconds = 0,
): OfflineResult {
  if (recorded.length !== recordedTimes.length) throw new Error('poses and times differ in length');
  const poses = [...recorded];
  const times = [...recordedTimes];
  const lastT = times.length ? times[times.length - 1] : 0;
  if (holdLastFrameSeconds > 0 && times.length >= 2) {
    const dt = times[times.length - 1] - times[times.length - 2];
    const last = poses[poses.length - 1];
    for (let k = 1; k * dt <= holdLastFrameSeconds + 1e-9; k++) {
      poses.push(last);
      times.push(lastT + k * dt);
    }
  }
  const heldFrames = poses.length - recorded.length;
  const smoother = new PoseSmoother();
  const segmenter = segmenterFor(exercise);
  const extract = featuresFor(exercise);
  const reps: OfflineRep[] = [];
  let present = 0;
  let inFrame = 0;
  let qualitySum = 0;
  const phaseLog: [number, string][] = [];
  let lastPhase = '';
  for (let i = 0; i < poses.length; i++) {
    const pose = poses[i];
    const t = times[i];
    // PosePipeline.push
    const smoothed = pose ? smoother.smooth(pose, t) : null;
    if (!pose) smoother.reset();
    const m = computeFrameMetrics(smoothed, t, aspect);
    if (m.present) present++;
    if (m.inFrame) inFrame++;
    qualitySum += m.quality;
    // SessionEngine.pushFrame -> onRep
    const win = segmenter.push(m);
    if (segmenter.phase !== lastPhase) {
      lastPhase = segmenter.phase;
      phaseLog.push([Math.round(t * 1000) / 1000, lastPhase]);
    }
    if (!win) continue;
    reps.push({
      index: reps.length + 1,
      tStart: win.tStart,
      tBottom: win.tBottom,
      tEnd: win.tEnd,
      tTakeoff: win.tTakeoff ?? null,
      tLanding: win.tLanding ?? null,
      maxDepth: win.maxDepth,
      maxRise: win.maxRise ?? null,
      legLength: win.legLength,
      closedInHeldFrames: win.tEnd > lastT + 1e-9,
      quality: win.frames.reduce((s, f) => s + f.quality, 0) / Math.max(1, win.frames.length),
      features: extract(win),
    });
  }
  return {
    frames: recorded.length,
    heldFrames,
    framesPresent: present,
    framesInFrame: inFrame,
    meanFrameQuality: poses.length ? qualitySum / poses.length : 0,
    standingFound: segmenter.live.calibrated,
    phaseLog,
    reps,
  };
}
