// Descriptive, NON-MEDICAL drift-pattern labels derived from the dominant feature
// deviations. Each feature maps to a movement family and a direction that counts as
// "drift" for that family; the family with the largest standardized changes names
// the pattern. Sports may rename a label (e.g. basketball calls explosive fatigue
// "jump consistency drift") but never change which pattern the data shows.
// These labels describe movement change only — they are not diagnoses.

import type { ExerciseType } from '../biomechanics/catalog';
import type { RepRecord } from '../session/engine';
import { sampleSd } from '../utils/stats';

export type PatternId = 'explosive' | 'recovery' | 'landing' | 'rom' | 'technique' | 'asymmetry' | 'variability';

export const PATTERN_LABELS: Record<PatternId, string> = {
  explosive: 'EXPLOSIVE FATIGUE',
  recovery: 'RECOVERY SLOWING',
  landing: 'LANDING CONSISTENCY DRIFT',
  rom: 'RANGE-OF-MOTION DRIFT',
  technique: 'TECHNIQUE DRIFT',
  asymmetry: 'ASYMMETRY EMERGING',
  variability: 'MOVEMENT VARIABILITY INCREASING',
};

export const PATTERN_EXPLAIN: Record<PatternId, string> = {
  explosive: 'Explosive output (height, speed, reactive strength) is dropping relative to your baseline.',
  recovery: 'The return / drive phase is getting slower than your baseline.',
  landing: 'Landing absorption is changing away from your usual landing.',
  rom: 'Range of motion is shrinking compared with your fresh reps.',
  technique: 'Posture and movement strategy are shifting (e.g. more trunk lean).',
  asymmetry: 'Left/right differences are growing beyond your normal pattern.',
  variability: 'Reps are becoming less consistent with each other.',
};

type Dir = 1 | -1 | 0; // +1 increase counts as drift, -1 decrease counts, 0 either direction

const MAP: Record<ExerciseType, Record<string, [PatternId, Dir]>> = {
  squat: {
    kneeRomL: ['rom', -1], kneeRomR: ['rom', -1], hipRom: ['rom', -1], depth: ['rom', -1],
    trunkLean: ['technique', 1], eccentricDuration: ['technique', 0],
    repDuration: ['recovery', 1], concentricDuration: ['recovery', 1],
    peakVelocity: ['explosive', -1], asymmetry: ['asymmetry', 1],
  },
  cmj: {
    jumpHeight: ['explosive', -1], rsiMod: ['explosive', -1], flightTime: ['explosive', -1], concentricDuration: ['explosive', 1],
    countermovementDepth: ['technique', 0], eccentricDuration: ['technique', 0], trunkLean: ['technique', 1],
    landingKneeFlex: ['landing', 0], asymmetry: ['asymmetry', 1],
  },
  lunge: {
    kneeRomL: ['rom', -1], kneeRomR: ['rom', -1], hipRom: ['rom', -1], depth: ['rom', -1], stepLength: ['rom', -1],
    trunkLean: ['technique', 1], eccentricDuration: ['technique', 0],
    repDuration: ['recovery', 1], concentricDuration: ['recovery', 1], recoveryVelocity: ['recovery', -1],
    asymmetry: ['asymmetry', 1],
  },
};

export interface PatternResult {
  id: PatternId;
  label: string;
  explain: string;
  score: number;
  evidence: { key: string; z: number }[];
  secondary?: { id: PatternId; label: string };
}

/** Mean clipped z per feature over a set of scored reps. */
export function meanZ(reps: readonly RepRecord[]): Record<string, number> {
  const acc: Record<string, number[]> = {};
  for (const r of reps) {
    for (const d of r.drift?.deviations ?? []) {
      if (d.used && d.zClipped !== null) (acc[d.key] ??= []).push(d.zClipped);
    }
  }
  return Object.fromEntries(Object.entries(acc).map(([k, v]) => [k, v.reduce((s, x) => s + x, 0) / v.length]));
}

export function classifyPattern(
  exercise: ExerciseType,
  z: Record<string, number>,
  opts: { recentScores?: number[]; sigma0?: number; labels?: Partial<Record<PatternId, string>> } = {},
): PatternResult | null {
  const label = (id: PatternId) => opts.labels?.[id] ?? PATTERN_LABELS[id];
  const groups: Partial<Record<PatternId, { key: string; z: number; c: number }[]>> = {};
  for (const [key, [pid, dir]] of Object.entries(MAP[exercise])) {
    const v = z[key];
    if (v === undefined || !Number.isFinite(v)) continue;
    const c = dir === 0 ? Math.abs(v) : Math.max(0, dir * v);
    (groups[pid] ??= []).push({ key, z: v, c });
  }
  const scored = (Object.entries(groups) as [PatternId, { key: string; z: number; c: number }[]][])
    .map(([id, items]) => {
      const top = [...items].sort((a, b) => b.c - a.c);
      const score = top.length >= 2 ? (top[0].c + top[1].c) / 2 : top[0].c;
      return { id, score, evidence: top.filter((t) => t.c >= 1).map(({ key, z: zz }) => ({ key, z: zz })) };
    })
    .sort((a, b) => b.score - a.score);
  const best = scored[0];
  const rs = opts.recentScores ?? [];
  const variable = rs.length >= 4 && opts.sigma0 !== undefined && sampleSd(rs) > 2 * opts.sigma0;
  if (!best || best.score < 1.5) {
    if (variable) return { id: 'variability', label: label('variability'), explain: PATTERN_EXPLAIN.variability, score: 0, evidence: [] };
    return null;
  }
  const second = scored[1] && scored[1].score >= 0.75 * best.score ? { id: scored[1].id, label: label(scored[1].id) } : undefined;
  return { id: best.id, label: label(best.id), explain: PATTERN_EXPLAIN[best.id], score: best.score, evidence: best.evidence, secondary: second };
}

/** Pattern for the current session: reps since the estimated onset (or the last 4 reps). */
export function sessionPattern(
  exercise: ExerciseType,
  reps: readonly RepRecord[],
  onsetRep: number | null,
  sigma0: number | undefined,
  labels?: Partial<Record<PatternId, string>>,
): PatternResult | null {
  const scored = reps.filter((r) => r.drift?.score !== null && r.drift?.score !== undefined);
  if (!scored.length) return null;
  const window = onsetRep !== null ? scored.filter((r) => r.index >= onsetRep) : scored.slice(-4);
  const recent = scored.slice(-5).map((r) => r.drift!.score as number);
  return classifyPattern(exercise, meanZ(window.length ? window : scored.slice(-4)), { recentScores: recent, sigma0, labels });
}
