// Athlete data integrity: identity, isolation between athletes, isolation of
// synthetic data, version 1 migration, and record/milestone rules.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Baseline } from '../src/baseline/baseline';
import { parseDetectorConfig } from '../src/detection/config';
import { MemoryStore } from '../src/data/kv';
import { claimLegacyBaseline, migrateV1, V1_KEYS } from '../src/data/migrate';
import { goalStreak, heldOutcome, heldReps, milestones, personalRecords, recordSteps, stillHolding, trainingWeeks } from '../src/data/progress';
import { calibrationQuality, sessionQuality } from '../src/data/quality';
import { AthleteRepository } from '../src/data/repository';
import { createSampleRepository, SAMPLE_ATHLETE_ID } from '../src/data/sample';
import type { SessionRecord, SessionRep, StoredBaseline } from '../src/data/types';

const cfg = parseDetectorConfig(JSON.parse(readFileSync('public/breakingpoint_detector_config.json', 'utf8')));

function baseline(over: Partial<Baseline> = {}): Baseline {
  const f = { n: 6, mean: 1, median: 1, sd: 0.1, mad: 0.1, min: 0.8, max: 1.2, center: 1, scale: 0.1 };
  return {
    exercise: 'squat',
    athlete: 'Someone',
    createdAt: '2026-09-01T10:00:00.000Z',
    nReps: 6,
    features: { depth: f, trunkLean: f, kneeRomL: f, kneeRomR: f },
    reference: { mu0: 0.6, sigma0: 0.25, looScores: [0.5, 0.6, 0.7], source: 'loo' },
    ...over,
  };
}

function stored(athleteId: string, protocolId = 'squat-bodyweight'): StoredBaseline {
  const b = baseline();
  return { athleteId, protocolId, exercise: 'squat', savedAt: '2026-09-01T10:00:00.000Z', baseline: b, calibration: calibrationQuality(b, cfg) };
}

const reps = (states: ('STABLE' | 'DRIFT' | 'BREAKPOINT')[], quality = 0.9): SessionRep[] =>
  states.map((s, i) => ({ index: i + 1, score: 0.5, state: s, ewma: 0.5, quality, afterWarning: false }));

let n = 0;
function session(athleteId: string, held: number, over: Partial<SessionRecord> = {}): SessionRecord {
  const b = baseline();
  const cal = calibrationQuality(b, cfg);
  const r = reps([...Array(held).fill('STABLE'), 'DRIFT', 'DRIFT', 'BREAKPOINT']);
  n++;
  return {
    schemaVersion: 2,
    id: `s${n}`,
    athleteId,
    source: 'live',
    sportId: 'strength',
    protocolId: 'squat-bodyweight',
    exercise: 'squat',
    detectorConfigId: 'cfg-1',
    startedAt: new Date(Date.UTC(2026, 8, 1 + n)).toISOString(),
    endedAt: new Date(Date.UTC(2026, 8, 1 + n, 0, 10)).toISOString(),
    baselineSavedAt: '2026-09-01T10:00:00.000Z',
    calibration: cal,
    reps: r,
    totalReps: r.length,
    scoredReps: r.length,
    heldReps: held,
    onsetRep: held,
    breakpointRep: held + 3,
    avgPre: 0.5,
    avgPost: 1.5,
    topChanges: [],
    patternId: null,
    recovery: null,
    quality: sessionQuality(r, cal),
    ...over,
  };
}

