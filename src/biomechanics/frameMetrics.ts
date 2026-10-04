// Per-frame 2D kinematics from smoothed landmarks. Angles are computed in an
// aspect-corrected image plane (x scaled by width/height) and favour quantities
// that are reasonably observable from a sagittal / 30–45° view. A monocular
// camera does not give laboratory-grade 3D joint angles; BreakingPoint only
// compares the athlete with their own baseline captured from the same setup.

import { LM, type Pose } from '../pose/landmarks';

export const VIS_MIN = 0.5;

export interface FrameMetrics {
  t: number;
  present: boolean;
  /** Frame capture quality in [0,1] (landmark confidence × in-frame check). */
  quality: number;
  inFrame: boolean;
  kneeFlexL: number | null;
  kneeFlexR: number | null;
  hipFlexL: number | null;
  hipFlexR: number | null;
  /** Trunk angle from vertical (deg), hip→shoulder. */
  trunkLean: number | null;
  /** Mid-hip vertical position (image-height units, y down). */
  hipY: number | null;
  /** Mean ankle vertical position. */
  ankleY: number | null;
  /** Hip-to-ankle distance (image-height units), most visible side. */
  legLength: number | null;
  visL: number;
  visR: number;
  visTrunk: number;
  /** Horizontal ankle positions (aspect-corrected), null when not visible — used by the lunge primitive. */
  ankleLX: number | null;
  ankleRX: number | null;
}

interface P {
  x: number;
  y: number;
  v: number;
}

const pt = (pose: Pose, i: number, aspect: number): P => ({ x: pose[i].x * aspect, y: pose[i].y, v: pose[i].visibility });

/** Interior angle at b (degrees) formed by a-b-c. */
export function angleAt(a: P, b: P, c: P): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const d = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
  if (d < 1e-9) return NaN;
  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / d));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Angle of the vector from `lower` to `upper` relative to vertical (degrees, 0 = upright). */
export function angleFromVertical(lower: P, upper: P): number {
  const dx = upper.x - lower.x;
  const dy = lower.y - upper.y; // image y grows downward
  return (Math.atan2(Math.abs(dx), dy) * 180) / Math.PI;
}

const flexion = (a: P, b: P, c: P): number | null => {
  if (Math.min(a.v, b.v, c.v) < VIS_MIN) return null;
  const ang = angleAt(a, b, c);
  return Number.isFinite(ang) ? 180 - ang : null;
};

const wavg = (a: P, b: P): P | null => {
  const w = a.v + b.v;
  if (Math.max(a.v, b.v) < VIS_MIN || w <= 0) return null;
  // Prefer the visible landmark; average when both are reliable.
  if (a.v < VIS_MIN) return b;
  if (b.v < VIS_MIN) return a;
  return { x: (a.x * a.v + b.x * b.v) / w, y: (a.y * a.v + b.y * b.v) / w, v: Math.max(a.v, b.v) };
};

export function emptyFrame(t: number): FrameMetrics {
  return {
    t, present: false, quality: 0, inFrame: false, kneeFlexL: null, kneeFlexR: null, hipFlexL: null, hipFlexR: null,
    trunkLean: null, hipY: null, ankleY: null, legLength: null, visL: 0, visR: 0, visTrunk: 0, ankleLX: null, ankleRX: null,
  };
}

export function computeFrameMetrics(pose: Pose | null, t: number, aspect: number): FrameMetrics {
  if (!pose) return emptyFrame(t);
  const g = (i: number) => pt(pose, i, aspect);
  const lS = g(LM.leftShoulder), rS = g(LM.rightShoulder);
  const lH = g(LM.leftHip), rH = g(LM.rightHip);
  const lK = g(LM.leftKnee), rK = g(LM.rightKnee);
  const lA = g(LM.leftAnkle), rA = g(LM.rightAnkle);

  const visL = (lH.v + lK.v + lA.v) / 3;
  const visR = (rH.v + rK.v + rA.v) / 3;
  const visTrunk = (Math.max(lS.v, rS.v) + Math.max(lH.v, rH.v)) / 2;

  const best = [Math.max(lS.v, rS.v), Math.max(lH.v, rH.v), Math.max(lK.v, rK.v), Math.max(lA.v, rA.v)];
  let quality = best.reduce((s, v) => s + v, 0) / best.length;
  const side = visL >= visR ? [LM.leftShoulder, LM.leftHip, LM.leftKnee, LM.leftAnkle] : [LM.rightShoulder, LM.rightHip, LM.rightKnee, LM.rightAnkle];
  const inFrame = side.every((i) => pose[i].x > 0.01 && pose[i].x < 0.99 && pose[i].y > 0.01 && pose[i].y < 0.995);
  if (!inFrame) quality *= 0.5;

  const hip = wavg(lH, rH);
  const sh = wavg(lS, rS);
  const ank = wavg(lA, rA);
  const primaryHip = visL >= visR ? lH : rH;
  const primaryAnk = visL >= visR ? lA : rA;
  const legLength =
    Math.min(primaryHip.v, primaryAnk.v) >= VIS_MIN ? Math.hypot(primaryHip.x - primaryAnk.x, primaryHip.y - primaryAnk.y) : null;

  return {
    t,
    present: true,
    quality,
    inFrame,
    kneeFlexL: flexion(lH, lK, lA),
    kneeFlexR: flexion(rH, rK, rA),
    hipFlexL: flexion(lS, lH, lK),
    hipFlexR: flexion(rS, rH, rK),
    trunkLean: hip && sh ? angleFromVertical(hip, sh) : null,
    hipY: hip ? hip.y : null,
    ankleY: ank ? ank.y : null,
    legLength,
    visL,
    visR,
    visTrunk,
    ankleLX: lA.v >= VIS_MIN ? lA.x : null,
    ankleRX: rA.v >= VIS_MIN ? rA.x : null,
  };
}

export type QualityLabel = 'Excellent' | 'Good' | 'Poor' | 'No athlete';

export function qualityLabel(q: number, present = true): QualityLabel {
  if (!present) return 'No athlete';
  if (q >= 0.85) return 'Excellent';
  if (q >= 0.65) return 'Good';
  return 'Poor';
}

/** Knee flexion from whichever side is more reliable (or their mean). */
export function primaryKneeFlex(m: FrameMetrics): number | null {
  if (m.kneeFlexL !== null && m.kneeFlexR !== null) {
    const w = m.visL + m.visR;
    return (m.kneeFlexL * m.visL + m.kneeFlexR * m.visR) / w;
  }
  return m.kneeFlexL ?? m.kneeFlexR;
}
