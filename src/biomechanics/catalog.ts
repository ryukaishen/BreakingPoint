import catalogJson from '../../shared/feature_catalog.json';

/** Engine-level movement primitives that are implemented (see src/protocols/primitives.ts). */
export type ExerciseType = 'squat' | 'cmj' | 'lunge';

export interface FeatureSpec {
  key: string;
  label: string;
  short: string;
  unit: string;
  displayScale: number;
  decimals: number;
  group: string;
  weight: number;
  absFloor: number;
  relFloor: number;
  upWord: string;
  downWord: string;
}

interface CatalogFile {
  version: number;
  exercises: Record<ExerciseType, { label: string; features: FeatureSpec[] }>;
}

const catalog = catalogJson as unknown as CatalogFile;

export function featureSpecs(exercise: ExerciseType): FeatureSpec[] {
  return catalog.exercises[exercise].features;
}

export function exerciseLabel(exercise: ExerciseType): string {
  return catalog.exercises[exercise].label;
}

export function specFor(exercise: ExerciseType, key: string): FeatureSpec | undefined {
  return featureSpecs(exercise).find((f) => f.key === key);
}

/** Per-rep measurement vector. `quality` is in [0,1] (landmark visibility). */
export interface RepFeatures {
  values: Record<string, number | null>;
  quality: Record<string, number>;
}

export function formatFeatureValue(spec: FeatureSpec, v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return `${(v * spec.displayScale).toFixed(spec.decimals)}`;
}

export function formatWithUnit(spec: FeatureSpec, v: number | null | undefined): string {
  const s = formatFeatureValue(spec, v);
  if (s === '—') return s;
  if (!spec.unit) return s;
  return spec.unit === '°' ? `${s}°` : `${s} ${spec.unit}`;
}