describe('athlete identity and isolation', () => {
  it('keys baselines by athlete and protocol', () => {
    const repo = new AthleteRepository(new MemoryStore(), 'real');
    const a = repo.createAthlete('Avery');
    const b = repo.createAthlete('Blake');
    expect(repo.saveBaseline(stored(a.id))).toBe(true);
    expect(repo.baseline(a.id, 'squat-bodyweight')).not.toBeNull();
    expect(repo.baseline(b.id, 'squat-bodyweight')).toBeNull();
    expect(repo.baseline(a.id, 'jump-repeated')).toBeNull();
    repo.clearBaseline(a.id, 'squat-bodyweight');
    expect(repo.baseline(a.id, 'squat-bodyweight')).toBeNull();
  });

  it('keeps each athlete’s session history and records separate', () => {
    const repo = new AthleteRepository(new MemoryStore(), 'real');
    const a = repo.createAthlete('Avery');
    const b = repo.createAthlete('Blake');
    repo.saveSession(session(a.id, 9));
    repo.saveSession(session(b.id, 3));
    expect(repo.sessions(a.id).map((s) => s.heldReps)).toEqual([9]);
    expect(repo.sessions(b.id).map((s) => s.heldReps)).toEqual([3]);
    expect(personalRecords(repo.sessions(b.id), 'squat-bodyweight').mostHeld?.value).toBe(3);
  });

  it('refuses sessions for unknown athletes and baselines for unknown athletes', () => {
    const repo = new AthleteRepository(new MemoryStore(), 'real');
    expect(repo.saveSession(session('ghost', 5))).toBe(false);
    expect(repo.saveBaseline(stored('ghost'))).toBe(false);
  });

  it('renames keep identity; the first athlete becomes active', () => {
    const repo = new AthleteRepository(new MemoryStore(), 'real');
    const a = repo.createAthlete('  Avery   Q ');
    expect(a.name).toBe('Avery Q');
    repo.createAthlete('Blake');
    expect(repo.activeAthlete()?.id).toBe(a.id);
    repo.updateAthlete(a.id, { name: 'Avery R' });
    expect(repo.activeAthlete()?.name).toBe('Avery R');
    expect(repo.updateAthlete(a.id, { name: '   ' })).toBeNull();
    expect(() => repo.createAthlete('')).toThrow();
  });
});

describe('synthetic data isolation', () => {
  it('the real repository never accepts synthetic sessions', () => {
    const repo = new AthleteRepository(new MemoryStore(), 'real');
    const a = repo.createAthlete('Avery');
    expect(repo.saveSession(session(a.id, 12, { source: 'demo' }))).toBe(false);
    expect(repo.sessions(a.id)).toEqual([]);
  });

  it('the sample athlete lives in memory and never writes browser storage', () => {
    const realKv = new MemoryStore();
    const real = new AthleteRepository(realKv, 'real');
    real.createAthlete('Avery');
    const before = JSON.stringify(realKv.keys().map((k) => [k, realKv.get(k)]));
    const sample = createSampleRepository(new Date('2026-10-08T12:00:00'));
    expect(sample.kind).toBe('sample');
    expect(sample.saveSession(session(SAMPLE_ATHLETE_ID, 7, { source: 'demo' }))).toBe(true);
    expect(sample.saveSession(session(SAMPLE_ATHLETE_ID, 7, { source: 'live' }))).toBe(false);
    expect(JSON.stringify(realKv.keys().map((k) => [k, realKv.get(k)]))).toBe(before);
    expect(real.sessions(SAMPLE_ATHLETE_ID)).toEqual([]);
  });

  it('the sample history is complete, synthetic and shows a record to beat', () => {
    const sample = createSampleRepository(new Date('2026-10-08T12:00:00'));
    const all = sample.sessions(SAMPLE_ATHLETE_ID);
    expect(all.length).toBeGreaterThan(10);
    expect(all.every((s) => s.source === 'demo')).toBe(true);
    expect(personalRecords(all, 'jump-repeated').mostHeld?.value).toBe(6);
  });
});

