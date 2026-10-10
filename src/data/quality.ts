// Comparability rules. A set may count toward records and be compared with
// other sets only when its calibration and capture were good enough; otherwise
// a sloppy baseline or a poorly tracked set could inflate "reps held".

import { MIN_CALIBRATION_REPS, type Baseline } from '../baseline/baseline';
import type { DetectorConfig } from '../detection/config';
import type { CalibrationQuality, SessionQuality, SessionRep } from './types';

/** Minimum share of reps that must be scored, and minimum mean landmark confidence. */
export const MIN_SCORED_FRACTION = 0.8;
export const MIN_MEAN_CAPTURE = 0.65;
/** A set needs at least this many reps to be compared at all. */
export const MIN_SET_REPS = 3;

export function calibrationQuality(baseline: Baseline, config: Pick<DetectorConfig, 'reference'>): CalibrationQuality {
  const feats = Object.values(baseline.features);
  const excluded = feats.filter((f) => f === null).length;
  const ref = baseline.reference;
  const reasons: string[] = [];
  if (ref.source !== 'loo') reasons.push('Too few usable calibration reps to measure your normal variation');
  if (baseline.nReps < MIN_CALIBRATION_REPS + 1) reasons.push(`Calibrated from ${baseline.nReps} reps (needs ${MIN_CALIBRATION_REPS + 1} or more)`);
  if (excluded > Math.floor(feats.length * 0.25)) reasons.push(`${excluded} of ${feats.length} measurements had low landmark confidence`);
  if (ref.sigma0 >= config.reference.sigma0Max - 1e-9) reasons.push('Calibration reps were unusually inconsistent');
  return {
    nReps: baseline.nReps,
    referenceSource: ref.source,
    mu0: ref.mu0,
    sigma0: ref.sigma0,
    excludedFeatures: excluded,
    totalFeatures: feats.length,
    ok: reasons.length === 0,
    reasons,
  };
}

export function sessionQuality(reps: readonly SessionRep[], calibration: CalibrationQuality): SessionQuality {
  const total = reps.length;
  const scored = reps.filter((r) => r.score !== null).length;
  const scoredFraction = total ? scored / total : 0;
  const meanCapture = total ? reps.reduce((s, r) => s + r.quality, 0) / total : 0;
  const reasons = [...calibration.reasons];
  if (total < MIN_SET_REPS) reasons.push(`Only ${total} rep${total === 1 ? '' : 's'} in the set`);
  if (total && scoredFraction < MIN_SCORED_FRACTION) reasons.push(`Only ${Math.round(scoredFraction * 100)}% of reps could be scored`);
  if (total && meanCapture < MIN_MEAN_CAPTURE) reasons.push('Capture quality was low for this set');
  return { scoredFraction, meanCapture, calibrationOk: calibration.ok, eligible: reasons.length === 0, reasons };
}
