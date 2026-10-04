// Personalized baseline: per-feature robust location/scale learned from the
// athlete's own fresh calibration reps, plus the athlete's in-control drift
// reference (mu0, sigma0) estimated by leave-one-out cross-validation.

import type { ExerciseType, FeatureSpec, RepFeatures } from '../biomechanics/catalog';
import { featureSpecs } from '../biomechanics/catalog';
import type { DetectorConfig } from '../detection/config';
import { driftScore, featureIsValid } from '../detection/driftScore';
import { clamp, mad, mean, median, sampleSd } from '../utils/stats';

export const MIN_BASELINE_VALUES = 3;
export const MIN_CALIBRATION_REPS = 4;
export const MAD_TO_SD = 1.4826;

export interface FeatureBaseline {
  n: number;
  mean: number;
  median: number;
  sd: number;
  mad: number;
  min: number;
  max: number;
  /** Location used for z-scores (median — robust to one odd calibration rep). */
  center: number;
  /** max(SD, 1.4826·MAD, absFloor, relFloor·|median|). */
  scale: number;
}

export interface DriftReference {
  mu0: number;
  sigma0: number;
  looScores: number[];
  source: 'loo' | 'default';
}

export interface Baseline {
  exercise: ExerciseType;
  athlete: string;
  createdAt: string;
  nReps: number;
  features: Record<string, FeatureBaseline | null>;
  reference: DriftReference;
}

type BaselineCfg = Pick<DetectorConfig, 'zClip' | 'featureWeighting' | 'missingHandling' | 'qualityMin' | 'minCoverage' | 'reference'>;

export function featureBaseline(values: readonly number[], spec: Pick<FeatureSpec, 'absFloor' | 'relFloor'>): FeatureBaseline | null {
  if (values.length < MIN_BASELINE_VALUES) return null;
  const med = median(values);
  const sd = sampleSd(values);
  const m = mad(values, med);
  const scale = Math.max(sd, MAD_TO_SD * m, spec.absFloor, spec.relFloor * Math.abs(med));
  return {
    n: values.length,
    mean: mean(values),
    median: med,
    sd,
    mad: m,
    min: Math.min(...values),
    max: Math.max(...values),
    center: med,
    scale,
  };
}

export function buildFeatureBaselines(
  reps: readonly RepFeatures[],
  specs: readonly FeatureSpec[],
  qualityMin: number,
): Record<string, FeatureBaseline | null> {
  const out: Record<string, FeatureBaseline | null> = {};
  for (const spec of specs) {
    const vals = reps.filter((r) => featureIsValid(r, spec.key, qualityMin)).map((r) => r.values[spec.key] as number);
    out[spec.key] = featureBaseline(vals, spec);
  }
  return out;
}

/**
 * In-control drift reference via leave-one-out: each calibration rep is scored
 * against a baseline built from the *other* reps. This measures how far this
 * athlete's fresh reps naturally fall from their own baseline out-of-sample,
 * including small-sample inflation, so the detector is calibrated per athlete.
 */
export function driftReference(reps: readonly RepFeatures[], specs: readonly FeatureSpec[], cfg: BaselineCfg): DriftReference {
  const r = cfg.reference;
  const loo: number[] = [];
  if (reps.length >= MIN_CALIBRATION_REPS) {
    for (let i = 0; i < reps.length; i++) {
      const others = reps.filter((_, j) => j !== i);
      const fb = buildFeatureBaselines(others, specs, cfg.qualityMin);
      const d = driftScore(reps[i], fb, specs, cfg).score;
      if (d !== null) loo.push(d);
    }
  }
  if (loo.length < 3) return { mu0: r.mu0Default, sigma0: r.sigma0Default, looScores: loo, source: 'default' };
  const mu0 = clamp(mean(loo), r.mu0Min, r.mu0Max);
  const sigma0 = clamp(Math.max(sampleSd(loo), r.sigma0RelMin * mu0), r.sigma0Min, r.sigma0Max);
  return { mu0, sigma0, looScores: loo, source: 'loo' };
}

export function buildBaseline(
  reps: readonly RepFeatures[],
  exercise: ExerciseType,
  cfg: BaselineCfg,
  athlete = 'Athlete',
  specs: readonly FeatureSpec[] = featureSpecs(exercise),
): Baseline {
  return {
    exercise,
    athlete,
    createdAt: new Date().toISOString(),
    nReps: reps.length,
    features: buildFeatureBaselines(reps, specs, cfg.qualityMin),
    reference: driftReference(reps, specs, cfg),
  };
}
