import { featureSpecs, type ExerciseType } from '../biomechanics/catalog';
import { mean, sampleSd } from '../utils/stats';
import type { RepRecord } from './engine';

export interface FeatureChange {
  key: string;
  label: string;
  short: string;
  meanZ: number;
  upWord: string;
  downWord: string;
}

export interface SessionSummary {
  athlete: string;
  exercise: ExerciseType;
  generatedAt: string;
  totalReps: number;
  scoredReps: number;
  breakpointRep: number | null;
  onsetRep: number | null;
  stableReps: number;
  postReps: number;
  avgPre: number | null;
  avgPost: number | null;
  sdPre: number | null;
  sdPost: number | null;
  topChanges: FeatureChange[];
  recommendation: string;
  disclaimer: string;
}

export const DISCLAIMER = 'BreakingPoint provides training information and is not a medical diagnosis.';

/** Mean standardized deviation per feature over a set of reps, ranked by magnitude. */
export function rankChanges(reps: readonly RepRecord[], exercise: ExerciseType): FeatureChange[] {
  const specs = featureSpecs(exercise);
  const out: FeatureChange[] = [];
  for (const s of specs) {
    const zs = reps
      .map((r) => r.drift?.deviations.find((d) => d.key === s.key))
      .filter((d) => d && d.used && d.zClipped !== null)
      .map((d) => d!.zClipped as number);
    if (zs.length) out.push({ key: s.key, label: s.label, short: s.short, meanZ: mean(zs), upWord: s.upWord, downWord: s.downWord });
  }
  return out.sort((a, b) => Math.abs(b.meanZ) - Math.abs(a.meanZ));
}

export function buildSummary(
  reps: readonly RepRecord[],
  exercise: ExerciseType,
  athlete: string,
  breakpointRep: number | null,
  onsetRep: number | null,
): SessionSummary {
  const scored = reps.filter((r) => r.drift?.score !== null && r.drift?.score !== undefined);
  const pre = scored.filter((r) => breakpointRep === null || r.index < breakpointRep);
  const post = breakpointRep === null ? [] : scored.filter((r) => r.index >= breakpointRep);
  const scoresPre = pre.map((r) => r.drift!.score as number);
  const scoresPost = post.map((r) => r.drift!.score as number);
  const changeSet = post.length ? post : scored.slice(-4);
  const topChanges = rankChanges(changeSet, exercise).slice(0, 4);
  const recommendation =
    breakpointRep !== null
      ? 'Persistent movement drift detected. Consider a recovery period or reducing training intensity before reassessing.'
      : 'Movement stayed consistent with your personal baseline for this set.';
  return {
    athlete,
    exercise,
    generatedAt: new Date().toISOString(),
    totalReps: reps.length,
    scoredReps: scored.length,
    breakpointRep,
    onsetRep,
    stableReps: breakpointRep === null ? reps.length : reps.filter((r) => r.index < breakpointRep).length,
    postReps: breakpointRep === null ? 0 : reps.filter((r) => r.index >= breakpointRep).length,
    avgPre: scoresPre.length ? mean(scoresPre) : null,
    avgPost: scoresPost.length ? mean(scoresPost) : null,
    sdPre: scoresPre.length > 1 ? sampleSd(scoresPre) : null,
    sdPost: scoresPost.length > 1 ? sampleSd(scoresPost) : null,
    topChanges,
    recommendation,
    disclaimer: DISCLAIMER,
  };
}
