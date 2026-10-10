// Version 1 → version 2 migration.
//
// Version 1 stored one baseline per movement ("breakingpoint.baseline.<exercise>")
// with no athlete identity, so a saved baseline cannot be proven to belong to
// anyone. Migration therefore never assigns them: they are copied into a
// "from an earlier version" list until the user picks an athlete or discards
// them. Version 1 keys are left untouched, so nothing is lost if this is wrong.

import type { Baseline } from '../baseline/baseline';
import type { ExerciseType } from '../biomechanics/catalog';
import type { DetectorConfig } from '../detection/config';
import type { KeyValueStore } from './kv';
import { readJson } from './kv';
import { calibrationQuality } from './quality';
import { cleanName, newId, type AthleteRepository } from './repository';
import { SCHEMA_VERSION, type LegacyBaseline } from './types';

export const V1_KEYS = {
  athlete: 'breakingpoint.athlete',
  baseline: (ex: ExerciseType) => `breakingpoint.baseline.${ex}`,
  heldRecord: (ex: ExerciseType) => `breakingpoint.record.held.${ex}`,
};

const EXERCISES: ExerciseType[] = ['squat', 'cmj', 'lunge'];

/** Version 1 baselines were per movement; this is the protocol each one was recorded with. */
export const V1_PROTOCOL: Record<ExerciseType, string> = { squat: 'squat-bodyweight', cmj: 'jump-repeated', lunge: 'lunge-forward' };

export interface MigrationReport {
  ran: boolean;
  athleteName: string | null;
  legacyBaselines: number;
  skipped: string[];
}

function validV1Baseline(raw: unknown, ex: ExerciseType): raw is Baseline {
  const b = raw as Baseline | null;
  return !!b && typeof b === 'object' && b.exercise === ex && !!b.features && !!b.reference && typeof b.reference.mu0 === 'number';
}

export function migrateV1(kv: KeyValueStore, repo: AthleteRepository, now = new Date()): MigrationReport {
  if (repo.kind !== 'real' || repo.hasMeta()) return { ran: false, athleteName: null, legacyBaselines: 0, skipped: [] };

  const rawName = kv.get(V1_KEYS.athlete);
  const name = rawName ? cleanName(rawName) : '';
  const athlete = name ? repo.createAthlete(name) : null;

  const legacy: LegacyBaseline[] = [];
  const skipped: string[] = [];
  for (const ex of EXERCISES) {
    const raw = readJson<unknown>(kv, V1_KEYS.baseline(ex));
    if (raw !== null) {
      if (validV1Baseline(raw, ex)) {
        legacy.push({
          id: newId('legacy'),
          exercise: ex,
          protocolId: V1_PROTOCOL[ex],
          savedName: typeof raw.athlete === 'string' ? raw.athlete : '',
          createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
          baseline: raw,
        });
      } else skipped.push(`Unreadable ${ex} baseline from version 1 (left in place, not imported)`);
    }
    // Pre-release builds stored a bare "reps held" number with no session behind it; it cannot be verified.
    if (kv.get(V1_KEYS.heldRecord(ex)) !== null) skipped.push(`Unverifiable ${ex} personal best without session history (left in place, not imported)`);
  }
  repo.writeLegacy(legacy);
  repo.writeMeta({
    schemaVersion: SCHEMA_VERSION,
    activeAthleteId: athlete?.id ?? null,
    migratedFromV1: { at: now.toISOString(), legacyBaselines: legacy.length, athleteName: name || null },
  });
  return { ran: true, athleteName: name || null, legacyBaselines: legacy.length, skipped };
}

/** Assign a version 1 baseline to an athlete the user chose. */
export function claimLegacyBaseline(repo: AthleteRepository, legacyId: string, athleteId: string, config: Pick<DetectorConfig, 'reference'>, now = new Date()): boolean {
  const item = repo.legacy().find((l) => l.id === legacyId);
  const athlete = repo.athlete(athleteId);
  if (!item || !athlete) return false;
  const baseline: Baseline = { ...item.baseline, athlete: athlete.name };
  const ok = repo.saveBaseline({
    athleteId,
    protocolId: item.protocolId,
    exercise: item.exercise,
    savedAt: now.toISOString(),
    baseline,
    calibration: calibrationQuality(baseline, config),
  });
  if (ok) repo.discardLegacy(legacyId);
  return ok;
}
