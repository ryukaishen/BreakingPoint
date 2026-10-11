// Checkpoints a live set (and an unfinished calibration) so an accidental refresh,
// crash or closed tab does not lose the reps that were measured. See data/draft.ts
// for the integrity rules. Demo and sample sessions never write drafts.

import { useCallback, useEffect, useRef } from 'react';
import { calibrationQuality } from '../data/quality';
import { clearDraft, saveDraft } from '../data/draft';
import type { KeyValueStore } from '../data/kv';
import { newId } from '../data/repository';
import { buildSessionRecord } from '../data/sessionRecord';
import type { DetectorConfig } from '../detection/config';
import type { LaunchContext } from '../protocols/launch';
import type { Snapshot } from './engine';
import { buildSummary } from './summary';

interface Args {
  snap: Snapshot;
  mode: 'demo' | 'live';
  kv: KeyValueStore;
  /** False when browser storage is unavailable (nothing can be saved). */
  persistent: boolean;
  athleteId: string | null;
  launch: LaunchContext;
  config: DetectorConfig;
  /** True while the session screen is showing. Leaving it on purpose clears this run's draft. */
  active: boolean;
  /** True while an earlier interrupted set is waiting for a decision: do not overwrite it. */
  blocked: boolean;
}

export function useSetDraft(a: Args): { flush: () => void } {
  const latest = useRef(a);
  latest.current = a;
  const startedAt = useRef<string | null>(null);
  const setId = useRef<string | null>(null);
  /** The athlete whose draft THIS page load wrote. Drafts from earlier loads are never touched here. */
  const wrote = useRef<string | null>(null);

  const flush = useCallback(() => {
    const x = latest.current;
    const s = x.snap;
    if (x.mode !== 'live' || !x.persistent || !x.athleteId || x.blocked) return;
    const now = new Date().toISOString();
    if (s.phase === 'monitoring' && s.baseline && s.monitorReps.length > 0 && startedAt.current && setId.current) {
      const summary = buildSummary(s.monitorReps, s.exercise, s.athlete, s.alarmRep, s.onsetRep);
      const record = buildSessionRecord({
        id: setId.current,
        snap: { ...s, summary },
        ctx: x.launch,
        athleteId: x.athleteId,
        source: 'live',
        config: x.config,
        startedAt: startedAt.current,
        endedAt: now,
        baselineSavedAt: s.baseline.createdAt,
        calibration: calibrationQuality(s.baseline, x.config),
      });
      if (saveDraft(x.kv, { v: 1, kind: 'set', savedAt: now, record })) wrote.current = x.athleteId;
    } else if (s.phase === 'calibrating' && s.calibrationReps.length > 0) {
      if (saveDraft(x.kv, { v: 1, kind: 'calibration', savedAt: now, athleteId: x.athleteId, protocolId: x.launch.protocol.id, reps: s.calibrationReps.length })) {
        wrote.current = x.athleteId;
      }
    }
  }, []);

  const drop = useCallback(() => {
    if (!wrote.current) return;
    clearDraft(latest.current.kv, wrote.current);
    wrote.current = null;
  }, []);

  // A set begins when monitoring starts.
  const phase = a.snap.phase;
  useEffect(() => {
    if (phase === 'monitoring') {
      startedAt.current = new Date().toISOString();
      setId.current = newId('set');
    }
  }, [phase]);

  // Checkpoint after every rep and at every phase boundary.
  useEffect(() => {
    flush();
  }, [flush, phase, a.snap.monitorReps.length, a.snap.calibrationReps.length, a.snap.alarmRep]);

  // The set or calibration ended normally (the recorder has saved it) or the athlete left on purpose.
  useEffect(() => {
    if ((phase !== 'monitoring' && phase !== 'calibrating') || !a.active) drop();
  }, [phase, a.active, drop]);

  return { flush };
}