describe('version 1 migration', () => {
  function v1Store() {
    const kv = new MemoryStore();
    kv.set(V1_KEYS.athlete, 'Adam');
    kv.set(V1_KEYS.baseline('squat'), JSON.stringify(baseline({ athlete: 'Adam' })));
    kv.set(V1_KEYS.baseline('cmj'), '{not json');
    kv.set(V1_KEYS.heldRecord('squat'), '8');
    return kv;
  }

  it('keeps the athlete name, holds baselines aside, assigns nothing, and leaves v1 keys in place', () => {
    const kv = v1Store();
    const before = kv.keys().map((k) => [k, kv.get(k)]);
    const repo = new AthleteRepository(kv, 'real');
    const report = migrateV1(kv, repo);
    expect(report.ran).toBe(true);
    expect(report.athleteName).toBe('Adam');
    expect(report.legacyBaselines).toBe(1);
    expect(report.skipped.length).toBe(1);
    const adam = repo.activeAthlete()!;
    expect(adam.name).toBe('Adam');
    expect(repo.baseline(adam.id, 'squat-bodyweight')).toBeNull();
    expect(repo.legacy()[0].savedName).toBe('Adam');
    for (const [k, v] of before) expect(kv.get(k as string)).toBe(v);
  });

  it('is idempotent', () => {
    const kv = v1Store();
    const repo = new AthleteRepository(kv, 'real');
    migrateV1(kv, repo);
    expect(migrateV1(kv, repo).ran).toBe(false);
    expect(repo.athletes().length).toBe(1);
    expect(repo.legacy().length).toBe(1);
  });

  it('a held-aside baseline goes only to the athlete the user picks', () => {
    const kv = v1Store();
    const repo = new AthleteRepository(kv, 'real');
    migrateV1(kv, repo);
    const blake = repo.createAthlete('Blake');
    const item = repo.legacy()[0];
    expect(claimLegacyBaseline(repo, item.id, blake.id, cfg)).toBe(true);
    expect(repo.baseline(blake.id, 'squat-bodyweight')?.baseline.athlete).toBe('Blake');
    expect(repo.baseline(repo.athletes()[0].id, 'squat-bodyweight')).toBeNull();
    expect(repo.legacy()).toEqual([]);
  });

  it('a fresh install starts empty', () => {
    const kv = new MemoryStore();
    const repo = new AthleteRepository(kv, 'real');
    const report = migrateV1(kv, repo);
    expect(report.ran).toBe(true);
    expect(repo.athletes()).toEqual([]);
    expect(repo.legacy()).toEqual([]);
  });
});

describe('records only under comparable conditions', () => {
  const A = 'ath_a';

  it('a new record needs a strictly higher count than the best earlier comparable set', () => {
    const h = [session(A, 4), session(A, 6), session(A, 5)];
    expect(heldOutcome(h, h[0]).kind).toBe('first-record');
    expect(heldOutcome(h, h[1]).kind).toBe('new-record');
    expect(heldOutcome(h, h[2]).kind).toBe('below');
    const same = session(A, 6);
    expect(heldOutcome([...h, same], same).kind).toBe('matched');
  });

  it('sets that fail the quality floor never count and are never compared', () => {
    const good = session(A, 5);
    const r = reps(['STABLE', 'STABLE', 'STABLE', 'STABLE', 'STABLE', 'STABLE', 'STABLE', 'STABLE', 'DRIFT'], 0.4);
    const cal = good.calibration;
    const blurry = session(A, 8, { reps: r, quality: sessionQuality(r, cal) });
    expect(blurry.quality.eligible).toBe(false);
    expect(heldOutcome([good, blurry], blurry).kind).toBe('not-eligible');
    expect(personalRecords([good, blurry], 'squat-bodyweight').mostHeld?.value).toBe(5);
  });

  it('a loose calibration cannot inflate records', () => {
    const loose = baseline({ reference: { mu0: 0.6, sigma0: cfg.reference.sigma0Max, looScores: [], source: 'loo' } });
    const cal = calibrationQuality(loose, cfg);
    expect(cal.ok).toBe(false);
    const s = session(A, 12, { calibration: cal, quality: sessionQuality(reps(['STABLE', 'STABLE', 'STABLE']), cal) });
    expect(heldOutcome([session(A, 5), s], s).kind).toBe('not-eligible');
  });

  it('sets from a different detector version or protocol are not compared', () => {
    const old = session(A, 9, { detectorConfigId: 'cfg-0' });
    const now = session(A, 6);
    expect(heldOutcome([old, now], now).kind).toBe('first-record');
    const other = session(A, 9, { protocolId: 'jump-repeated' });
    expect(heldOutcome([other, now], now).kind).toBe('first-record');
  });

  it('the staircase only steps up on genuine raises', () => {
    const h = [session(A, 3), session(A, 5), session(A, 4), session(A, 7)];
    expect(recordSteps(h, 'squat-bodyweight').map((s) => [s.best, s.raised])).toEqual([
      [3, true],
      [5, true],
      [5, false],
      [7, true],
    ]);
  });
});

