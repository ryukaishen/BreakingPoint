// Phase 4B scoring helpers (research only).
//
// Every score is the app's own Form Change Score: buildFeatureBaselines and driftScore from src/,
// called unchanged with the shipped detector config. An ablation passes a shorter list of
// measurements to those functions; under the shipped grouped_quality weighting that is identical to
// giving the removed measurements weight 0 (tests/phase4b_scoring.test.ts checks this). Nothing here
// changes the shipped weights, the catalog or the detector.

import { buildFeatureBaselines, featureBaseline, type FeatureBaseline } from '../../src/baseline/baseline';
import { featureSpecs, type ExerciseType, type FeatureSpec, type RepFeatures } from '../../src/biomechanics/catalog';
import type { DetectorConfig } from '../../src/detection/config';
import { driftScore } from '../../src/detection/driftScore';

/** Jump scores fixed by protocol v04 (S0 = shipped; the others are experimental ablations). */
export const JUMP_SCORES: Record<string, string[]> = {
  S0: [],
  'S-P2': ['flightTime'],
  'S-P3': ['asymmetry'],
  'S-P2P3': ['flightTime', 'asymmetry'],
  'S-valid': ['flightTime', 'asymmetry', 'concentricDuration'],
};

/** Jump measurements interpreted in Phase 4B (passed the Phase 4A.5 agreement criteria). */
export const JUMP_INTERPRETED = ['jumpHeight', 'countermovementDepth', 'trunkLean', 'landingKneeFlex', 'rsiMod', 'eccentricDuration'];
export const JUMP_NOT_INTERPRETED = ['flightTime', 'concentricDuration', 'asymmetry'];
/** Squat measurements interpreted in Phase 4B, and the status of the others (Phase 4A.5). */
export const SQUAT_INTERPRETED = ['trunkLean', 'depth', 'hipRom', 'kneeRomL'];
export const SQUAT_STATUS: Record<string, string> = {
  trunkLean: 'passed', depth: 'passed', hipRom: 'passed', kneeRomL: 'passed',
  repDuration: 'failed', asymmetry: 'failed',
  kneeRomR: 'not checked', eccentricDuration: 'not checked', concentricDuration: 'not checked', peakVelocity: 'not checked',
};

export type Cfg = Pick<DetectorConfig, 'zClip' | 'featureWeighting' | 'missingHandling' | 'qualityMin' | 'minCoverage'>;

/** The shipped measurements for an exercise, minus the ones an ablation removes. */
export function specsFor(exercise: ExerciseType, remove: readonly string[] = []): FeatureSpec[] {
  return featureSpecs(exercise).filter((s) => !remove.includes(s.key));
}

/** Baselines from reference reps, then the app's raw Form Change Score for each rep (null when unscored). */
export function scoreAgainst(reference: readonly RepFeatures[], reps: readonly RepFeatures[], specs: readonly FeatureSpec[], cfg: Cfg): (number | null)[] {
  const fb = buildFeatureBaselines(reference, specs, cfg.qualityMin);
  return reps.map((r) => driftScore(r, fb, specs, cfg).score);
}

/** All ways to choose k of n indices, in lexicographic order. */
export function combinations(n: number, k: number): number[][] {
  const out: number[][] = [];
  const pick = (start: number, acc: number[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < n; i++) pick(i + 1, [...acc, i]);
  };
  pick(0, []);
  return out;
}

const meanOf = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export interface SplitResult {
  /** Mean comparison-set score for each reference choice, in the order of combinations(6, 3). */
  splitMeans: (number | null)[];
  /** Index of the split whose reference set is exactly the "fresh" reps. */
  trueSplit: number;
}

/**
 * Personal-baseline separation (protocol J-A): every 3-of-6 reference set, baseline from those three,
 * mean score of the other three. `fresh` gives the indices (into reps) labelled fresh.
 */
export function personalSplits(reps: readonly RepFeatures[], fresh: readonly number[], specs: readonly FeatureSpec[], cfg: Cfg): SplitResult {
  if (reps.length !== 6 || fresh.length !== 3) throw new Error('personal splits need exactly 3 + 3 reps');
  const combos = combinations(6, 3);
  const key = [...fresh].sort((a, b) => a - b).join(',');
  const splitMeans = combos.map((ref) => {
    const comp = [0, 1, 2, 3, 4, 5].filter((i) => !ref.includes(i));
    const s = scoreAgainst(ref.map((i) => reps[i]), comp.map((i) => reps[i]), specs, cfg).filter((x): x is number => x !== null);
    return s.length ? meanOf(s) : null;
  });
  return { splitMeans, trueSplit: combos.findIndex((c) => c.join(',') === key) };
}

/** Rank of entry i among the values (1 = largest), ties sharing the average rank; nulls rank last. */
export function rankOf(values: readonly (number | null)[], i: number): number | null {
  const v = values[i];
  if (v === null) return null;
  const valid = values.filter((x): x is number => x !== null);
  const greater = valid.filter((x) => x > v).length;
  const equal = valid.filter((x) => x === v).length;
  return greater + (equal + 1) / 2;
}

/** The app's per-measurement spread (scale) from reference values, with its noise floors; null below 3 values. */
export function appScale(values: readonly number[], spec: FeatureSpec): number | null {
  const b: FeatureBaseline | null = featureBaseline(values, spec);
  return b ? b.scale : null;
}

/**
 * Change from the first group to the second in one measurement (Δ = mean of the second - mean of the first),
 * standardized two ways:
 *   dz    (analysis v2, reported): Δ over the mean of the app's spread in the two groups. Swapping the groups
 *         flips its sign exactly, so it is centred on 0 when the labels do not matter.
 *   dz_v1 (analysis v1, superseded): Δ over the first group's spread only; not centred on 0 under random labels.
 */
