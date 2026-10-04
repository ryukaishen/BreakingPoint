// Per-rep feature engineering. Each feature carries a quality value (mean
// landmark confidence of the joints it depends on, scaled by how many frames
// were usable) so the drift score can drop or down-weight unreliable measures.

import type { RepFeatures } from './catalog';
import { primaryKneeFlex, type FrameMetrics } from './frameMetrics';
import type { RepWindow } from '../reps/segmenter';

type AngleKey = 'kneeFlexL' | 'kneeFlexR' | 'hipFlexL' | 'hipFlexR' | 'trunkLean';
const MIN_COVERAGE = 0.6;

const meanOf = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

function series(frames: FrameMetrics[], key: AngleKey): { vals: number[]; coverage: number } {
  const vals = frames.map((f) => f[key]).filter((v): v is number => v !== null && Number.isFinite(v));
  return { vals, coverage: frames.length ? vals.length / frames.length : 0 };
}

function rom(frames: FrameMetrics[], key: AngleKey, vis: number): [number | null, number] {
  const { vals, coverage } = series(frames, key);
  if (coverage < MIN_COVERAGE || vals.length < 4) return [null, 0];
  return [Math.max(...vals) - Math.min(...vals), vis * Math.min(1, coverage / 0.9)];
}

function peakExtensionVelocity(frames: FrameMetrics[], from: number, to: number): [number | null, number] {
  const pts = frames
    .filter((f) => f.t >= from - 0.05 && f.t <= to + 0.05)
    .map((f) => ({ t: f.t, k: primaryKneeFlex(f) }))
    .filter((p): p is { t: number; k: number } => p.k !== null);
  if (pts.length < 5) return [null, 0];
  const v: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const dt = pts[i + 1].t - pts[i - 1].t;
    if (dt > 0) v.push(-(pts[i + 1].k - pts[i - 1].k) / dt);
  }
  const sm = v.map((_, i) => meanOf(v.slice(Math.max(0, i - 1), i + 2)));
  return [Math.max(...sm), 1];
}

export function squatFeatures(w: RepWindow): RepFeatures {
  const f = w.frames;
  const visL = meanOf(f.map((x) => x.visL));
  const visR = meanOf(f.map((x) => x.visR));
  const visT = meanOf(f.map((x) => x.visTrunk));
  const q = meanOf(f.map((x) => x.quality));
  const [kL, qL] = rom(f, 'kneeFlexL', visL);
  const [kR, qR] = rom(f, 'kneeFlexR', visR);
  const hipSide: AngleKey = visL >= visR ? 'hipFlexL' : 'hipFlexR';
  const [hip, qHip] = rom(f, hipSide, Math.min(Math.max(visL, visR), visT));
  const trunk = series(f, 'trunkLean');
  const [vel, vq] = peakExtensionVelocity(f, w.tBottom, w.tEnd);
  return {
    values: {
      kneeRomL: kL,
      kneeRomR: kR,
      hipRom: hip,
      depth: w.maxDepth,
      trunkLean: trunk.coverage >= MIN_COVERAGE ? Math.max(...trunk.vals) : null,
      repDuration: w.tEnd - w.tStart,
      eccentricDuration: w.tBottom - w.tStart,
      concentricDuration: w.tEnd - w.tBottom,
      peakVelocity: vel,
      asymmetry: kL !== null && kR !== null ? Math.abs(kL - kR) : null,
    },
    quality: {
      kneeRomL: qL,
      kneeRomR: qR,
      hipRom: qHip,
      depth: q,
      trunkLean: visT * Math.min(1, trunk.coverage / 0.9),
      repDuration: q,
      eccentricDuration: q,
      concentricDuration: q,
      peakVelocity: vq * Math.max(visL, visR),
      asymmetry: Math.min(qL, qR),
    },
  };
}

export function cmjFeatures(w: RepWindow): RepFeatures {
  const f = w.frames;
  const tTake = w.tTakeoff ?? w.tEnd;
  const tLand = w.tLanding ?? w.tEnd;
  const q = meanOf(f.map((x) => x.quality));
  const visL = meanOf(f.map((x) => x.visL));
  const visR = meanOf(f.map((x) => x.visR));
  const visT = meanOf(f.map((x) => x.visTrunk));
  const landing = f.filter((x) => x.t >= tLand && x.t <= tLand + 0.5);
  const pre = f.filter((x) => x.t <= tTake);
  const maxOf = (arr: FrameMetrics[], key: AngleKey) => {
    const s = series(arr, key);
    return s.coverage >= MIN_COVERAGE && s.vals.length ? Math.max(...s.vals) : null;
  };
  const landL = maxOf(landing, 'kneeFlexL');
  const landR = maxOf(landing, 'kneeFlexR');
  const landBest = visL >= visR ? (landL ?? landR) : (landR ?? landL);
  const jump = w.maxRise ?? 0;
  const contraction = tTake - w.tStart;
  return {
    values: {
      jumpHeight: jump,
      rsiMod: contraction > 0 ? jump / contraction : null,
      flightTime: tLand - tTake,
      countermovementDepth: w.maxDepth,
      eccentricDuration: w.tBottom - w.tStart,
      concentricDuration: tTake - w.tBottom,
      trunkLean: maxOf(pre, 'trunkLean'),
      landingKneeFlex: landBest,
      asymmetry: landL !== null && landR !== null ? Math.abs(landL - landR) : null,
    },
    quality: {
      jumpHeight: q,
      rsiMod: q,
      flightTime: q,
      countermovementDepth: q,
      eccentricDuration: q,
      concentricDuration: q,
      trunkLean: visT,
      landingKneeFlex: Math.max(visL, visR),
      asymmetry: Math.min(visL, visR),
    },
  };
}
