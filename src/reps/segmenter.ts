// Rep segmentation from the normalized hip-drop signal
//
//   d(t) = (hipY(t) - standingHipY) / legLength          (0 standing, ~0.4 parallel squat)
//
// Using hip drop normalized by the athlete's own leg length makes segmentation
// independent of camera distance and robust to the viewing angle. The standing
// reference adapts slowly while the athlete stands still.
//
// Squat:  STANDING → DESCENDING → (BOTTOM) → ASCENDING → STANDING  = one rep
// Lunge:  READY → DESCENT → (BOTTOM) → RECOVERY → READY             = one rep
//         (same state machine as the squat; forward step + hip drop)
// CMJ:    STANDING → DIP → PROPULSION → FLIGHT → LANDING → STANDING = one jump
//
// Debouncing: the descent must persist for 2 frames above START, the rep must
// reach MIN_DEPTH and last between MIN_DUR and MAX_DUR, otherwise it is discarded.

import type { FrameMetrics } from '../biomechanics/frameMetrics';

export type RepPhase = 'standing' | 'descending' | 'bottom' | 'ascending' | 'dip' | 'propulsion' | 'flight' | 'landing' | 'lost';

export interface RepWindow {
  frames: FrameMetrics[];
  depth: number[];
  tStart: number;
  tBottom: number;
  tEnd: number;
  maxDepth: number;
  legLength: number;
  // CMJ only
  tTakeoff?: number;
  tLanding?: number;
  maxRise?: number;
}

export interface SegmenterLive {
  phase: RepPhase;
  depth: number;
  calibrated: boolean;
}

const START = 0.1;
const CROSS = 0.06;
const MIN_DEPTH = 0.15;
const MIN_DUR = 0.6;
const MAX_DUR = 8;
const BOTTOM_HYST = 0.03;
const LOST_TIMEOUT = 0.7;
const BUFFER_SECONDS = 12;

interface Sample {
  m: FrameMetrics;
  d: number;
  a: number; // ankle lift (CMJ)
}

abstract class BaseSegmenter {
  phase: RepPhase = 'standing';
  protected standingHipY: number | null = null;
  protected standingAnkleY: number | null = null;
  protected legLen: number | null = null;
  protected buf: Sample[] = [];
  protected lastPresentT = -Infinity;
  protected above = 0;
  protected tStart = 0;
  protected maxD = 0;
  protected tBottom = 0;
  protected lastD = 0;

  get live(): SegmenterLive {
    const shown = this.phase === 'descending' && this.maxD > MIN_DEPTH && this.lastD >= this.maxD - 0.015 ? 'bottom' : this.phase;
    return { phase: shown, depth: this.lastD, calibrated: this.standingHipY !== null && this.legLen !== null };
  }

  reset(): void {
    this.phase = 'standing';
    this.buf = [];
    this.above = 0;
    this.maxD = 0;
  }

  /** Forget the standing reference (e.g. after the camera was moved). */
  recalibrate(): void {
    this.standingHipY = null;
    this.standingAnkleY = null;
    this.legLen = null;
    this.reset();
  }

  protected updateStanding(m: FrameMetrics, d: number): void {
    if (m.hipY === null) return;
    if (Math.abs(d) < 0.06 || this.standingHipY === null) {
      if (this.standingHipY === null) this.standingHipY = m.hipY;
      else {
        const a = m.hipY < this.standingHipY ? 0.25 : 0.06;
        this.standingHipY += a * (m.hipY - this.standingHipY);
      }
      if (m.legLength !== null) this.legLen = this.legLen === null ? m.legLength : this.legLen + 0.05 * (m.legLength - this.legLen);
      if (m.ankleY !== null) this.standingAnkleY = this.standingAnkleY === null ? m.ankleY : this.standingAnkleY + 0.1 * (m.ankleY - this.standingAnkleY);
    }
  }

  /** Interpolated time at which d crossed `level`, scanning backwards from index i. */
  protected crossingBefore(i: number, level: number): number {
    for (let j = i; j > 0; j--) {
      const a = this.buf[j - 1];
      const b = this.buf[j];
      if (a.d < level && b.d >= level) return a.m.t + ((level - a.d) / (b.d - a.d || 1)) * (b.m.t - a.m.t);
    }
    return this.buf[0]?.m.t ?? 0;
  }

  protected windowFrom(t0: number, t1: number): Sample[] {
    return this.buf.filter((s) => s.m.t >= t0 - 1e-6 && s.m.t <= t1 + 1e-6);
  }

  push(m: FrameMetrics): RepWindow | null {
    const ok = m.present && m.hipY !== null;
    if (!ok) {
      if (m.t - this.lastPresentT > LOST_TIMEOUT && this.phase !== 'standing') {
        this.reset();
        this.phase = 'lost';
      }
      return null;
    }
    if (this.phase === 'lost') this.phase = 'standing';
    this.lastPresentT = m.t;
    if (this.standingHipY === null || this.legLen === null) {
      this.updateStanding(m, 0);
      return null;
    }
    const d = ((m.hipY as number) - this.standingHipY) / this.legLen;
    const a = m.ankleY !== null && this.standingAnkleY !== null ? (this.standingAnkleY - m.ankleY) / this.legLen : 0;
    this.lastD = d;
    this.buf.push({ m, d, a });
    while (this.buf.length && m.t - this.buf[0].m.t > BUFFER_SECONDS) this.buf.shift();
    return this.step(m, d, a);
  }

  protected abstract step(m: FrameMetrics, d: number, a: number): RepWindow | null;
}

