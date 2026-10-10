// Plain-language explanation of what changed in a set, e.g.
//   "Your knee range of motion decreased and your reps became slower.
//    These changes first appeared around rep 7, and BreakingPoint triggered an alert at rep 10."
// Built from the same per-feature changes the detector already reports. Display only.

import type { ExerciseType } from '../biomechanics/catalog';
import { changePhrase } from '../biomechanics/plainLanguage';
import type { RepRecord } from './engine';
import { rankChanges } from './summary';

export interface MeasuredChange {
  key: string;
  /** Mean standardized change from the athlete's usual form (signed). */
  z: number;
}

/** A change smaller than this (in units of the athlete's normal rep-to-rep variation) is not named. */
export const NAMED_CHANGE_MIN = 1;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * One sentence naming the largest changes, at most `max` of them. Changes of at least
 * NAMED_CHANGE_MIN are named; if none reaches it, the single largest change is named.
 * Returns null when nothing changed.
 */
export function describeChanges(exercise: ExerciseType, changes: readonly MeasuredChange[], max = 2): string | null {
  const ranked = changes.filter((c) => Number.isFinite(c.z) && c.z !== 0).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
  const phrases: string[] = [];
  for (const c of ranked) {
    if (phrases.length >= max) break;
    if (phrases.length > 0 && Math.abs(c.z) < NAMED_CHANGE_MIN) break;
    const p = changePhrase(exercise, c.key, c.z);
    if (p && !phrases.includes(p)) phrases.push(p);
  }
  if (!phrases.length) return null;
  return `${capitalize(phrases.join(' and '))}.`;
}

/** When the changes began (an estimate) and when the alert fired. */
export function describeTiming(onsetRep: number | null, alarmRep: number): string {
  return onsetRep !== null && onsetRep < alarmRep
    ? `These changes first appeared around rep ${onsetRep}, and BreakingPoint triggered an alert at rep ${alarmRep}.`
    : `BreakingPoint triggered an alert at rep ${alarmRep}.`;
}

/** Stand-alone version of describeTiming, for places that show no list of changes first. */
export function describeAlertTiming(onsetRep: number | null, alarmRep: number): string {
  return onsetRep !== null && onsetRep < alarmRep
    ? `Your form first started changing around rep ${onsetRep}. The alert triggered at rep ${alarmRep}.`
    : `The alert triggered at rep ${alarmRep}.`;
}

export interface AlertExplanation {
  /** What changed, or null if no single measurement stood out. */
  what: string | null;
  /** When it started and when the alert fired. */
  when: string;
}

/**
 * Explanation for a set with an alert. The changes are averaged over the reps from the
 * estimated start of the change (or the alert rep) onward.
 */
export function explainAlert(
  exercise: ExerciseType,
  reps: readonly RepRecord[],
  onsetRep: number | null,
  alarmRep: number,
): AlertExplanation {
  const from = onsetRep !== null && onsetRep < alarmRep ? onsetRep : alarmRep;
  const window = reps.filter((r) => r.index >= from);
  const changes = rankChanges(window, exercise).map((c) => ({ key: c.key, z: c.meanZ }));
  return { what: describeChanges(exercise, changes), when: describeTiming(onsetRep, alarmRep) };
}

/** The explanation as one string. */
export function explainAlertText(e: AlertExplanation): string {
  return e.what ? `${e.what} ${e.when}` : e.when;
}
