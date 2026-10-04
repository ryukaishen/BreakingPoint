// Procedural synthetic athlete for Demo Mode.
//
// Generates MediaPipe-format 33-landmark poses (side view, ~30° rotation so the
// far leg is partly visible) at a fixed 30 Hz simulation clock from per-rep
// kinematic parameters. Demo frames go through the *same* smoothing, kinematics,
// segmentation, feature extraction and detection code as camera frames.
// Everything is seeded, so the demo is identical on every run and machine.

import { LM, NUM_LANDMARKS, type Pose } from '../pose/landmarks';
import { gaussian, mulberry32 } from '../utils/stats';

export interface RepSpec {
  kind: 'squat' | 'cmj';
  /** Squat depth scale (1 ≈ parallel). */
  depth: number;
  /** Extra forward trunk lean at the bottom (deg). */
  trunk: number;
  ecc: number;
  conc: number;
  pause: number;
  rest: number;
  /** Fractional reduction of far-leg flexion (asymmetry). */
  asym: number;
  /** CMJ flight time (s). */
  flight?: number;
}

export const FPS = 30;
const DT = 1 / FPS;
const SHANK = 0.205;
const THIGH = 0.215;
const TRUNK = 0.27;
const NECK = 0.075;
const UPPER_ARM = 0.15;
const FOREARM = 0.135;
const FLOOR = 0.885;
const FAR_DX = 0.022;
const FAR_DY = -0.008;
const UNITS_PER_METER = 0.47;

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const rad = (d: number) => (d * Math.PI) / 180;

interface Kin {
  p: number; // squat phase 0..1
  depth: number;
  trunk: number;
  asym: number;
  lift: number; // whole-body vertical lift (CMJ flight), image units
  heel: number; // heel raise (plantarflexion), image units
  arms: number; // arm swing 0..1
}

export class SyntheticAthlete {
  t = 0;
  private queue: RepSpec[] = [];
  private cur: RepSpec | null = null;
  private tRep = 0;
  private rand: () => number;
  private noise: number;

  constructor(
    seed = 7,
    private aspect = 16 / 9,
    noise = 0.0022,
  ) {
    this.rand = mulberry32(seed);
    this.noise = noise;
  }

  enqueue(...specs: RepSpec[]) {
    this.queue.push(...specs);
  }

  get busy(): boolean {
    return this.cur !== null || this.queue.length > 0;
  }

  get pending(): number {
    return this.queue.length + (this.cur ? 1 : 0);
  }

  /** Advance the simulation clock by one frame and return the pose. */
  next(): { t: number; pose: Pose } {
    this.t += DT;
    if (!this.cur && this.queue.length) {
      this.cur = this.queue.shift() as RepSpec;
      this.tRep = 0;
    }
    let k: Kin = { p: 0, depth: 1, trunk: 0, asym: 0.04, lift: 0, heel: 0, arms: 0 };
    if (this.cur) {
      this.tRep += DT;
      const r = this.cur;
      const res = r.kind === 'squat' ? this.squatKin(r, this.tRep) : this.cmjKin(r, this.tRep);
      k = res.kin;
      if (res.done) this.cur = null;
    }
    return { t: this.t, pose: this.pose(k) };
  }

  private squatKin(r: RepSpec, t: number): { kin: Kin; done: boolean } {
    const t1 = r.ecc;
    const t2 = t1 + r.pause;
    const t3 = t2 + r.conc;
    const t4 = t3 + r.rest;
    let p = 0;
    if (t < t1) p = ease(t / t1);
    else if (t < t2) p = 1;
    else if (t < t3) p = 1 - ease((t - t2) / r.conc);
    return { kin: { p, depth: r.depth, trunk: r.trunk, asym: r.asym, lift: 0, heel: 0, arms: p }, done: t >= t4 };
  }

  private cmjKin(r: RepSpec, t: number): { kin: Kin; done: boolean } {
    const dipDepth = 0.62 * r.depth;
    const flight = r.flight ?? 0.5;
    const h = (9.81 * flight * flight) / 8; // flight-time jump height (m)
    const t1 = r.ecc;
    const t2 = t1 + r.conc;
    const t3 = t2 + flight;
    const t4 = t3 + 0.22; // landing absorption
    const t5 = t4 + 0.45; // stand up
    const t6 = t5 + r.rest;
    const base: Kin = { p: 0, depth: 1, trunk: r.trunk, asym: r.asym, lift: 0, heel: 0, arms: 0 };
    if (t < t1) return { kin: { ...base, p: dipDepth * ease(t / t1), arms: -0.6 * ease(t / t1) }, done: false };
    if (t < t2) {
      const u = (t - t1) / r.conc;
      return { kin: { ...base, p: dipDepth * (1 - ease(u)), heel: 0.008 * ease(u), arms: -0.6 + 1.5 * ease(u) }, done: false };
    }
    if (t < t3) {
      const u = (t - t2) / flight;
      return { kin: { ...base, lift: 4 * h * UNITS_PER_METER * u * (1 - u), heel: 0.01, arms: 0.9 }, done: false };
    }
    if (t < t4) return { kin: { ...base, p: 0.42 * r.depth * ease((t - t3) / 0.22), arms: 0.5 }, done: false };
    if (t < t5) return { kin: { ...base, p: 0.42 * r.depth * (1 - ease((t - t4) / 0.45)), arms: 0.3 }, done: false };
    return { kin: base, done: t >= t6 };
  }