export function standardizedChange(spec: FeatureSpec, first: readonly RepFeatures[], second: readonly RepFeatures[]) {
  const vals = (fs: readonly RepFeatures[]) => fs.map((x) => x.values[spec.key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const fv = vals(first);
  const sv = vals(second);
  const delta = fv.length && sv.length ? meanOf(sv) - meanOf(fv) : null;
  const s1 = appScale(fv, spec);
  const s2 = appScale(sv, spec);
  return {
    first: fv, second: sv, delta, scale_first: s1, scale_second: s2,
    dz: delta !== null && s1 && s2 ? delta / ((s1 + s2) / 2) : null,
    dz_v1: delta !== null && s1 ? delta / s1 : null,
  };
}

/** (mean of the second group - mean of the first) over the app's spread of both groups pooled (label-free), as used
 * for REHAB24-6 standardized differences in analysis v2; v1 divided by the first group's spread. */
export function pooledStandardizedDifference(spec: FeatureSpec, first: readonly RepFeatures[], second: readonly RepFeatures[]) {
  const vals = (fs: readonly RepFeatures[]) => fs.map((x) => x.values[spec.key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const fv = vals(first);
  const sv = vals(second);
  const diff = fv.length && sv.length ? meanOf(sv) - meanOf(fv) : null;
  const pooled = appScale([...fv, ...sv], spec);
  const s1 = appScale(fv, spec);
  return { v2: diff !== null && pooled ? diff / pooled : null, v1: diff !== null && s1 ? diff / s1 : null };
}

/** Seeded generator (mulberry32) and an in-place Fisher-Yates shuffle, for label shuffling. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Shuffle labels within one person: the same items, the same number in each group, randomly reassigned.
 * Returns the new groups in the same order as the input groups.
 */
export function shuffleWithin<T>(groups: readonly (readonly T[])[], seed: number, who: string): T[][] {
  const pool = groups.flat();
  const r = rng((seed ^ hashString(who)) >>> 0);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out: T[][] = [];
  let k = 0;
  for (const g of groups) {
    out.push(pool.slice(k, k + g.length));
    k += g.length;
  }
  return out;
}

/** Scores from a personal leave-one-correct-rep-out design: fold k holds correct rep k out, builds the
 * baseline from the other correct reps, and scores the held-out rep and every incorrect rep against it. */
export interface LooFolds {
  heldout: (number | null)[];
  incorrectByFold: (number | null)[][];
}

export function personalLooFolds(correct: readonly RepFeatures[], incorrect: readonly RepFeatures[], specs: readonly FeatureSpec[], cfg: Cfg): LooFolds {
  const heldout: (number | null)[] = [];
  const incorrectByFold: (number | null)[][] = [];
  correct.forEach((c, k) => {
    const s = scoreAgainst(correct.filter((_, j) => j !== k), [c, ...incorrect], specs, cfg);
    heldout.push(s[0]);
    incorrectByFold.push(s.slice(1));
  });
  return { heldout, incorrectByFold };
}

/** P(pos > neg) + 0.5 P(pos = neg) over all pairs; null when either side is empty. */
export function aucPairs(pos: readonly (number | null)[], neg: readonly (number | null)[]): number | null {
  const p = pos.filter((x): x is number => x !== null);
  const n = neg.filter((x): x is number => x !== null);
  if (!p.length || !n.length) return null;
  let s = 0;
  for (const a of p) for (const b of n) s += a > b ? 1 : a === b ? 0.5 : 0;
  return s / (p.length * n.length);
}

/** Analysis v1 construction (superseded): each incorrect rep's scores averaged over folds, against the held-out scores. */
export function aucFoldAveraged(f: LooFolds): number | null {
  const nInc = f.incorrectByFold[0]?.length ?? 0;
  const incMean = Array.from({ length: nInc }, (_, i) => {
    const v = f.incorrectByFold.map((fold) => fold[i]).filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  });
  return aucPairs(incMean, f.heldout);
}

/** Analysis v2 construction: within each fold, the held-out correct rep is compared only with the incorrect reps
 * scored against the same baseline; the comparisons are pooled over folds. With labels assigned at random, the
 * held-out rep and each incorrect rep are exchangeable given the fold's baseline, so the null expectation is 0.5. */
export function aucFoldPaired(f: LooFolds): number | null {
  let s = 0;
  let n = 0;
  f.heldout.forEach((h, k) => {
    if (h === null) return;
    for (const v of f.incorrectByFold[k]) {
      if (v === null) continue;
      s += v > h ? 1 : v === h ? 0.5 : 0;
      n += 1;
    }
  });
  return n ? s / n : null;
}

/** Link found reps to annotated reps: greedy one-to-one by the share of the found rep inside the annotation
 * (>= minShare), ties broken as in research/measurement/inclusion.py (larger found index, then larger annotation index). */
export function linkReps(found: readonly { tStart: number; tEnd: number }[], annotated: readonly { t_start: number; t_end: number }[], minShare = 0.5): Map<number, number> {
  const pairs: [number, number, number][] = [];
  found.forEach((d, i) =>
    annotated.forEach((a, j) => {
      const inter = Math.max(0, Math.min(d.tEnd, a.t_end) - Math.max(d.tStart, a.t_start));
      pairs.push([inter / Math.max(1e-9, d.tEnd - d.tStart), i, j]);
    }),
  );
  pairs.sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2]);
  const usedFound = new Set<number>();
  const link = new Map<number, number>(); // annotation index -> found index
  for (const [s, i, j] of pairs) {
    if (s < minShare) break;
    if (usedFound.has(i) || link.has(j)) continue;
    usedFound.add(i);
    link.set(j, i);
  }
  return link;
}
