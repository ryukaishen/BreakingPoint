// Detector configuration. The canonical serialized form is the snake_case JSON
// exported by BreakingPoint Lab (results/breakingpoint_detector_config.json),
// which the app loads at startup from /breakingpoint_detector_config.json.

import defaultJson from '../../shared/default_detector_config.json';

export type DetectorMode = 'ewma' | 'cusum' | 'combined' | 'consecutive';
export type FeatureWeighting = 'equal' | 'grouped' | 'grouped_quality';
export type MissingHandling = 'drop' | 'impute' | 'skip_rep';

export interface ReferenceConfig {
  mu0Default: number;
  sigma0Default: number;
  mu0Min: number;
  mu0Max: number;
  sigma0Min: number;
  sigma0Max: number;
  sigma0RelMin: number;
}

export interface ValidationInfo {
  numSessions?: number;
  falsePositiveRate?: number;
  truePositiveRate?: number;
  missRate?: number;
  medianDetectionDelay?: number;
  [k: string]: unknown;
}

export interface DetectorConfig {
  mode: DetectorMode;
  ewmaAlpha: number;
  cusumK: number;
  cusumH: number;
  warningThreshold: number;
  breakpointThreshold: number;
  minimumPersistentReps: number;
  /** Winsorization of the standardized drift fed to EWMA/CUSUM; null = none. */
  outlierClip: number | null;
  /** Per-feature z-score clip used inside the drift score. */
  zClip: number;
  featureWeighting: FeatureWeighting;
  missingHandling: MissingHandling;
  qualityMin: number;
  minCoverage: number;
  reference: ReferenceConfig;
  /** Provenance shown in the UI. */
  source: string;
  validation?: ValidationInfo;
  selectionRule?: string;
  generatedAt?: string;
  configId?: string;
}

type Json = Record<string, unknown>;

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Parse the snake_case Lab JSON into a validated DetectorConfig (unknown fields ignored). */
export function parseDetectorConfig(raw: Json, base?: DetectorConfig): DetectorConfig {
  const b = base ?? DEFAULT_DETECTOR_CONFIG;
  const ref = (raw.reference ?? {}) as Json;
  const v = (raw.validation ?? undefined) as Json | undefined;
  const clipRaw = raw.outlier_clip;
  return {
    mode: oneOf(raw.mode, ['ewma', 'cusum', 'combined', 'consecutive'] as const, b.mode),
    ewmaAlpha: num(raw.ewma_alpha, b.ewmaAlpha),
    cusumK: num(raw.cusum_k, b.cusumK),
    cusumH: num(raw.cusum_h, b.cusumH),
    warningThreshold: num(raw.warning_threshold, b.warningThreshold),
    breakpointThreshold: num(raw.breakpoint_threshold, b.breakpointThreshold),
    minimumPersistentReps: Math.max(0, Math.round(num(raw.minimum_persistent_reps, b.minimumPersistentReps))),
    outlierClip: clipRaw === null ? null : clipRaw === undefined ? b.outlierClip : num(clipRaw, b.outlierClip ?? 4),
    zClip: num(raw.z_clip, b.zClip),
    featureWeighting: oneOf(raw.feature_weighting, ['equal', 'grouped', 'grouped_quality'] as const, b.featureWeighting),
    missingHandling: oneOf(raw.missing_feature_handling, ['drop', 'impute', 'skip_rep'] as const, b.missingHandling),
    qualityMin: num(raw.quality_min, b.qualityMin),
    minCoverage: num(raw.min_coverage, b.minCoverage),
    reference: {
      mu0Default: num(ref.mu0_default, b.reference.mu0Default),
      sigma0Default: num(ref.sigma0_default, b.reference.sigma0Default),
      mu0Min: num(ref.mu0_min, b.reference.mu0Min),
      mu0Max: num(ref.mu0_max, b.reference.mu0Max),
      sigma0Min: num(ref.sigma0_min, b.reference.sigma0Min),
      sigma0Max: num(ref.sigma0_max, b.reference.sigma0Max),
      sigma0RelMin: num(ref.sigma0_rel_min, b.reference.sigma0RelMin),
    },
    source: typeof raw.source === 'string' ? raw.source : b.source,
    validation: v
      ? {
          ...v,
          numSessions: num(v.num_sessions, NaN),
          falsePositiveRate: num(v.false_positive_rate, NaN),
          truePositiveRate: num(v.true_positive_rate, NaN),
          missRate: num(v.miss_rate, NaN),
          medianDetectionDelay: num(v.median_detection_delay, NaN),
        }
      : b.validation,
    selectionRule: typeof raw.selection_rule === 'string' ? raw.selection_rule : b.selectionRule,
    generatedAt: typeof raw.generated_at === 'string' ? raw.generated_at : b.generatedAt,
    configId: typeof raw.config_id === 'string' ? raw.config_id : b.configId,
  };
}

const FALLBACK: DetectorConfig = {
  mode: 'combined',
  ewmaAlpha: 0.4,
  cusumK: 0.5,
  cusumH: 4,
  warningThreshold: 2,
  breakpointThreshold: 2.5,
  minimumPersistentReps: 2,
  outlierClip: 4,
  zClip: 6,
  featureWeighting: 'grouped_quality',
  missingHandling: 'drop',
  qualityMin: 0.5,
  minCoverage: 0.5,
  reference: {
    mu0Default: 1.0,
    sigma0Default: 0.35,
    mu0Min: 0.5,
    mu0Max: 2.0,
    sigma0Min: 0.2,
    sigma0Max: 0.8,
    sigma0RelMin: 0.25,
  },
  source: 'Built-in defaults',
};

/** Shipped defaults (shared/default_detector_config.json), used until a Lab config loads. */
export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = parseDetectorConfig(defaultJson as Json, FALLBACK);

/** Serialize back to the Lab's snake_case schema (used for export and parity tests). */
export function serializeDetectorConfig(c: DetectorConfig): Json {
  return {
    schema: 'breakingpoint.detector/v1',
    mode: c.mode,
    ewma_alpha: c.ewmaAlpha,
    cusum_k: c.cusumK,
    cusum_h: c.cusumH,
    warning_threshold: c.warningThreshold,
    breakpoint_threshold: c.breakpointThreshold,
    minimum_persistent_reps: c.minimumPersistentReps,
    outlier_clip: c.outlierClip,
    z_clip: c.zClip,
    feature_weighting: c.featureWeighting,
    missing_feature_handling: c.missingHandling,
    quality_min: c.qualityMin,
    min_coverage: c.minCoverage,
    reference: {
      mu0_default: c.reference.mu0Default,
      sigma0_default: c.reference.sigma0Default,
      mu0_min: c.reference.mu0Min,
      mu0_max: c.reference.mu0Max,
      sigma0_min: c.reference.sigma0Min,
      sigma0_max: c.reference.sigma0Max,
      sigma0_rel_min: c.reference.sigma0RelMin,
    },
    source: c.source,
  };
}

/** Fetch the Lab-exported config from /public; falls back to defaults on any problem. */
export async function loadDetectorConfig(url = '/breakingpoint_detector_config.json'): Promise<DetectorConfig> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return DEFAULT_DETECTOR_CONFIG;
    const json = (await res.json()) as Json;
    if (json.schema !== 'breakingpoint.detector/v1') return DEFAULT_DETECTOR_CONFIG;
    return parseDetectorConfig(json);
  } catch {
    return DEFAULT_DETECTOR_CONFIG;
  }
}
