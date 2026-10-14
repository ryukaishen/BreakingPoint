// Screen-reader announcements: quiet per rep, polite for progress, assertive only for the stop instruction.
import { describe, expect, it } from 'vitest';
import { DEFAULT_DETECTOR_CONFIG } from '../src/detection/config';
import { SessionEngine, type SessionPhase, type Snapshot } from '../src/session/engine';
import { announce } from '../src/session/announce';

const base = (): Snapshot => new SessionEngine('squat', DEFAULT_DETECTOR_CONFIG, 'Avery', 'live').getSnapshot();
const rep = (index: number, state: 'STABLE' | 'DRIFT' | 'BREAKPOINT') =>
  ({ index, context: 'monitoring', quality: 0.9, drift: { score: 0.5 }, step: { state } }) as unknown as Snapshot['monitorReps'][number];
const snapAt = (phase: SessionPhase, over: Partial<Snapshot> = {}): Snapshot => ({ ...base(), phase, ...over });

describe('announcements', () => {
  it('say nothing without a previous snapshot or when nothing changed', () => {
    const s = snapAt('monitoring');
    expect(announce(null, s)).toEqual({ polite: null, assertive: null });
    expect(announce(s, s)).toEqual({ polite: null, assertive: null });
  });

  it('stay silent for every rep while movement is stable', () => {
    let prev = snapAt('monitoring', { monitorReps: [] });
    for (let i = 1; i <= 12; i++) {
      const next = { ...prev, monitorReps: [...prev.monitorReps, rep(i, 'STABLE')], version: prev.version + 1 };
      expect(announce(prev, next)).toEqual({ polite: null, assertive: null });
      prev = next;
    }
  });

  it('say the first drift once, politely', () => {
    const prev = snapAt('monitoring', { state: 'STABLE', monitorReps: [rep(1, 'STABLE')] });
    const drift = snapAt('monitoring', { state: 'DRIFT', monitorReps: [rep(1, 'STABLE'), rep(2, 'DRIFT')] });
    const a = announce(prev, drift);
    expect(a.polite).toMatch(/form is starting to change/i);
    expect(a.assertive).toBeNull();
    const again = snapAt('monitoring', { state: 'DRIFT', monitorReps: [...drift.monitorReps, rep(3, 'DRIFT')] });
    expect(announce(drift, again)).toEqual({ polite: null, assertive: null });
  });

  it('make the breaking point the single assertive message, with the rep and what to do', () => {
    const prev = snapAt('monitoring', { state: 'DRIFT', alarmRep: null });
    const next = snapAt('monitoring', { state: 'BREAKPOINT', alarmRep: 11 });
    const a = announce(prev, next);
    expect(a.assertive).toBe('Stop. The alert triggered at rep 11. End the set and rest.');
    expect(a.polite).toBeNull();
    // and not again on the next rep
    const later = { ...next, monitorReps: [rep(12, 'BREAKPOINT')] };
    expect(announce(next, later)).toEqual({ polite: null, assertive: null });
  });

  it('never goes assertive for anything but the breaking point', () => {
    const phases: SessionPhase[] = ['idle', 'calibrating', 'baseline', 'monitoring', 'summary', 'recovery', 'recoveryDone'];
    for (const from of phases) {
      for (const to of phases) {
        const a = announce(snapAt(from), snapAt(to));
        expect(a.assertive, `${from} -> ${to}`).toBeNull();
      }
    }
  });

  it('describes phase changes in plain words', () => {
    expect(announce(snapAt('idle'), snapAt('calibrating')).polite).toMatch(/Calibration started/);
    expect(announce(snapAt('calibrating'), snapAt('baseline')).polite).toBe('Baseline locked.');
    expect(announce(snapAt('baseline'), snapAt('monitoring')).polite).toBe('Set started.');
    expect(announce(snapAt('summary'), snapAt('recovery')).polite).toMatch(/Recovery check started/);
  });

  it('summarises a finished set, with or without a breaking point', () => {
    const clean = snapAt('summary', { monitorReps: [rep(1, 'STABLE'), rep(2, 'STABLE'), rep(3, 'DRIFT')] });
    expect(announce(snapAt('monitoring'), clean).polite).toBe('Set ended. 3 reps, 2 at your usual form.');
    const broke = snapAt('summary', { alarmRep: 9 });
    expect(announce(snapAt('monitoring', { alarmRep: 9 }), broke).polite).toMatch(/alert triggered at rep 9\. Rest, then run the recovery check/);
  });

  it('says both the stop and the summary when one update carries the alert and the end of the set', () => {
    // Between two renders the engine can fire the alert and end the set; the summary must still be heard.
    const prev = snapAt('monitoring', { state: 'DRIFT', alarmRep: null });
    const next = snapAt('summary', { state: 'BREAKPOINT', alarmRep: 10 });
    const a = announce(prev, next);
    expect(a.assertive).toBe('Stop. The alert triggered at rep 10. End the set and rest.');
    expect(a.polite).toBe('Set ended. The alert triggered at rep 10. Rest, then run the recovery check.');
    // A first form change folded into the same update is not added on top of the stop.
    const quiet = announce(snapAt('monitoring', { state: 'STABLE', alarmRep: null }), snapAt('monitoring', { state: 'BREAKPOINT', alarmRep: 4 }));
    expect(quiet.polite).toBeNull();
  });

  it('reports the recovery result as a whole percent', () => {
    const done = snapAt('recoveryDone', { recovery: { percent: 0.8349 } as Snapshot['recovery'] });
    expect(announce(snapAt('recovery'), done).polite).toBe('Recovery check complete. 83 percent of the change has gone.');
  });
});
