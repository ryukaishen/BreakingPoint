// Personal records: how many reps an athlete held their own baseline before
// movement drift began. Derived only from detector output that already exists;
// stored per movement in this browser and written only from live sessions.

import type { ExerciseType } from '../biomechanics/catalog';
import type { RepRecord } from '../session/engine';

const key = (exercise: ExerciseType) => `breakingpoint.record.held.${exercise}`;

/**
 * Reps held at baseline: consecutive STABLE reps from the start of the set,
 * stopping at the first DRIFT / BREAKPOINT rep. Unscored reps neither count nor break the run.
 */
export function heldReps(reps: readonly RepRecord[]): number {
  let n = 0;
  for (const r of reps) {
    if (!r.step) continue;
    if (r.step.state !== 'STABLE') break;
    n++;
  }
  return n;
}

/** True while the athlete is still inside the opening stable run. */
export function stillHolding(reps: readonly RepRecord[]): boolean {
  return reps.every((r) => !r.step || r.step.state === 'STABLE');
}

export function loadBestHeld(exercise: ExerciseType): number | null {
  try {
    const raw = localStorage.getItem(key(exercise));
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

export interface HeldRecord {
  held: number;
  /** Best before this set (null when this is the first recorded live set). */
  previousBest: number | null;
  isNewBest: boolean;
}

/** Pure comparison against a previous best; a first set establishes a best but is not a "new" one. */
export function compareHeld(held: number, previousBest: number | null): HeldRecord {
  return { held, previousBest, isNewBest: previousBest !== null && held > previousBest };
}

/** Record a finished live set and return how it compares with the stored best. */
export function recordHeld(exercise: ExerciseType, held: number): HeldRecord {
  const previousBest = loadBestHeld(exercise);
  const result = compareHeld(held, previousBest);
  if (previousBest === null || held > previousBest) {
    try {
      localStorage.setItem(key(exercise), String(held));
    } catch {
      /* storage unavailable: the record is shown for this session only */
    }
  }
  return result;
}
