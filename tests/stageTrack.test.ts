// The session stage track is a read-only projection of the engine snapshot.
import { describe, expect, it } from 'vitest';
import { currentStage, stageTrack } from '../src/components/system/stageTrack';
import type { Snapshot } from '../src/session/engine';

const reps = (n: number) => Array.from({ length: n }, (_, i) => ({ index: i + 1 })) as unknown as Snapshot['monitorReps'];
const baseline = {} as NonNullable<Snapshot['baseline']>;

/** Only the fields the track reads; everything else is irrelevant to it. */
function snap(over: Partial<Snapshot>): Snapshot {
  return {
    phase: 'idle',
    baseline: null,
    calibrationReps: reps(0),
    calibrationTarget: 6,
    monitorReps: reps(0),
    recoveryReps: reps(0),
    alarmRep: null,
    state: 'STABLE',
    ...over,
  } as unknown as Snapshot;
}

const view = (s: Snapshot) => stageTrack(s).map((st) => `${st.id}:${st.status}${st.count ? `(${st.count})` : ''}`);

describe('session stage track', () => {
  it('starts on Calibrate before any baseline exists', () => {
    const s = snap({ phase: 'idle' });
    expect(view(s)).toEqual(['calibrate:current', 'monitor:pending', 'detect:pending', 'recover:pending']);
    expect(currentStage(stageTrack(s))).toBe('calibrate');
  });

  it('counts calibration reps against the real target', () => {
    expect(view(snap({ phase: 'calibrating', calibrationReps: reps(4), calibrationTarget: 7 }))[0]).toBe('calibrate:current(4/7)');
  });

  it('moves to Monitor once the baseline is locked', () => {
    expect(view(snap({ phase: 'baseline', baseline }))).toEqual(['calibrate:done', 'monitor:current', 'detect:pending', 'recover:pending']);
  });

  it('counts monitored reps while the form is stable', () => {
    expect(view(snap({ phase: 'monitoring', baseline, monitorReps: reps(7) }))).toEqual(['calibrate:done', 'monitor:current(7)', 'detect:pending', 'recover:pending']);
  });

  it('flags Detect while the form is changing, but the set is still the current step', () => {
    const s = snap({ phase: 'monitoring', baseline, monitorReps: reps(8), state: 'DRIFT' });
    expect(view(s)).toEqual(['calibrate:done', 'monitor:current(8)', 'detect:warning', 'recover:pending']);
    expect(currentStage(stageTrack(s))).toBe('monitor');
  });

  it('shows the alert rep on Detect once the alert fires, and keeps it through the rest', () => {
    const alert = snap({ phase: 'monitoring', baseline, monitorReps: reps(10), alarmRep: 10, state: 'BREAKPOINT' });
    expect(view(alert)).toEqual(['calibrate:done', 'monitor:done', 'detect:alert(rep 10)', 'recover:pending']);
    expect(currentStage(stageTrack(alert))).toBe('detect');
    expect(view(snap({ phase: 'summary', baseline, monitorReps: reps(10), alarmRep: 10 }))[2]).toBe('detect:alert(rep 10)');
  });

  it('a set that ends without an alert never marks Detect', () => {
    const s = snap({ phase: 'summary', baseline, monitorReps: reps(9) });
    expect(view(s)).toEqual(['calibrate:done', 'monitor:done', 'detect:pending', 'recover:pending']);
    expect(currentStage(stageTrack(s))).toBeNull();
  });

  it('counts recovery reps, then completes', () => {
    expect(view(snap({ phase: 'recovery', baseline, monitorReps: reps(10), alarmRep: 10, recoveryReps: reps(2) }))).toEqual([
      'calibrate:done',
      'monitor:done',
      'detect:done',
      'recover:current(2/3)',
    ]);
    expect(view(snap({ phase: 'recoveryDone', baseline, monitorReps: reps(10), alarmRep: 10, recoveryReps: reps(3) }))[3]).toBe('recover:done');
  });

  it('reads the snapshot without changing it', () => {
    const s = Object.freeze(snap({ phase: 'monitoring', baseline, monitorReps: reps(3) }));
    expect(() => stageTrack(s)).not.toThrow();
    expect(s.phase).toBe('monitoring');
  });
});
