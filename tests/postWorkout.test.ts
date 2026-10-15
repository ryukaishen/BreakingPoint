// The post-workout system (M5) shows only real data: the set that just finished (engine snapshot) or a
// stored record. These tests drive the real engine with the synthetic athlete and check that Recovery,
// Summary, the rep chart and History say exactly what the engine and the records hold.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_DETECTOR_CONFIG, parseDetectorConfig, type DetectorConfig } from '../src/detection/config';
import { runDetector } from '../src/detection/detector';
import { DemoController } from '../src/demo/demoController';
import { compareWithEarlier, comparabilityReasons, filterHistory, historyEntries, historyMovements, relativeDay } from '../src/data/history';
import { MemoryStore } from '../src/data/kv';
import { heldOutcome, heldReps } from '../src/data/progress';
import { calibrationQuality } from '../src/data/quality';
import { AthleteRepository } from '../src/data/repository';
import { createSampleRepository, SAMPLE_ATHLETE_ID } from '../src/data/sample';
import { buildSessionRecord, detectorConfigId, withRecovery } from '../src/data/sessionRecord';
import type { SessionRecord } from '../src/data/types';
import { resolveLaunch } from '../src/protocols/launch';
import { SessionEngine, type Snapshot } from '../src/session/engine';
import { alertRule, chartModel, postSetFromRecord, postSetFromSession, recoveryModel, type PostSet } from '../src/session/postWorkout';

const config = existsSync('public/breakingpoint_detector_config.json')
  ? parseDetectorConfig(JSON.parse(readFileSync('public/breakingpoint_detector_config.json', 'utf8')) as Record<string, unknown>)
  : DEFAULT_DETECTOR_CONFIG;
const launch = resolveLaunch('strength', 'squat-bodyweight')!;

/** A finished squat set (and optionally its recovery check), run through the real engine. */
function finishedSet(withRecovery = false) {
  const engine = new SessionEngine('squat', config, 'Test athlete', 'demo');
  const demo = new DemoController(engine, 'squat');
  demo.runToEnd(withRecovery);
  return { engine, snap: engine.getSnapshot() };
}

function recordFrom(snap: Snapshot, id = 'set_1', startedAt = '2026-10-10T10:00:00.000Z'): SessionRecord {
  const rec = buildSessionRecord({
    id,
    snap,
    ctx: launch,
    athleteId: 'ath_1',
    source: 'demo',
    config,
    startedAt,
    endedAt: startedAt.replace('10:00', '10:05'),
    baselineSavedAt: snap.baseline!.createdAt,
    calibration: calibrationQuality(snap.baseline!, config),
  });
  return snap.recovery ? withRecovery(rec, snap, startedAt.replace('10:00', '10:12')) : rec;
}

