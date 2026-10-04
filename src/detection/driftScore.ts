// Movement Drift Score: weighted RMS of per-feature robust z-scores against the
// athlete's personal baseline.
//
//   z_i   = clip((x_i - center_i) / scale_i, -zClip, +zClip)
//   drift = sqrt( Σ w_i z_i² / Σ w_i )
//
// Missing or low-confidence features are dropped (default), imputed as z=0, or
// cause the whole rep to be skipped, depending on config.missingHandling.
// A rep whose observed feature weight covers < minCoverage of the available
// weight is reported as unscored (null) instead of a falsely precise number.

import type { FeatureSpec, RepFeatures } from '../biomechanics/catalog';
import type { FeatureBaseline } from '../baseline/baseline';
import type { DetectorConfig } from './config';
import { clamp, isNum } from '../utils/stats';

export type ExclusionReason = 'missing' | 'low-quality' | 'no-baseline';

export interface FeatureDeviation {
  key: string;
  value: number | null;
  z: number | null;
  zClipped: number | null;
  weight: number;
  /** Share of this feature in Σ w z² (0..1). */
  contribution: number;
  quality: number;
  used: boolean;
  reason?: ExclusionReason;
}

export interface DriftResult {
  score: number | null;
  coverage: number;
  deviations: FeatureDeviation[];
  /** Used features sorted by |z| (largest first) — the "why did you flag me" list. */
  ranked: FeatureDeviation[];
}

type DriftCfg = Pick<DetectorConfig, 'zClip' | 'featureWeighting' | 'missingHandling' | 'qualityMin' | 'minCoverage'>;

export function featureIsValid(rep: RepFeatures, key: string, qualityMin: number): boolean {
  const v = rep.values[key];
  const q = rep.quality[key] ?? 1;
  return isNum(v) && q >= qualityMin;
}

export function driftScore(
  rep: RepFeatures,
  baselines: Record<string, FeatureBaseline | null>,
  specs: readonly FeatureSpec[],
  cfg: DriftCfg,
): DriftResult {
  let totalBase = 0;
  let coveredBase = 0;
  let sumSq = 0;
  let wsum = 0;
  let skipRep = false;
  const deviations: FeatureDeviation[] = [];

  for (const spec of specs) {
    const b = baselines[spec.key];
    const raw = rep.values[spec.key];
    const value = isNum(raw) ? raw : null;
    const q = clamp(rep.quality[spec.key] ?? 1, 0, 1);
    if (!b) {
      deviations.push({ key: spec.key, value, z: null, zClipped: null, weight: 0, contribution: 0, quality: q, used: false, reason: 'no-baseline' });
      continue;
    }
    const baseW = cfg.featureWeighting === 'equal' ? 1 : spec.weight;
    totalBase += baseW;
    if (value === null || q < cfg.qualityMin) {
      const reason: ExclusionReason = value === null ? 'missing' : 'low-quality';
      if (cfg.missingHandling === 'skip_rep') skipRep = true;
      else if (cfg.missingHandling === 'impute') wsum += baseW; // z = 0 contributes nothing to Σ w z²
      deviations.push({ key: spec.key, value, z: null, zClipped: null, weight: 0, contribution: 0, quality: q, used: false, reason });
      continue;
    }
    const z = (value - b.center) / b.scale;
    const zc = clamp(z, -cfg.zClip, cfg.zClip);
    const w = baseW * (cfg.featureWeighting === 'grouped_quality' ? q : 1);
    coveredBase += baseW;
    sumSq += w * zc * zc;
    wsum += w;
    deviations.push({ key: spec.key, value, z, zClipped: zc, weight: w, contribution: 0, quality: q, used: true });
  }

  const coverage = totalBase > 0 ? coveredBase / totalBase : 0;
  const scored = !skipRep && wsum > 0 && coverage >= cfg.minCoverage;
  const score = scored ? Math.sqrt(sumSq / wsum) : null;
  if (sumSq > 0) {
    for (const d of deviations) if (d.used && d.zClipped !== null) d.contribution = (d.weight * d.zClipped * d.zClipped) / sumSq;
  }
  const ranked = deviations
    .filter((d) => d.used && d.zClipped !== null)
    .sort((a, b) => Math.abs(b.zClipped as number) - Math.abs(a.zClipped as number));
  return { score, coverage, deviations, ranked };
}
