// Phase 4A.5: experimental signal chains, kept apart from the app.
//
// Every variant runs the app's own frame metrics, rep segmenter and rep measurements, imported
// unchanged from src/. Only the landmark smoothing in front of them differs, and nothing here is
// used by the app. The "production" variant is the app's path exactly (One Euro smoothing from
// src/pose/smoothing.ts); tests/measurement_variants.test.ts checks that it gives the same reps and
// measurements as research/evaluation/offlinePipeline.ts, which in turn matches the app's engine.
//
// Variants (fixed before any result was looked at):
//   production   One Euro, min cutoff 1.2 Hz, beta 0.05, derivative cutoff 1 Hz (the app)
//   none         no smoothing
//   butter6      causal 2nd-order Butterworth low-pass at 6 Hz on every landmark coordinate
//                (6 Hz is the usual cutoff for human-movement kinematics; causal, so usable live)
//   dual_none    rep timing and amplitudes from unsmoothed landmarks; angle measurements from
//                the production smoothing, read at those times
//   dual_butter6 rep timing and amplitudes from the 6 Hz Butterworth; angles as in production

import { computeFrameMetrics, type FrameMetrics } from '../../src/biomechanics/frameMetrics';
import type { ExerciseType, RepFeatures } from '../../src/biomechanics/catalog';
import type { Pose } from '../../src/pose/landmarks';
import { OneEuroFilter, PoseSmoother } from '../../src/pose/smoothing';
import type { RepWindow } from '../../src/reps/segmenter';
import { featuresFor, segmenterFor } from '../evaluation/offlinePipeline';

export interface Smoother {
  smooth(pose: Pose, t: number): Pose;
  reset(): void;
}

export class NoSmoothing implements Smoother {
  smooth(pose: Pose): Pose {
    return pose;
  }
  reset(): void {}
}

/** Causal 2nd-order Butterworth low-pass (bilinear transform with pre-warping), one per coordinate. */
export class Butterworth2 {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private started = false;
  constructor(private cutoffHz: number) {}