export interface DescentThresholds {
  start: number;
  cross: number;
  minDepth: number;
  minDur: number;
  maxDur: number;
  bottomHyst: number;
}

/** Squat defaults — the reference implementation; do not change (demo + tests depend on them). */
export const SQUAT_THRESHOLDS: DescentThresholds = {
  start: START, cross: CROSS, minDepth: MIN_DEPTH, minDur: MIN_DUR, maxDur: MAX_DUR, bottomHyst: BOTTOM_HYST,
};

/** Forward lunge: same hip-drop state machine, slightly longer minimum rep (step out + back). */
export const LUNGE_THRESHOLDS: DescentThresholds = { ...SQUAT_THRESHOLDS, minDur: 0.8 };

export class SquatSegmenter extends BaseSegmenter {
  protected th: DescentThresholds;

  constructor(thresholds: DescentThresholds = SQUAT_THRESHOLDS) {
    super();
    this.th = thresholds;
  }

  protected step(m: FrameMetrics, d: number): RepWindow | null {
    const th = this.th;
    switch (this.phase) {
      case 'standing': {
        this.updateStanding(m, d);
        this.above = d > th.start ? this.above + 1 : 0;
        if (this.above >= 2) {
          this.phase = 'descending';
          this.tStart = this.crossingBefore(this.buf.length - 1, th.cross);
          this.maxD = d;
          this.tBottom = m.t;
        }
        return null;
      }
      case 'descending':
      case 'ascending': {
        if (d > this.maxD) {
          this.maxD = d;
          this.tBottom = m.t;
          this.phase = 'descending';
        } else if (this.phase === 'descending' && d < this.maxD - th.bottomHyst) {
          this.phase = 'ascending';
        }
        if (m.t - this.tStart > th.maxDur) {
          // Athlete probably moved / sat down: re-acquire the standing reference.
          this.recalibrate();
          return null;
        }
        if (this.phase === 'ascending' && d < th.cross) {
          const prev = this.buf[this.buf.length - 2];
          const tEnd = prev && prev.d !== d ? prev.m.t + ((th.cross - prev.d) / (d - prev.d)) * (m.t - prev.m.t) : m.t;
          const dur = tEnd - this.tStart;
          const valid = this.maxD >= th.minDepth && dur >= th.minDur && dur <= th.maxDur;
          const win = this.windowFrom(this.tStart, tEnd);
          const out: RepWindow | null = valid
            ? { frames: win.map((s) => s.m), depth: win.map((s) => s.d), tStart: this.tStart, tBottom: this.tBottom, tEnd, maxDepth: this.maxD, legLength: this.legLen as number }
            : null;
          this.phase = 'standing';
          this.above = 0;
          this.maxD = 0;
          return out;
        }
        return null;
      }
      default:
        this.phase = 'standing';
        return null;
    }
  }
}

/** Forward lunge (lead with the same leg each rep). Shares the squat's descent/recovery state machine. */
export class LungeSegmenter extends SquatSegmenter {
  constructor() {
    super(LUNGE_THRESHOLDS);
  }
}

const TAKEOFF = 0.035;
const TOUCHDOWN = 0.015;

export class CmjSegmenter extends BaseSegmenter {
  private tTakeoff = 0;
  private tLanding = 0;
  private maxRise = 0;

  protected step(m: FrameMetrics, d: number, a: number): RepWindow | null {
    switch (this.phase) {
      case 'standing': {
        this.updateStanding(m, d);
        this.above = d > 0.06 ? this.above + 1 : 0;
        if (this.above >= 2) {
          this.phase = 'dip';
          this.tStart = this.crossingBefore(this.buf.length - 1, 0.03);
          this.maxD = d;
          this.tBottom = m.t;
          this.maxRise = 0;
        }
        return null;
      }
      case 'dip':
      case 'propulsion': {
        if (d > this.maxD) {
          this.maxD = d;
          this.tBottom = m.t;
          this.phase = 'dip';
        } else if (d < this.maxD - 0.03) this.phase = 'propulsion';
        if (this.phase === 'propulsion' && a > TAKEOFF) {
          this.phase = 'flight';
          this.tTakeoff = m.t;
        }
        if (m.t - this.tStart > 3) this.reset(); // a dip without a jump
        return null;
      }
      case 'flight': {
        this.maxRise = Math.max(this.maxRise, -d);
        if (a < TOUCHDOWN) {
          this.phase = 'landing';
          this.tLanding = m.t;
        }
        if (m.t - this.tTakeoff > 1.2) this.reset();
        return null;
      }
      case 'landing': {
        const settled = m.t - this.tLanding > 0.45 && Math.abs(d) < 0.08;
        if (settled || m.t - this.tLanding > 1.6) {
          const tEnd = m.t;
          const win = this.windowFrom(this.tStart, tEnd);
          const flight = this.tLanding - this.tTakeoff;
          const valid = this.maxD > 0.08 && flight > 0.12 && flight < 1.0;
          const out: RepWindow | null = valid
            ? {
                frames: win.map((s) => s.m), depth: win.map((s) => s.d), tStart: this.tStart, tBottom: this.tBottom, tEnd,
                maxDepth: this.maxD, legLength: this.legLen as number, tTakeoff: this.tTakeoff, tLanding: this.tLanding, maxRise: this.maxRise,
              }
            : null;
          this.phase = 'standing';
          this.above = 0;
          this.maxD = 0;
          return out;
        }
        return null;
      }
      default:
        this.phase = 'standing';
        return null;
    }
  }
}
