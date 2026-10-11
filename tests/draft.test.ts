// Recovery drafts: validation of untrusted storage, and the guarantee that an
// interrupted set can never become a record.
import { describe, expect, it } from 'vitest';
import { clearDraft, draftKey, interruptedRecord, INTERRUPTED_REASON, listDrafts, loadDraft, parseDraft, saveDraft, type SetDraft } from '../src/data/draft';
import { MemoryStore } from '../src/data/kv';
import { heldOutcome, personalRecords, recordSteps, trainingWeeks } from '../src/data/progress';
import { AthleteRepository } from '../src/data/repository';
import { createSampleRepository } from '../src/data/sample';
import type { SessionRecord, SessionRep } from '../src/data/types';

const reps = (states: ('STABLE' | 'DRIFT' | 'BREAKPOINT')[]): SessionRep[] =>
  states.map((s, i) => ({ index: i + 1, score: 0.5, state: s, ewma: 0.5, quality: 0.9, afterWarning: false }));

let n = 0;
function rec(athleteId: string, held: number, over: Partial<SessionRecord> = {}): SessionRecord {
  n++;
  const r = reps([...Array(held).fill('STABLE'), 'DRIFT']);
  return {
    schemaVersion: 2,
    id: `set_${n}`,
    athleteId,
    source: 'live',
    sportId: 'strength',
    protocolId: 'squat-bodyweight',
    exercise: 'squat',
    detectorConfigId: 'cfg-1',
    startedAt: new Date(Date.UTC(2026, 8, 1 + n, 12)).toISOString(),
    endedAt: new Date(Date.UTC(2026, 8, 1 + n, 12, 10)).toISOString(),
    baselineSavedAt: '2026-09-01T10:00:00.000Z',
    calibration: { nReps: 6, referenceSource: 'loo', mu0: 0.6, sigma0: 0.25, excludedFeatures: 0, totalFeatures: 4, ok: true, reasons: [] },
    reps: r,
    totalReps: r.length,
    scoredReps: r.length,
    heldReps: held,
    onsetRep: held + 1,
    breakpointRep: null,
    avgPre: 0.5,
    avgPost: null,
    topChanges: [],
    patternId: null,
    recovery: null,
    quality: { scoredFraction: 1, meanCapture: 0.9, calibrationOk: true, eligible: true, reasons: [] },
    ...over,
  };
}

const setDraft = (record: SessionRecord, savedAt = '2026-09-20T09:30:00.000Z'): SetDraft => ({ v: 1, kind: 'set', savedAt, record });

describe('draft storage', () => {
  it('round-trips a set draft and a calibration draft, one per athlete', () => {
    const kv = new MemoryStore();
    const d = setDraft(rec('ath_1', 5));
    expect(saveDraft(kv, d)).toBe(true);
    expect(loadDraft(kv, 'ath_1')).toEqual(d);
    expect(saveDraft(kv, { v: 1, kind: 'calibration', savedAt: '2026-09-20T09:31:00.000Z', athleteId: 'ath_1', protocolId: 'squat-bodyweight', reps: 3 })).toBe(true);
    expect(loadDraft(kv, 'ath_1')?.kind).toBe('calibration'); // newest checkpoint replaces the last
    clearDraft(kv, 'ath_1');
    expect(loadDraft(kv, 'ath_1')).toBeNull();
  });

  it('lists every athlete’s draft, oldest first', () => {
    const kv = new MemoryStore();
    saveDraft(kv, setDraft(rec('ath_b', 4), '2026-09-21T08:00:00.000Z'));
    saveDraft(kv, setDraft(rec('ath_a', 4), '2026-09-20T08:00:00.000Z'));
    kv.set('bp.v2.athletes', '[]'); // unrelated keys are ignored
    expect(listDrafts(kv).map((d) => d.savedAt)).toEqual(['2026-09-20T08:00:00.000Z', '2026-09-21T08:00:00.000Z']);
  });

  it('removes a corrupt or mismatched entry instead of blocking recovery forever', () => {
    const kv = new MemoryStore();
    kv.set(draftKey('ath_1'), '{not json');
    expect(loadDraft(kv, 'ath_1')).toBeNull();
    expect(kv.get(draftKey('ath_1'))).toBeNull();

    saveDraft(kv, setDraft(rec('ath_2', 4)));
    kv.set(draftKey('ath_3'), kv.get(draftKey('ath_2')) as string); // stored under another athlete's key
    expect(loadDraft(kv, 'ath_3')).toBeNull();
    expect(kv.get(draftKey('ath_3'))).toBeNull();
  });
});

