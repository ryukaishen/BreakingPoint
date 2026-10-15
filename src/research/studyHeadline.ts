// The synthetic HiPerGator study's held-out headline, as the landing page prints it.
//
// The numbers come from the shipped detector config, which is a copy of the frozen study output
// (results/breakingpoint_detector_config.json). tests/study_constants.test.ts checks both the copy
// and every printed figure against results/VALIDATION_REPORT.md.

import type { ValidationInfo } from '../detection/config';
import { pct } from '../utils/format';

export interface StudyFigure {
  value: string;
  label: string;
}

export interface StudyHeadline {
  figures: StudyFigure[];
  /** Sessions the rates were measured on: the held-out half, never seen during selection. */
  heldOutSessions: number;
}

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export interface EvidenceFigure {
  value: string;
  label: string;
  /** What the number counts and on which sessions, in plain words. */
  detail: string;
}

const count = (x: number) => x.toLocaleString('en-US');
const ci95 = (v: ValidationInfo, key: string) => {
  const c = v[key];
  return Array.isArray(c) && c.length === 2 && c.every(finite) ? ` 95% CI ${pct(c[0])} to ${pct(c[1])}.` : '';
};

/**
 * The research panel's opening figures: the same held-out results as the landing page, each with what it
 * counts. The no-change and change session counts are the sums of the report's per-scenario rows.
 * Null until a config with the study's validation block has loaded.
 */
export function researchEvidence(v: ValidationInfo | undefined): EvidenceFigure[] | null {
  if (!v) return null;
  const { numSessions: total, truePositiveRate: detected, falsePositiveRate: falseAlerts, medianDetectionDelay: delay } = v;
  const heldOut = v.num_sessions_holdout;
  const noChange = v.num_no_change_sessions_holdout;
  const changed = v.num_drift_sessions_holdout;
  if (!finite(total) || !finite(heldOut) || !finite(noChange) || !finite(changed) || !finite(detected) || !finite(falseAlerts) || !finite(delay)) return null;
  return [
    { value: count(total), label: 'simulated sessions', detail: 'Squat-like athlete sessions in which the simulation knew whether, and at which rep, the movement changed.' },
    { value: count(heldOut), label: 'held-out evaluation sessions', detail: 'Never used to choose the detector settings. Every rate here is measured on them.' },
    {
      value: pct(detected),
      label: 'of injected changes detected',
      detail: `Of the ${count(changed)} held-out sessions with a change inserted at a known rep, the share alerted at or after that rep.${ci95(v, 'true_positive_rate_ci95')}`,
    },
    {
      value: pct(falseAlerts),
      label: 'false-alert rate',
      detail: `Of the ${count(noChange)} held-out sessions with no change, the share that raised any alert.${ci95(v, 'false_positive_rate_ci95')}`,
    },
    { value: `${delay} reps`, label: 'median detection delay', detail: 'Reps from the injected change to the alert, in the sessions where it was detected.' },
  ];
}

/** Null until a config with the study's validation block has loaded. */
export function studyHeadline(v: ValidationInfo | undefined): StudyHeadline | null {
  if (!v) return null;
  const heldOut = v.num_sessions_holdout;
  if (![v.numSessions, v.falsePositiveRate, v.truePositiveRate, v.medianDetectionDelay, heldOut].every(finite)) return null;
  return {
    heldOutSessions: heldOut as number,
    figures: [
      { value: (v.numSessions as number).toLocaleString('en-US'), label: 'simulated sessions' },
      { value: pct(v.falsePositiveRate), label: 'false alerts in no-change sessions' },
      { value: pct(v.truePositiveRate), label: 'of simulated changes detected' },
      { value: `${v.medianDetectionDelay} reps`, label: 'median delay after the change' },
    ],
  };
}
