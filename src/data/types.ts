// Athlete data model (schema v2). Everything is keyed by athlete identity; a
// future coach or squad layer can group athletes without changing these records.

import type { Baseline } from '../baseline/baseline';
import type { ExerciseType } from '../biomechanics/catalog';
import type { MovementState } from '../detection/detector';
import type { RecoveryStatus } from '../detection/recovery';

export const SCHEMA_VERSION = 2;

/** Where a session's frames came from. Real records only ever contain 'live'; the sample athlete only 'demo'. */
export type SessionSource = 'live' | 'demo';

export interface AthleteProfile {
  id: string;
  name: string;
  createdAt: string;
  /** Training days per week the athlete chose for themselves; null until they set one. */
  weeklyGoal: number | null;
  /** Optional spoken cues during live sessions. */
  voiceCues: boolean;
}

export interface CalibrationQuality {
  nReps: number;
  referenceSource: 'loo' | 'default';
  mu0: number;
  sigma0: number;
  /** Features excluded from the baseline for low landmark confidence. */
  excludedFeatures: number;
  totalFeatures: number;
  /** Good enough for this baseline's sessions to count toward records. */
  ok: boolean;
  reasons: string[];
}

export interface StoredBaseline {
  athleteId: string;
  protocolId: string;
  exercise: ExerciseType;
  savedAt: string;
  baseline: Baseline;
  calibration: CalibrationQuality;
}

export interface SessionRep {
  index: number;
  /** Movement Drift Score, null when the rep was not scored (capture too poor). */
  score: number | null;
  state: MovementState | null;
  ewma: number | null;
  /** Mean landmark confidence over the rep, 0–1. */
  quality: number;
  /** Rep performed after the breaking point warning. Never counted toward anything. */
  afterWarning: boolean;
}

export interface SessionChange {
  key: string;
  meanZ: number;
}

export interface SessionRecovery {
  percent: number;
  status: RecoveryStatus;
  meanRecovery: number;
  meanPost: number;
  scores: (number | null)[];
  completedAt: string;
}

export interface SessionQuality {
  scoredFraction: number;
  meanCapture: number;
  calibrationOk: boolean;
  /** True when this set may be compared with others and count toward records. */
  eligible: boolean;
  reasons: string[];
}

export interface SessionRecord {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  athleteId: string;
  source: SessionSource;
  sportId: string;
  subSportId?: string;
  protocolId: string;
  exercise: ExerciseType;
  detectorConfigId: string;
  startedAt: string;
  endedAt: string;
  baselineSavedAt: string;
  calibration: CalibrationQuality;
  reps: SessionRep[];
  totalReps: number;
  scoredReps: number;
  /** Consecutive STABLE reps from the start of the set before drift began. */
  heldReps: number;
  onsetRep: number | null;
  breakpointRep: number | null;
  avgPre: number | null;
  avgPost: number | null;
  topChanges: SessionChange[];
  patternId: string | null;
  recovery: SessionRecovery | null;
  quality: SessionQuality;
}

/** A baseline saved by version 1, kept aside until the user says whose it is. */
export interface LegacyBaseline {
  id: string;
  exercise: ExerciseType;
  protocolId: string;
  /** The athlete name stored inside the old baseline (not proof of ownership). */
  savedName: string;
  createdAt: string;
  baseline: Baseline;
}

export interface StoreMeta {
  schemaVersion: number;
  activeAthleteId: string | null;
  migratedFromV1?: { at: string; legacyBaselines: number; athleteName: string | null };
}