describe('summary of the set that just finished', () => {
  const { snap } = finishedSet();
  const rec = recordFrom(snap);
  const set = postSetFromSession(snap, launch, { record: rec, outcome: heldOutcome([rec], rec) })!;

  it('reads every number from the engine: reps, scored reps, held reps, alert, onset and averages', () => {
    expect(snap.phase).toBe('summary');
    expect(set.totalReps).toBe(snap.summary!.totalReps);
    expect(set.scoredReps).toBe(snap.summary!.scoredReps);
    expect(set.heldReps).toBe(heldReps(snap.monitorReps));
    expect(set.alertRep).toBe(snap.alarmRep);
    expect(set.onsetRep).toBe(snap.onsetRep);
    expect(set.avgPre).toBe(snap.summary!.avgPre);
    expect(set.avgPost).toBe(snap.summary!.avgPost);
    expect(set.postReps).toBe(snap.summary!.postReps);
    expect(set.baselineReps).toBe(snap.baseline!.nReps);
  });
  it('charts each rep’s real Form Change Score, and the detector’s real warning and alert levels', () => {
    expect(set.reps.map((r) => r.score)).toEqual(snap.monitorReps.map((r) => r.drift?.score ?? null));
    expect(set.levels).toEqual({ warning: snap.thresholds!.warningLevel, alert: snap.thresholds!.breakpointLevel, rule: alertRule(snap.config) });
  });
  it('says why reps can cross the alert level before the alert, as they do in this set', () => {
    const before = set.reps.filter((r) => r.score !== null && r.index < set.alertRep! && r.score > set.levels!.alert);
    expect(before.length).toBeGreaterThan(0);
    expect(set.levels!.rule).toMatch(/can cross the alert level without triggering it/);
  });
  it('ranks the measured changes as the summary does, and explains the alert in plain words', () => {
    expect(set.changes).toEqual(snap.summary!.topChanges.map((c) => ({ key: c.key, meanZ: c.meanZ })));
    expect(set.explanation).toMatch(/alert at rep \d+/);
    expect(set.explanation).not.toMatch(/σ|EWMA|CUSUM/);
  });
  it('a stored copy of the same set reads the same: the record and the session never disagree', () => {
    const stored = postSetFromRecord(rec, 'Test athlete', config);
    for (const k of ['totalReps', 'scoredReps', 'heldReps', 'onsetRep', 'alertRep', 'postReps', 'avgPre', 'avgPost', 'baselineReps'] as const) expect(stored[k], k).toEqual(set[k]);
    expect(stored.reps.map((r) => r.score)).toEqual(set.reps.map((r) => r.score));
    expect(stored.levels!.warning).toBeCloseTo(set.levels!.warning, 9);
    expect(stored.levels!.alert).toBeCloseTo(set.levels!.alert, 9);
    expect(stored.pattern?.id ?? null).toBe(set.pattern?.id ?? null);
  });
  it('a set scored by another detector version draws no levels, and says why', () => {
    const other = postSetFromRecord({ ...rec, detectorConfigId: 'another-version' }, 'Test athlete', config);
    expect(other.levels).toBeNull();
    expect(other.levelsNote).toMatch(/different detector version/);
    expect(rec.detectorConfigId).toBe(detectorConfigId(config));
  });
  it('there is no summary before a set ends', () => {
    const engine = new SessionEngine('squat', config, 'Test athlete', 'demo');
    expect(postSetFromSession(engine.getSnapshot(), launch, { record: null, outcome: null })).toBeNull();
  });
});

describe('recovery check', () => {
  const { snap } = finishedSet();
  const set = postSetFromSession(snap, launch, { record: null, outcome: null })!;
  const scores = (s: (number | null)[]) => ({ set, phase: 'recovery' as const, liveScores: s, restSeconds: 0 });

  it('after an alert, the athlete rests first: the reading is the real time since the set ended', () => {
    const m = recoveryModel({ set, phase: 'summary', liveScores: [], restSeconds: 75 });
    expect(m.state).toBe('rest');
    expect(m.value).toBe('1:15');
    expect(m.nodes.every((n) => !n.done)).toBe(true);
  });
  it('during the check, the nodes and the count follow the reps the engine has scored', () => {
    expect(recoveryModel(scores([])).state).toBe('active');
    const one = recoveryModel(scores([0.8]));
    expect(one.value).toBe('1');
    expect(one.nodes.map((n) => n.done)).toEqual([true, false, false]);
    const skipped = recoveryModel(scores([null, 0.7]));
    expect(skipped.state).toBe('active');
    expect(skipped.note).toBe('1 rep not scored');
  });
  it('three reps with none scored is insufficient data, never a result', () => {
    const m = recoveryModel(scores([null, null, null]));
    expect(m.state).toBe('insufficient');
    expect(m.title).toBe('Not enough scored reps');
    expect(m.value).not.toMatch(/%/);
  });
  it('the result is the engine’s own assessment: status and percentage, from the scored reps', () => {
    const done = finishedSet(true).snap;
    expect(done.phase).toBe('recoveryDone');
    const s = postSetFromSession(done, launch, { record: null, outcome: null })!;
    const m = recoveryModel({ set: s, phase: done.phase, liveScores: [], restSeconds: 0 });
    expect(m.state).toBe(done.recovery!.status);
    expect(m.value).toBe(`${Math.round(done.recovery!.percent * 100)}%`);
    expect(m.scores.slice(0, done.recoveryReps.length).map((x) => x.score)).toEqual(done.recoveryReps.map((r) => r.drift?.score ?? null));
  });
  it('a set without an alert needs no check, and a stored set without one says it was not run', () => {
    const clear: PostSet = { ...set, alertRep: null, onsetRep: null };
    expect(recoveryModel({ set: clear, phase: 'summary', liveScores: [], restSeconds: 0 }).state).toBe('not-needed');
    const stored = postSetFromRecord(recordFrom(snap), 'Test athlete', config);
    expect(recoveryModel({ set: stored, phase: null, liveScores: [], restSeconds: 0 }).state).toBe('not-run');
  });
});