describe('draft validation (storage is untrusted)', () => {
  const ok = () => JSON.parse(JSON.stringify(setDraft(rec('ath_1', 5)))) as Record<string, unknown> & { record: Record<string, unknown> & { reps: Record<string, unknown>[] } };

  it('accepts a well-formed draft', () => {
    expect(parseDraft(ok())).not.toBeNull();
  });

  it.each([
    ['demo source', (d: ReturnType<typeof ok>) => (d.record.source = 'demo')],
    ['wrong schema version', (d: ReturnType<typeof ok>) => (d.record.schemaVersion = 1)],
    ['unknown draft version', (d: ReturnType<typeof ok>) => (d.v = 2)],
    ['unknown kind', (d: ReturnType<typeof ok>) => (d.kind = 'recovery')],
    ['no reps', (d: ReturnType<typeof ok>) => ((d.record.reps = []), (d.record.totalReps = 0))],
    ['too many reps', (d: ReturnType<typeof ok>) => ((d.record.reps = Array(501).fill(d.record.reps[0])), (d.record.totalReps = 501))],
    ['bad movement state', (d: ReturnType<typeof ok>) => (d.record.reps[0].state = 'FAST')],
    ['non-finite score', (d: ReturnType<typeof ok>) => (d.record.reps[0].score = 'NaN')],
    ['capture quality above 1', (d: ReturnType<typeof ok>) => (d.record.reps[0].quality = 7)],
    ['rep count mismatch', (d: ReturnType<typeof ok>) => (d.record.totalReps = 99)],
    ['held more reps than were performed', (d: ReturnType<typeof ok>) => (d.record.heldReps = 99)],
    ['empty athlete id', (d: ReturnType<typeof ok>) => (d.record.athleteId = '')],
    ['bad timestamp', (d: ReturnType<typeof ok>) => (d.record.startedAt = 'yesterday-ish')],
    ['missing quality block', (d: ReturnType<typeof ok>) => delete d.record.quality],
    ['missing calibration block', (d: ReturnType<typeof ok>) => delete d.record.calibration],
  ])('rejects %s', (_name, tamper) => {
    const d = ok();
    tamper(d);
    expect(parseDraft(d)).toBeNull();
  });

  it('rejects non-objects', () => {
    for (const x of [null, 1, 'x', [], undefined]) expect(parseDraft(x)).toBeNull();
  });
});

describe('an interrupted set can never become a record', () => {
  it('is not eligible, ends at the checkpoint, has no recovery, and drops unknown fields', () => {
    const d = setDraft(rec('ath_1', 12), '2026-09-20T09:30:00.000Z');
    (d.record as unknown as Record<string, unknown>).injected = 'x';
    const out = interruptedRecord(d);
    expect(out.quality.eligible).toBe(false);
    expect(out.quality.reasons).toContain(INTERRUPTED_REASON);
    expect(out.endedAt).toBe('2026-09-20T09:30:00.000Z');
    expect(out.recovery).toBeNull();
    expect((out as unknown as Record<string, unknown>).injected).toBeUndefined();
    expect(out.heldReps).toBe(12); // the measurement itself is kept
    expect(interruptedRecord(setDraft(out)).quality.reasons.filter((r) => r === INTERRUPTED_REASON)).toHaveLength(1);
  });

  it('does not touch records, comparisons or the staircase, but still counts as training', () => {
    const repo = new AthleteRepository(new MemoryStore(), 'real');
    const a = repo.createAthlete('Avery');
    repo.saveSession(rec(a.id, 8));
    const interrupted = interruptedRecord(setDraft(rec(a.id, 20)));
    expect(repo.saveSession(interrupted)).toBe(true);

    const history = repo.sessions(a.id);
    expect(history).toHaveLength(2);
    expect(personalRecords(history, 'squat-bodyweight').mostHeld?.value).toBe(8);
    expect(recordSteps(history, 'squat-bodyweight').map((s) => s.held)).toEqual([8]);

    const next = rec(a.id, 9, { startedAt: new Date(Date.UTC(2027, 0, 1)).toISOString() });
    const outcome = heldOutcome([...history, next], next);
    expect(outcome.previousBest).toBe(8);
    expect(outcome.kind).toBe('new-record');

    const days = trainingWeeks(history, 2, new Date(Date.UTC(2026, 8, 30)), 6).reduce((s, w) => s + w.days, 0);
    expect(days).toBe(2); // both the finished and the interrupted set were training
  });

  it('the sample athlete refuses it: demo data and live drafts never mix', () => {
    const sample = createSampleRepository();
    const athlete = sample.activeAthlete();
    expect(athlete).not.toBeNull();
    expect(sample.saveSession(interruptedRecord(setDraft(rec(athlete!.id, 5))))).toBe(false);
  });

  it('is refused for an athlete that no longer exists', () => {
    const repo = new AthleteRepository(new MemoryStore(), 'real');
    expect(repo.saveSession(interruptedRecord(setDraft(rec('deleted_athlete', 5))))).toBe(false);
  });
});
