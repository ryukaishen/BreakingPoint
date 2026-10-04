// Display terminology for features. The catalog provides the default labels; a
// sport context may rename features (e.g. soccer calls RSI-mod "Explosive velocity").
// Purely presentational — the drift score and detector never see these names.

import { createContext, useContext } from 'react';
import { specFor, type ExerciseType } from '../biomechanics/catalog';

export interface FeatureLabeler {
  short(key: string): string;
  label(key: string): string;
  up(key: string): string;
  down(key: string): string;
}

export function makeLabeler(exercise: ExerciseType, overrides: Record<string, string> = {}): FeatureLabeler {
  return {
    short: (k) => overrides[k] ?? specFor(exercise, k)?.short ?? k,
    label: (k) => overrides[k] ?? specFor(exercise, k)?.label ?? k,
    up: (k) => specFor(exercise, k)?.upWord ?? 'higher',
    down: (k) => specFor(exercise, k)?.downWord ?? 'lower',
  };
}

const LabelContext = createContext<FeatureLabeler | null>(null);
export const LabelProvider = LabelContext.Provider;

/** Sport-aware labels when inside a LabelProvider, catalog labels otherwise. */
export function useLabels(exercise: ExerciseType): FeatureLabeler {
  return useContext(LabelContext) ?? makeLabeler(exercise);
}