describe('milestones and weekly goals', () => {
  const A = 'ath_a';
  const now = new Date('2026-10-08T12:00:00');

  it('counts distinct training days per week; rest days never break anything', () => {
    const at = (d: string) => session(A, 4, { startedAt: new Date(d).toISOString() });
    const h = [at('2026-09-21T09:00:00'), at('2026-09-23T09:00:00'), at('2026-09-29T09:00:00'), at('2026-09-29T18:00:00'), at('2026-10-02T09:00:00'), at('2026-10-06T09:00:00')];
    const weeks = trainingWeeks(h, 2, now, 4);
    expect(weeks.map((w) => w.days)).toEqual([0, 2, 2, 1]);
    expect(weeks.map((w) => w.met)).toEqual([false, true, true, false]);
    expect(goalStreak(weeks)).toBe(2);
    expect(trainingWeeks(h, null, now, 4).every((w) => w.met === null)).toBe(true);
  });

  it('back to baseline is earned only by a recovery check rated recovered', () => {
    const partial = session(A, 5, { recovery: { percent: 0.8, status: 'partial', meanRecovery: 1, meanPost: 2, scores: [], completedAt: now.toISOString() } });
    let m = milestones([partial], { weeklyGoal: 2 }, 'squat-bodyweight', now).find((x) => x.id === 'back-to-baseline')!;
    expect(m.earned).toBe(false);
    expect(m.detail).toBe('Best so far 80%');
    const ok = session(A, 5, { recovery: { percent: 0.9, status: 'recovered', meanRecovery: 0.7, meanPost: 2, scores: [], completedAt: now.toISOString() } });
    m = milestones([partial, ok], { weeklyGoal: 2 }, 'squat-bodyweight', now).find((x) => x.id === 'back-to-baseline')!;
    expect(m.earned).toBe(true);
  });

  it('the breaking point itself never earns anything', () => {
    const h = [session(A, 4), session(A, 4), session(A, 4)];
    const ms = milestones(h, { weeklyGoal: null }, 'squat-bodyweight', now);
    expect(ms.find((x) => x.id === 'new-record')!.earned).toBe(false);
    expect(ms.some((x) => /break/i.test(x.title))).toBe(false);
  });
});

describe('reps held at baseline', () => {
  const r = (state: 'STABLE' | 'DRIFT' | 'BREAKPOINT' | null) => ({ step: state ? { state } : null });

  it('counts the opening run of STABLE reps and stops at the first drift', () => {
    const reps = [...Array(7).fill(r('STABLE')), r('DRIFT'), r('STABLE'), r('BREAKPOINT')];
    expect(heldReps(reps)).toBe(7);
    expect(stillHolding(reps)).toBe(false);
  });

  it('ignores unscored reps without breaking the run', () => {
    const reps = [r('STABLE'), r(null), r('STABLE')];
    expect(heldReps(reps)).toBe(2);
    expect(stillHolding(reps)).toBe(true);
  });

  it('is zero for an empty set or an immediate drift', () => {
    expect(heldReps([])).toBe(0);
    expect(heldReps([r('DRIFT'), r('STABLE')])).toBe(0);
  });
});
