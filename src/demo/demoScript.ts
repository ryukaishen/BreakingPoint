// The Demo Dataset story (deterministic):
//   calibration: 6 fresh reps → personal baseline
//   monitored set: 14 reps — reps 1-6 fresh, then fatigue accumulates
//   recovery check: 3 reps after a simulated rest (partial recovery)
// The fatigue schedule only changes the synthetic athlete's *movement*; whether
// and when BreakingPoint fires is decided by the real detector at runtime.

import type { ExerciseType } from '../biomechanics/catalog';
import { gaussian, mulberry32 } from '../utils/stats';
import type { RepSpec } from './syntheticAthlete';

export const DEMO_CALIBRATION_REPS = 6;

/**
 * Seed + fatigue-effect scale per exercise. Chosen with tests/demo_tune.test.ts so
 * the shipped (Lab-selected) detector tells the intended story; re-run that
 * script after installing a new Lab config:  DEMO_TUNE=1 npx vitest run tests/demo_tune.test.ts
 */
export const DEMO_PRESETS: Record<ExerciseType, { seed: number; effect: number }> = {
  squat: { seed: 43, effect: 0.55 },
  cmj: { seed: 28, effect: 0.65 },
  lunge: { seed: 1, effect: 0.6 },
};
export const DEMO_SEED = DEMO_PRESETS.squat.seed;
export const DEMO_EFFECT = DEMO_PRESETS.squat.effect;

/** Fatigue level per monitored rep (0 = fresh). */
export const DEMO_FATIGUE = [0, 0, 0, 0, 0, 0, 0.3, 0.5, 0.78, 1.0, 1.1, 1.18, 1.24, 1.3];
export const DEMO_RECOVERY_FATIGUE = 0.28;

function squatRep(f: number, rand: () => number): RepSpec {
  const j = () => gaussian(rand);
  return {
    kind: 'squat',
    depth: (1 - 0.1 * f) * (1 + 0.012 * j()),
    trunk: 10 * f + 0.7 * j(),
    ecc: 1.15 * (1 - 0.06 * f) * (1 + 0.03 * j()),
    conc: 0.9 * (1 + 0.38 * f) * (1 + 0.03 * j()),
    pause: 0.12 + 0.02 * j(),
    rest: 0.75 + 0.08 * j(),
    asym: 0.04 + 0.075 * f + 0.006 * j(),
  };
}

function cmjRep(f: number, rand: () => number): RepSpec {
  const j = () => gaussian(rand);
  return {
    kind: 'cmj',
    depth: (1 - 0.12 * f) * (1 + 0.02 * j()),
    trunk: 8 * f + 0.7 * j(),
    ecc: 0.5 * (1 + 0.15 * f) * (1 + 0.03 * j()),
    conc: 0.28 * (1 + 0.3 * f) * (1 + 0.03 * j()),
    pause: 0,
    rest: 1.1 + 0.1 * j(),
    asym: 0.04 + 0.08 * f + 0.006 * j(),
    flight: 0.52 * (1 - 0.13 * f) * (1 + 0.012 * j()),
  };
}

function lungeRep(f: number, rand: () => number): RepSpec {
  const j = () => gaussian(rand);
  return {
    kind: 'lunge',
    depth: (1 - 0.12 * f) * (1 + 0.015 * j()),
    trunk: 9 * f + 0.7 * j(),
    ecc: 0.95 * (1 + 0.03 * j()),
    conc: 0.85 * (1 + 0.45 * f) * (1 + 0.03 * j()),
    pause: 0.1 + 0.02 * j(),
    rest: 0.8 + 0.08 * j(),
    asym: Math.max(0, 0.05 * f + 0.004 * j()),
    step: (1 - 0.06 * f) * (1 + 0.012 * j()),
  };
}

/** Exposed for tests: build a single synthetic rep at a given fatigue level. */
export const MAKE_REP: Record<ExerciseType, (f: number, rand: () => number) => RepSpec> = {
  squat: squatRep,
  cmj: cmjRep,
  lunge: lungeRep,
};

export interface DemoPlan {
  calibration: RepSpec[];
  monitoring: RepSpec[];
  recovery: RepSpec[];
}

/** `effect` scales how strongly fatigue changes the synthetic athlete's movement. */
export function demoPlan(exercise: ExerciseType, seed = DEMO_PRESETS[exercise].seed, effect = DEMO_PRESETS[exercise].effect): DemoPlan {
  const rand = mulberry32(seed);
  const make = MAKE_REP[exercise];
  return {
    calibration: Array.from({ length: DEMO_CALIBRATION_REPS }, () => make(0, rand)),
    monitoring: DEMO_FATIGUE.map((f) => make(f * effect, rand)),
    recovery: Array.from({ length: 3 }, () => make(DEMO_RECOVERY_FATIGUE * effect, rand)),
  };
}
