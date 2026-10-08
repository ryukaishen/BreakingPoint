// The sample athlete's training history, produced by the real pipeline.
//
// Each sample session runs the synthetic athlete through the same pose →
// segmentation → features → baseline → drift → detector chain as a live set,
// with a fatigue schedule chosen to show sustainable improvement over weeks
// (more fresh reps before fatigue, better recovery). The sample athlete always
// stops shortly after the breaking point warning, as the product asks.
//
// The output is saved as src/data/sampleHistory.json so the app loads it
// instantly; tests/sample_history.test.ts regenerates it and fails if the two
// ever differ. To refresh after a pipeline or detector change:
//   SAMPLE_GEN=1 npx vitest run tests/sample_history.test.ts

import type { ExerciseType } from '../biomechanics/catalog';
import type { DetectorConfig } from '../detection/config';
import { DemoController } from '../demo/demoController';
import { DEMO_CALIBRATION_REPS, MAKE_REP, type DemoPlan } from '../demo/demoScript';
import { resolveLaunch } from '../protocols/launch';
import { SessionEngine } from '../session/engine';
import { mulberry32 } from '../utils/stats';
import { calibrationQuality } from './quality';
import { buildSessionRecord, withRecovery } from './sessionRecord';
import type { SessionRecord } from './types';

export const SAMPLE_ATHLETE_ID = 'sample_athlete';
export const SAMPLE_ATHLETE_NAME = 'Sample athlete';
export const SAMPLE_WEEKLY_GOAL = 2;

/** Fatigue ramp after the fresh reps; the athlete stops shortly after the warning. */
const RAMP = [0.3, 0.5, 0.78, 1.0, 1.1];

interface SampleSessionSpec {
  /** Days before "today" when the sample is opened. */
  daysAgo: number;
  /** Fresh (unfatigued) reps before fatigue starts. */
  fresh: number;
  /** Fatigue left over at the recovery check (lower = better recovery). */
  recovery: number;
  seed: number;
}

interface SampleProtocolSpec {
  sportId: string;
  subSportId?: string;
  protocolId: string;
  exercise: ExerciseType;
  effect: number;
  sessions: SampleSessionSpec[];
}

export const SAMPLE_PROTOCOLS: SampleProtocolSpec[] = [
  {
    sportId: 'soccer',
    protocolId: 'jump-repeated',
    exercise: 'cmj',
    effect: 0.65,
    sessions: [
      { daysAgo: 37, fresh: 2, recovery: 0.55, seed: 11 },
      { daysAgo: 33, fresh: 3, recovery: 0.5, seed: 65 },
      { daysAgo: 30, fresh: 3, recovery: 0.5, seed: 117 },
      { daysAgo: 26, fresh: 4, recovery: 0.45, seed: 170 },
      { daysAgo: 19, fresh: 3, recovery: 0.4, seed: 223 },
      { daysAgo: 16, fresh: 4, recovery: 0.42, seed: 278 },
      { daysAgo: 12, fresh: 4, recovery: 0.35, seed: 330 },
      { daysAgo: 9, fresh: 5, recovery: 0.32, seed: 383 },
      { daysAgo: 5, fresh: 5, recovery: 0.3, seed: 436 },
    ],
  },
  {
    sportId: 'strength',
    protocolId: 'squat-bodyweight',
    exercise: 'squat',
    effect: 0.65,
    sessions: [
      { daysAgo: 35, fresh: 2, recovery: 0.5, seed: 11 },
      { daysAgo: 28, fresh: 3, recovery: 0.45, seed: 64 },
      { daysAgo: 21, fresh: 3, recovery: 0.42, seed: 117 },
      { daysAgo: 14, fresh: 4, recovery: 0.38, seed: 173 },
      { daysAgo: 7, fresh: 4, recovery: 0.35, seed: 226 },
      { daysAgo: 2, fresh: 5, recovery: 0.32, seed: 277 },
    ],
  },
  {
    sportId: 'racquet',
    subSportId: 'pickleball',
    protocolId: 'lunge-forward',
    exercise: 'lunge',
    effect: 0.6,
    sessions: [
      { daysAgo: 31, fresh: 2, recovery: 0.5, seed: 14 },
      { daysAgo: 24, fresh: 3, recovery: 0.45, seed: 65 },
      { daysAgo: 17, fresh: 4, recovery: 0.4, seed: 117 },
      { daysAgo: 10, fresh: 4, recovery: 0.36, seed: 170 },
    ],
  },
];

