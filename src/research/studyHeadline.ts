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
