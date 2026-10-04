// Only derived numeric features are stored — never video. localStorage access is
// wrapped because it can be unavailable (private windows, blocked storage).

import type { ExerciseType } from '../biomechanics/catalog';
import type { Baseline } from './baseline';

const key = (exercise: ExerciseType) => `breakingpoint.baseline.${exercise}`;
const ATHLETE_KEY = 'breakingpoint.athlete';

export function saveBaseline(b: Baseline): void {
  try {
    localStorage.setItem(key(b.exercise), JSON.stringify(b));
  } catch {
    /* storage unavailable: baseline stays in memory for this session */
  }
}

export function loadBaseline(exercise: ExerciseType): Baseline | null {
  try {
    const raw = localStorage.getItem(key(exercise));
    if (!raw) return null;
    const b = JSON.parse(raw) as Baseline;
    return b && b.features && b.reference ? b : null;
  } catch {
    return null;
  }
}

export function clearBaseline(exercise: ExerciseType): void {
  try {
    localStorage.removeItem(key(exercise));
  } catch {
    /* ignore */
  }
}

export function loadAthlete(): string {
  try {
    return localStorage.getItem(ATHLETE_KEY) || 'Adam';
  } catch {
    return 'Adam';
  }
}

export function saveAthlete(name: string): void {
  try {
    localStorage.setItem(ATHLETE_KEY, name);
  } catch {
    /* ignore */
  }
}