  private pose(k: Kin): Pose {
    const n = () => gaussian(this.rand) * this.noise;
    const sway = 0.0025 * Math.sin(this.t * 1.7);
    const pts: { x: number; y: number; v: number }[] = Array.from({ length: NUM_LANDMARKS }, () => ({ x: 0, y: 0, v: 0.2 }));

    const chain = (dx: number, dy: number, flexScale: number) => {
      const aS = rad(k.p * 38 * Math.pow(k.depth, 0.8) * flexScale);
      const aT = rad(k.p * 92 * k.depth * flexScale);
      const ankle = { x: dx, y: FLOOR + dy - k.lift - k.heel };
      const knee = { x: ankle.x + SHANK * Math.sin(aS), y: ankle.y - SHANK * Math.cos(aS) };
      const hip = { x: knee.x - THIGH * Math.sin(aT), y: knee.y - THIGH * Math.cos(aT) };
      const heel = { x: ankle.x - 0.035, y: ankle.y + 0.018 - k.heel * 0.6 };
      const toe = { x: ankle.x + 0.075, y: FLOOR + dy + 0.022 - k.lift };
      return { ankle, knee, hip, heel, toe };
    };
    const near = chain(0, 0, 1);
    const far = chain(FAR_DX, FAR_DY, 1 - k.asym * k.p);
    const aTr = rad(6 + k.p * (28 + k.trunk));
    const sh = { x: near.hip.x + TRUNK * Math.sin(aTr) + sway, y: near.hip.y - TRUNK * Math.cos(aTr) };
    const shFar = { x: sh.x + FAR_DX, y: sh.y + FAR_DY };
    const head = { x: sh.x + NECK * Math.sin(aTr * 0.6), y: sh.y - NECK * Math.cos(aTr * 0.6) - 0.03 };
    const armA = rad(15 + k.arms * 75);
    const arm = (s: { x: number; y: number }) => {
      const e = { x: s.x + UPPER_ARM * Math.sin(armA), y: s.y + UPPER_ARM * Math.cos(armA) };
      const w = { x: e.x + FOREARM * Math.sin(armA + rad(12)), y: e.y + FOREARM * Math.cos(armA + rad(12)) };
      return { e, w };
    };
    const armN = arm(sh);
    const armF = arm(shFar);

    const vn = () => Math.min(0.995, 0.965 + gaussian(this.rand) * 0.012);
    const vf = () => Math.min(0.95, 0.8 + gaussian(this.rand) * 0.03);
    const set = (i: number, p: { x: number; y: number }, v: number) => (pts[i] = { x: p.x, y: p.y, v });

    set(LM.nose, { x: head.x + 0.04, y: head.y + 0.01 }, vn());
    set(LM.leftEar, { x: head.x - 0.005, y: head.y - 0.004 }, vn());
    set(LM.rightEar, { x: head.x + FAR_DX - 0.005, y: head.y - 0.004 + FAR_DY }, 0.35);
    set(LM.leftShoulder, sh, vn());
    set(LM.rightShoulder, shFar, vf());
    set(LM.leftElbow, armN.e, vn());
    set(LM.rightElbow, armF.e, vf() - 0.1);
    set(LM.leftWrist, armN.w, vn());
    set(LM.rightWrist, armF.w, vf() - 0.12);
    set(LM.leftHip, near.hip, vn());
    set(LM.rightHip, far.hip, vf());
    set(LM.leftKnee, near.knee, vn());
    set(LM.rightKnee, far.knee, vf());
    set(LM.leftAnkle, near.ankle, vn());
    set(LM.rightAnkle, far.ankle, vf());
    set(LM.leftHeel, near.heel, vn());
    set(LM.rightHeel, far.heel, vf());
    set(LM.leftFoot, near.toe, vn());
    set(LM.rightFoot, far.toe, vf());
    // remaining face points: cluster at the head with low visibility
    for (let i = 1; i <= 10; i++) if (i !== 7 && i !== 8) pts[i] = { x: head.x + 0.02, y: head.y, v: 0.3 };
    for (const i of [17, 18, 19, 20, 21, 22]) pts[i] = { ...(i % 2 ? armN.w : armF.w), v: 0.4 };

    const cx = 0.02;
    return pts.map((p) => ({ x: 0.5 + (p.x - cx) / this.aspect + n(), y: p.y + n(), visibility: p.v }));
  }
}
