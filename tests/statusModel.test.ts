import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/data/kv';
import { AthleteRepository } from '../src/data/repository';
import { createSampleRepository } from '../src/data/sample';
import type { SessionRecord, StoredBaseline } from '../src/data/types';
import { deriveStatus } from '../src/components/status/statusModel';

function session(over: Partial<SessionRecord> & Pick<SessionRecord, 'id' | 'protocolId' | 'startedAt' | 'heldReps'>): SessionRecord {
  return {
    schemaVersion: 2,
    athleteId: 'ath',
    source: 'live',
    sportId: 'strength',
    exercise: 'squat',
    detectorConfigId: 'cfg',
    endedAt: over.startedAt,
    baselineSavedAt: over.startedAt,
    calibration: { nReps: 6, referenceSource: 'loo', mu0: 0.5, sigma0: 0.2, excludedFeatures: 0, totalFeatures: 4, ok: true, reasons: [] },
    reps: [],
    totalReps: over.heldReps,
    scoredReps: over.heldReps,
    onsetRep: null,
    breakpointRep: null,
    avgPre: null,
    avgPost: null,
    topChanges: [],
    patternId: null,
    recovery: null,
    quality: { scoredFraction: 1, meanCapture: 0.9, calibrationOk: true, eligible: true, reasons: [] },
    ...over,
  };
}

describe('status readout', () => {
  it('stays empty when the athlete has no sets and no saved baseline', () => {
    const model = deriveStatus({ sessions: [], baselines: [] });
    expect(model.movements).toEqual([]);
    expect(model.hero.held).toBeNull();
    expect(model.storedSets).toBe(0);
    expect(model.baseline.saved).toBe(false);
  });

  it('uses the latest counted set, not a newer set that did not count', () => {
    const counted = session({ id: 'a', protocolId: 'squat-bodyweight', startedAt: '2026-09-01T10:00:00.000Z', heldReps: 4 });
    const missed = session({
      id: 'b',
      protocolId: 'squat-bodyweight',
      startedAt: '2026-09-08T10:00:00.000Z',
      heldReps: 9,
      quality: { scoredFraction: 0.2, meanCapture: 0.4, calibrationOk: false, eligible: false, reasons: ['Capture was too poor to count.'] },
    });
    const model = deriveStatus({ sessions: [counted, missed], baselines: [] });
    expect(model.hero).toMatchObject({ held: 4, sessionId: 'a' });
    expect(model.latest?.id).toBe('b');
    expect(model.newerSetUncounted).toBe(true);
    expect(model.countedSets).toBe(1);
    expect(model.storedSets).toBe(2);
  });

  it('keeps a saved baseline visible before any set is stored', () => {
    const baseline = {
      athleteId: 'ath',
      protocolId: 'squat-bodyweight',
      exercise: 'squat',
      savedAt: '2026-09-02T10:00:00.000Z',
      baseline: { features: { depth: {} }, reference: { mu0: 1, sigma0: 1 } },
      calibration: { nReps: 6, referenceSource: 'loo', mu0: 1, sigma0: 1, excludedFeatures: 0, totalFeatures: 4, ok: true, reasons: [] },
    } as unknown as StoredBaseline;
    const model = deriveStatus({ sessions: [], baselines: [baseline] });
    expect(model.selected?.title).toBe('Bodyweight Squat');
    expect(model.baseline).toMatchObject({ saved: true, nReps: 6, countsTowardRecords: true });
    expect(model.hero.held).toBeNull();
  });

  it('reads the sample athlete from the in-memory repository and does not require browser storage', () => {
    const repo = createSampleRepository(new Date('2026-10-12T12:00:00.000Z'));
    const athlete = repo.activeAthlete();
    expect(athlete?.name).toBe('Sample athlete');
    const model = deriveStatus({ sessions: repo.sessions(athlete!.id), baselines: repo.baselines(athlete!.id) });
    expect(model.hero.held).not.toBeNull();
    expect(model.storedSets).toBeGreaterThan(0);
    expect(model.movements.length).toBeGreaterThan(1);
    expect(model.baseline.saved).toBe(false);
  });

  it('lists saved baselines without changing storage', () => {
    const kv = new MemoryStore();
    const repo = new AthleteRepository(kv, 'real');
    const profile = repo.createAthlete('Ada');
    const baseline = {
      athleteId: profile.id,
      protocolId: 'squat-bodyweight',
      exercise: 'squat',
      savedAt: '2026-09-02T10:00:00.000Z',
      baseline: { features: { depth: {} }, reference: { mu0: 1, sigma0: 1 } },
      calibration: { nReps: 5, referenceSource: 'loo', mu0: 1, sigma0: 1, excludedFeatures: 0, totalFeatures: 4, ok: true, reasons: [] },
    } as unknown as StoredBaseline;
    expect(repo.saveBaseline(baseline)).toBe(true);
    expect(repo.baselines(profile.id).map((b) => b.protocolId)).toEqual(['squat-bodyweight']);
  });
});