describe('rep chart', () => {
  it('scales to the scores, keeps the alert line inside, and marks unscored reps as empty slots', () => {
    const m = chartModel({
      reps: [
        { index: 1, score: 0.5, state: 'STABLE' },
        { index: 2, score: null, state: null },
        { index: 3, score: 1.2, state: 'DRIFT' },
        { index: 4, score: 2.4, state: 'BREAKPOINT' },
      ],
      levels: { warning: 1, alert: 1.5, rule: null },
      onsetRep: 3,
      alertRep: 4,
    });
    expect(m.bars.map((b) => b.tone)).toEqual(['usual', 'unscored', 'changing', 'alert']);
    expect(Math.max(...m.bars.map((b) => b.height))).toBe(1);
    expect(m.bars[1].height).toBe(0);
    expect(m.warningAt!).toBeCloseTo(1 / 2.4, 9);
    expect(m.alertAt!).toBeCloseTo(1.5 / 2.4, 9);
  });
  it('without known levels, no lines are drawn', () => {
    const m = chartModel({ reps: [{ index: 1, score: 0.4, state: 'STABLE' }], levels: null, onsetRep: null, alertRep: null });
    expect(m.warningAt).toBeNull();
    expect(m.alertAt).toBeNull();
  });
});

describe('history', () => {
  const base = recordFrom(finishedSet().snap);
  const at = (id: string, day: number, over: Partial<SessionRecord> = {}): SessionRecord => ({
    ...base,
    id,
    startedAt: `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`,
    endedAt: `2026-10-${String(day).padStart(2, '0')}T10:05:00.000Z`,
    ...over,
  });

  it('lists the newest set first, and filters by the movements actually present', () => {
    const recs = [at('a', 2), at('b', 9, { protocolId: 'jump-repeated', sportId: 'soccer', exercise: 'cmj' }), at('c', 5)];
    const e = historyEntries(recs);
    expect(e.map((x) => x.record.id)).toEqual(['b', 'c', 'a']);
    expect(historyMovements(e).map((m) => [m.protocolId, m.count])).toEqual([
      ['jump-repeated', 1],
      ['squat-bodyweight', 2],
    ]);
    expect(filterHistory(e, 'squat-bodyweight').map((x) => x.record.id)).toEqual(['c', 'a']);
    expect(filterHistory(e, null)).toHaveLength(3);
    expect(recs.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('compares only with an earlier set of the same athlete, source, movement and detector version', () => {
    const a = at('a', 2, { heldReps: 5 });
    const b = at('b', 6, { heldReps: 7 });
    const c = compareWithEarlier([a, b], b);
    expect(c.kind).toBe('compared');
    if (c.kind === 'compared') expect([c.previous.id, c.heldDelta]).toEqual(['a', 2]);
    expect(compareWithEarlier([a, b], a).kind).toBe('no-earlier');
  });
  it('another athlete, source or movement is never an earlier set; another detector version is named', () => {
    const b = at('b', 6);
    for (const other of [at('x', 2, { athleteId: 'ath_2' }), at('y', 3, { source: 'live' }), at('z', 4, { protocolId: 'jump-repeated' })]) {
      expect(compareWithEarlier([other, b], b).kind).toBe('no-earlier');
    }
    const oldDetector = at('d', 4, { detectorConfigId: 'older' });
    const c = compareWithEarlier([oldDetector, b], b);
    expect(c.kind).toBe('not-comparable');
    if (c.kind === 'not-comparable') expect(c.reasons).toContain('Scored by different detector versions');
  });
  it('a set that fails the quality floors is never compared, and the reason is given', () => {
    const poor = at('p', 8, { quality: { ...base.quality, eligible: false, reasons: ['Capture quality was low for this set'] } });
    const c = compareWithEarlier([at('a', 2), poor], poor);
    expect(c.kind).toBe('not-comparable');
    expect(comparabilityReasons(poor, at('a', 2))[0]).toMatch(/does not count: capture quality was low/);
  });
  it('relative days read naturally', () => {
    const now = new Date(2026, 9, 15, 12);
    expect(relativeDay(new Date(2026, 9, 15, 8).toISOString(), now)).toBe('Today');
    expect(relativeDay(new Date(2026, 9, 14, 20).toISOString(), now)).toBe('Yesterday');
    expect(relativeDay(new Date(2026, 9, 10, 9).toISOString(), now)).toBe('5 days ago');
  });
});

describe('sample history isolation', () => {
  it('the sample athlete’s history is synthetic, in memory, and never reaches a real repository', () => {
    const sample = createSampleRepository(new Date(2026, 9, 15));
    const recs = sample.sessions(SAMPLE_ATHLETE_ID);
    expect(recs.length).toBeGreaterThan(5);
    expect(recs.every((r) => r.source === 'demo')).toBe(true);
    const real = new AthleteRepository(new MemoryStore(), 'real');
    const athlete = real.createAthlete('Real athlete');
    expect(real.saveSession({ ...recs[0], athleteId: athlete.id })).toBe(false);
    expect(real.sessions(athlete.id)).toEqual([]);
    // Reading history (entries, summaries, comparisons) writes nothing back.
    const before = JSON.stringify(sample.sessions(SAMPLE_ATHLETE_ID));
    for (const e of historyEntries(recs)) {
      postSetFromRecord(e.record, 'Sample athlete', config, heldOutcome(recs, e.record));
      compareWithEarlier(recs, e.record);
    }
    expect(JSON.stringify(sample.sessions(SAMPLE_ATHLETE_ID))).toBe(before);
  });
});

describe('the alert rule under the chart', () => {
  // A calm baseline, then one rep just above the alert level: does this detector alert on that rep alone?
  const alertsOnOneRep = (cfg: DetectorConfig) =>
    runDetector(cfg, 1, 0.2, [1, 1, 1, 1, 1 + (cfg.breakpointThreshold + 0.1) * 0.2]).steps.at(-1)!.alarm;
  it('the shipped detector follows the trend: from a steady state, one rep above the alert level does not trigger it', () => {
    expect(alertsOnOneRep(config)).toBe(false);
    expect(alertRule(config)).toMatch(/trend across recent reps/);
  });
  it('the line claims no run length the shipped detector does not have', () => {
    const rule = alertRule(config)!;
    expect(rule).not.toMatch(/in a row|at least|consecutive|\d/);
    if (config.mode !== 'consecutive' && config.minimumPersistentReps <= 1) expect(rule).not.toMatch(/several reps/);
  });
  it('a detector that alerts on a single rep gets no rule', () => {
    const single: DetectorConfig = { ...config, mode: 'consecutive', minimumPersistentReps: 1 };
    expect(alertsOnOneRep(single)).toBe(true);
    expect(alertRule(single)).toBeNull();
  });
  it('a run-length detector names its run', () => {
    const run: DetectorConfig = { ...config, mode: 'consecutive', minimumPersistentReps: 3 };
    expect(alertsOnOneRep(run)).toBe(false);
    expect(alertRule(run)).toBe('The alert needs 3 reps in a row above the alert level.');
  });
});