/** A stored sample session with its timing relative to "today". */
export interface SampleSessionSeed {
  daysAgo: number;
  record: Omit<SessionRecord, 'athleteId' | 'startedAt' | 'endedAt' | 'baselineSavedAt'>;
}

function samplePlan(exercise: ExerciseType, s: SampleSessionSpec, effect: number): DemoPlan {
  const rand = mulberry32(s.seed);
  const make = MAKE_REP[exercise];
  const fatigue = [...Array<number>(s.fresh).fill(0), ...RAMP];
  return {
    calibration: Array.from({ length: DEMO_CALIBRATION_REPS }, () => make(0, rand)),
    monitoring: fatigue.map((f) => make(f * effect, rand)),
    recovery: Array.from({ length: 3 }, () => make(s.recovery * effect, rand)),
  };
}

const EPOCH = '2000-01-01T00:00:00.000Z';

/** Run every sample session through the real pipeline (deterministic). */
export function generateSampleHistory(config: DetectorConfig): SampleSessionSeed[] {
  const out: SampleSessionSeed[] = [];
  for (const p of SAMPLE_PROTOCOLS) {
    const ctx = resolveLaunch(p.sportId, p.protocolId, p.subSportId);
    if (!ctx) throw new Error(`Sample protocol ${p.protocolId} is not launchable`);
    p.sessions.forEach((s, i) => {
      const engine = new SessionEngine(p.exercise, config, SAMPLE_ATHLETE_NAME, 'demo');
      const demo = new DemoController(engine, p.exercise, 16 / 9, s.seed, p.effect, samplePlan(p.exercise, s, p.effect));
      demo.runToEnd(true);
      const snap = engine.getSnapshot();
      if (!snap.baseline) throw new Error('Sample session did not calibrate');
      const rec = withRecovery(
        buildSessionRecord({
          id: `sample_${p.protocolId}_${i + 1}`,
          snap,
          ctx,
          athleteId: SAMPLE_ATHLETE_ID,
          source: 'demo',
          config,
          startedAt: EPOCH,
          endedAt: EPOCH,
          baselineSavedAt: EPOCH,
          calibration: calibrationQuality(snap.baseline, config),
        }),
        snap,
        EPOCH,
      );
      const { athleteId: _a, startedAt: _s, endedAt: _e, baselineSavedAt: _b, ...record } = rec;
      out.push({ daysAgo: s.daysAgo, record: roundDeep(record) });
    });
  }
  return out;
}

/** Fixture numbers are rounded so the JSON stays readable and stable across platforms. */
function roundDeep<T>(v: T): T {
  if (typeof v === 'number') return (Number.isInteger(v) ? v : Math.round(v * 1e6) / 1e6) as T;
  if (Array.isArray(v)) return v.map(roundDeep) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundDeep(x)])) as T;
  return v;
}

/** Turn stored seeds into dated sessions relative to `now` (so "this week" always has sample activity). */
export function materializeSampleSessions(seeds: readonly SampleSessionSeed[], now: Date): SessionRecord[] {
  return seeds.map((s, i) => {
    const start = new Date(now);
    start.setHours(17, 30 + (i % 3) * 7, 0, 0);
    start.setDate(start.getDate() - s.daysAgo);
    const end = new Date(start.getTime() + 9 * 60 * 1000);
    return {
      ...s.record,
      athleteId: SAMPLE_ATHLETE_ID,
      startedAt: start.toISOString(),
      endedAt: end.toISOString(),
      baselineSavedAt: start.toISOString(),
      recovery: s.record.recovery ? { ...s.record.recovery, completedAt: end.toISOString() } : null,
    };
  });
}