  filter(x: number, dt: number): number {
    if (!this.started) {
      // Start at rest on the first value, so there is no start-up transient.
      this.x1 = this.x2 = this.y1 = this.y2 = x;
      this.started = true;
      return x;
    }
    const k = Math.tan((Math.PI * this.cutoffHz) * dt);
    const norm = 1 / (1 + Math.SQRT2 * k + k * k);
    const b0 = k * k * norm;
    const a1 = 2 * (k * k - 1) * norm;
    const a2 = (1 - Math.SQRT2 * k + k * k) * norm;
    const y = b0 * x + 2 * b0 * this.x1 + b0 * this.x2 - a1 * this.y1 - a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

export class ButterworthSmoother implements Smoother {
  private fx: Butterworth2[] = [];
  private fy: Butterworth2[] = [];
  private lastT: number | null = null;
  constructor(private cutoffHz = 6) {}

  smooth(pose: Pose, t: number): Pose {
    // Same gap rule as the app's PoseSmoother.
    if (this.lastT !== null && t - this.lastT > 0.5) this.reset();
    const dt = this.lastT === null ? 0 : t - this.lastT;
    this.lastT = t;
    return pose.map((p, i) => {
      if (!this.fx[i]) {
        this.fx[i] = new Butterworth2(this.cutoffHz);
        this.fy[i] = new Butterworth2(this.cutoffHz);
      }
      return { x: this.fx[i].filter(p.x, dt), y: this.fy[i].filter(p.y, dt), z: p.z, visibility: p.visibility };
    });
  }

  reset(): void {
    this.fx = [];
    this.fy = [];
    this.lastT = null;
  }
}

export type VariantId = 'production' | 'none' | 'butter6' | 'dual_none' | 'dual_butter6';
export const VARIANTS: VariantId[] = ['production', 'none', 'butter6', 'dual_none', 'dual_butter6'];

/** Event path: the landmarks the segmenter (timing, depth, rise) sees. Feature path: angle measurements. */
export function smoothersFor(v: VariantId): { event: () => Smoother; feature: (() => Smoother) | null } {
  switch (v) {
    case 'production':
      return { event: () => new PoseSmoother(), feature: null };
    case 'none':
      return { event: () => new NoSmoothing(), feature: null };
    case 'butter6':
      return { event: () => new ButterworthSmoother(6), feature: null };
    case 'dual_none':
      return { event: () => new NoSmoothing(), feature: () => new PoseSmoother() };
    case 'dual_butter6':
      return { event: () => new ButterworthSmoother(6), feature: () => new PoseSmoother() };
  }
}

/** Small seeded generator (mulberry32) with Box-Muller normals, so noise runs repeat exactly. */
export function gaussian(seed: number): () => number {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    while (u <= 1e-12) u = uniform();
    const v = uniform();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}

/** Stable 32-bit hash of a string, to give every recording its own noise seed. */
export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export interface Noise {
  /** Standard deviation of landmark jitter in image heights (x is scaled so the jitter is round in pixels). */
  sigma: number;
  seed: number;
}

export interface VariantRep {
  tStart: number;
  tBottom: number;
  tEnd: number;
  tTakeoff: number | null;
  tLanding: number | null;
  maxDepth: number;
  maxRise: number | null;
  legLength: number;
  closedInHeldFrames: boolean;
  features: RepFeatures['values'];
  /** The app's per-measurement quality (feeds the score's weights); kept apart so `features` stays the values only. */
  quality: RepFeatures['quality'];
}

export interface VariantResult {
  standingFound: boolean;
  phaseLog: [number, string][];
  reps: VariantRep[];
}

/** Add jitter to every landmark (a new pose; the input is not changed). */
export function jitter(pose: Pose, aspect: number, sigma: number, normal: () => number): Pose {
  return pose.map((p) => ({ ...p, x: p.x + (sigma / aspect) * normal(), y: p.y + sigma * normal() }));
}

/**
 * Run one continuous recording through a variant. Same hold-last-frame rule as extractRecording.
 * With a separate feature path, the rep window keeps the event path's timing, depth and rise, and
 * its frames are replaced by the feature path's frames at the same instants.
 */
export function runVariant(
  recorded: readonly Pose[],
  recordedTimes: readonly number[],
  aspect: number,
  exercise: ExerciseType,
  variant: VariantId,
  holdLastFrameSeconds = 0,
  noise: Noise | null = null,
): VariantResult {
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
  const normal = noise && noise.sigma > 0 ? gaussian(noise.seed) : null;
  const { event, feature } = smoothersFor(variant);
  const ev = event();
  const ft = feature ? feature() : null;
  const segmenter = segmenterFor(exercise);
  const extract = featuresFor(exercise);
  const featureAt = new Map<number, FrameMetrics>(); // feature-path frame by time
  const reps: VariantRep[] = [];
  const phaseLog: [number, string][] = [];
  let lastPhase = '';
  for (let i = 0; i < poses.length; i++) {
    const t = times[i];
    // Held frames repeat the last pose; they get the same noise draw as a real frame would.
    const pose = normal ? jitter(poses[i], aspect, noise!.sigma, normal) : poses[i];
    const m = computeFrameMetrics(ev.smooth(pose, t), t, aspect);
    if (ft) featureAt.set(t, computeFrameMetrics(ft.smooth(pose, t), t, aspect));
    const win = segmenter.push(m);
    if (segmenter.phase !== lastPhase) {
      lastPhase = segmenter.phase;
      phaseLog.push([Math.round(t * 1000) / 1000, lastPhase]);
    }
    if (!win) continue;
    const w: RepWindow = ft ? { ...win, frames: win.frames.map((f) => featureAt.get(f.t) ?? f) } : win;
    const measured = extract(w);
    reps.push({
      tStart: win.tStart,
      tBottom: win.tBottom,
      tEnd: win.tEnd,
      tTakeoff: win.tTakeoff ?? null,
      tLanding: win.tLanding ?? null,
      maxDepth: win.maxDepth,
      maxRise: win.maxRise ?? null,
      legLength: win.legLength,
      closedInHeldFrames: win.tEnd > lastT + 1e-9,
      features: measured.values,
      quality: measured.quality,
    });
  }
  return { standingFound: segmenter.live.calibrated, phaseLog, reps };
}

/**
 * A copy of the app's One Euro filter that also reports the cutoff it used at each step, so the lag
 * can be explained. tests/measurement_variants.test.ts checks it returns exactly what
 * src/pose/smoothing.ts returns.
 */
export class TracedOneEuro {
  private inner: OneEuroFilter;
  private y: number | null = null;
  private dx: number | null = null;
  private tPrev: number | null = null;
  lastCutoff = 0;
  constructor(
    private minCutoff = 1.2,
    private beta = 0.05,
    private dCutoff = 1.0,
  ) {
    this.inner = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  filter(value: number, t: number): number {
    const out = this.inner.filter(value, t);
    // Recompute the cutoff the way OneEuroFilter does (same formulas, same order).
    const alphaFor = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff) / dt);
    if (this.tPrev === null) {
      this.tPrev = t;
      this.dx = 0;
      this.y = value;
      this.lastCutoff = this.minCutoff;
      return out;
    }
    const dt = Math.max(1e-3, t - this.tPrev);
    this.tPrev = t;
    const dValue = (value - (this.y as number)) / dt;
    const a = alphaFor(this.dCutoff, dt);
    this.dx = a * dValue + (1 - a) * (this.dx as number);
    this.lastCutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.y = out;
    return out;
  }
}
