// Recovery drafts for live work interrupted by a refresh, crash, or closed tab.
//
// Browser unload handlers are not reliable, so a live set is checkpointed after
// every rep. If the page disappears, the next visit offers the reps that really
// were measured. Nothing is estimated: a draft is a SessionRecord built from the
// engine's own output at the last checkpoint.
//
// Integrity rules:
//  - Live sets only. Demo and sample data never get a draft.
//  - An interrupted set is saved as an ordinary set in the athlete's history but is
//    marked not eligible, so it can never set a record, raise a milestone's record
//    count, or be used as a comparison. (It is real training, so it still shows in
//    history and counts as a training day.)
//  - Drafts are untrusted input: localStorage can be edited or corrupted, so every
//    field is validated and unknown fields are dropped before anything is saved.

import { readJson, writeJson, type KeyValueStore } from './kv';
import { SCHEMA_VERSION, type SessionRecord } from './types';

export const DRAFT_PREFIX = 'bp.v2.draft.';
export const draftKey = (athleteId: string): string => DRAFT_PREFIX + athleteId;

export const INTERRUPTED_REASON = 'Interrupted before the set ended';
const MAX_REPS = 500;

/** A monitored set that was in progress. */
export interface SetDraft {
  v: 1;
  kind: 'set';
  savedAt: string;
  record: SessionRecord;
}

/** A calibration that was in progress. Nothing to restore (the baseline never locked); kept only so the athlete is told. */
export interface CalibrationDraft {
  v: 1;
  kind: 'calibration';
  savedAt: string;
  athleteId: string;
  protocolId: string;
  /** Calibration reps captured before the interruption. */
  reps: number;
}

export type Draft = SetDraft | CalibrationDraft;

// ---------------------------------------------------------------- validation
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown, max = 200): x is string => typeof x === 'string' && x.length > 0 && x.length <= max;
const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const numOrNull = (x: unknown): boolean => x === null || num(x);
const int = (x: unknown, min = 0): x is number => typeof x === 'number' && Number.isInteger(x) && x >= min;
const iso = (x: unknown): x is string => str(x, 40) && !Number.isNaN(Date.parse(x));
const STATES = ['STABLE', 'DRIFT', 'BREAKPOINT'];

function validRep(r: unknown): boolean {
  return (
    isObj(r) &&
    int(r.index, 1) &&
    numOrNull(r.score) &&
    (r.state === null || (typeof r.state === 'string' && STATES.includes(r.state))) &&
    numOrNull(r.ewma) &&
    num(r.quality) &&
    r.quality >= 0 &&
    r.quality <= 1 &&
    typeof r.afterWarning === 'boolean'
  );
}

function validRecord(rec: unknown): rec is SessionRecord {
  if (!isObj(rec)) return false;
  if (rec.schemaVersion !== SCHEMA_VERSION || rec.source !== 'live') return false;
  if (![rec.id, rec.athleteId, rec.sportId, rec.protocolId, rec.exercise, rec.detectorConfigId].every((x) => str(x))) return false;
  if (![rec.startedAt, rec.endedAt, rec.baselineSavedAt].every(iso)) return false;
  if (!Array.isArray(rec.reps) || rec.reps.length < 1 || rec.reps.length > MAX_REPS || !rec.reps.every(validRep)) return false;
  if (rec.totalReps !== rec.reps.length || !int(rec.scoredReps) || rec.scoredReps > rec.reps.length) return false;
  if (!int(rec.heldReps) || rec.heldReps > rec.reps.length) return false;
  if (!(rec.onsetRep === null || int(rec.onsetRep, 1)) || !(rec.breakpointRep === null || int(rec.breakpointRep, 1))) return false;
  const cal = rec.calibration;
  if (!isObj(cal) || typeof cal.ok !== 'boolean' || !num(cal.nReps) || !num(cal.sigma0) || !Array.isArray(cal.reasons)) return false;
  const q = rec.quality;
  if (!isObj(q) || typeof q.eligible !== 'boolean' || !Array.isArray(q.reasons) || !q.reasons.every((x) => typeof x === 'string')) return false;
  return Array.isArray(rec.topChanges);
}

/** Validate untrusted JSON as a draft; null when anything is off. */
export function parseDraft(raw: unknown): Draft | null {
  if (!isObj(raw) || raw.v !== 1 || !iso(raw.savedAt)) return null;
  if (raw.kind === 'set') return validRecord(raw.record) ? { v: 1, kind: 'set', savedAt: raw.savedAt, record: raw.record } : null;
  if (raw.kind === 'calibration' && str(raw.athleteId) && str(raw.protocolId) && int(raw.reps)) {
    return { v: 1, kind: 'calibration', savedAt: raw.savedAt, athleteId: raw.athleteId, protocolId: raw.protocolId, reps: raw.reps };
  }
  return null;
}

export const draftAthleteId = (d: Draft): string => (d.kind === 'set' ? d.record.athleteId : d.athleteId);

// ---------------------------------------------------------------- storage
/** One draft per athlete: the newest checkpoint replaces the last. */
export function saveDraft(kv: KeyValueStore, d: Draft): boolean {
  return writeJson(kv, draftKey(draftAthleteId(d)), d);
}

/** The athlete's draft, or null. A corrupt or tampered entry is removed so it cannot block recovery forever. */
export function loadDraft(kv: KeyValueStore, athleteId: string): Draft | null {
  const key = draftKey(athleteId);
  const raw = readJson<unknown>(kv, key);
  if (raw === null) {
    if (kv.get(key) !== null) kv.remove(key); // present but not JSON
    return null;
  }
  const d = parseDraft(raw);
  if (!d || draftAthleteId(d) !== athleteId) {
    kv.remove(key);
    return null;
  }
  return d;
}

export function clearDraft(kv: KeyValueStore, athleteId: string): void {
  kv.remove(draftKey(athleteId));
}

/** Every valid draft on this device (one per athlete), oldest first. */
export function listDrafts(kv: KeyValueStore): Draft[] {
  const out: Draft[] = [];
  for (const key of kv.keys()) {
    if (!key.startsWith(DRAFT_PREFIX)) continue;
    const d = loadDraft(kv, key.slice(DRAFT_PREFIX.length));
    if (d) out.push(d);
  }
  return out.sort((a, b) => a.savedAt.localeCompare(b.savedAt));
}

// ---------------------------------------------------------------- recovery
const RECORD_KEYS: (keyof SessionRecord)[] = [
  'schemaVersion', 'id', 'athleteId', 'source', 'sportId', 'subSportId', 'protocolId', 'exercise', 'detectorConfigId', 'startedAt', 'endedAt',
  'baselineSavedAt', 'calibration', 'reps', 'totalReps', 'scoredReps', 'heldReps', 'onsetRep', 'breakpointRep', 'avgPre', 'avgPost', 'topChanges',
  'patternId', 'recovery', 'quality',
];

/**
 * The record to store when the athlete chooses to keep an interrupted set.
 * Ends at the last checkpoint, carries no recovery check, and is never eligible for records.
 */
export function interruptedRecord(d: SetDraft): SessionRecord {
  const src = d.record as unknown as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const k of RECORD_KEYS) if (src[k] !== undefined) clean[k] = src[k];
  const rec = clean as unknown as SessionRecord;
  return {
    ...rec,
    endedAt: d.savedAt,
    recovery: null,
    quality: {
      ...rec.quality,
      eligible: false,
      reasons: rec.quality.reasons.includes(INTERRUPTED_REASON) ? rec.quality.reasons : [...rec.quality.reasons, INTERRUPTED_REASON],
    },
  };
}
