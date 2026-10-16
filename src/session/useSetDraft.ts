// Checkpoints a live set (and an unfinished calibration) so an accidental refresh,
// crash or closed tab does not lose the reps that were measured. See data/draft.ts
// for the integrity rules. Demo and sample sessions never write drafts.
//
// A set's draft carries the set's own id (the recorder's), so it is cleared only when
// that set reaches the history or is discarded on purpose. A draft that stands for
// another set (one that could not be saved) is never overwritten or cleared here.

import { useCallback, useEffect, useRef } from 'react';
import { calibrationQuality } from '../data/quality';
import { clearDraft, clearSetDraft, loadDraft, saveDraft } from '../data/draft';
import type { KeyValueStore } from '../data/kv';
import { buildSessionRecord } from '../data/sessionRecord';
import type { SessionRecord } from '../data/types';
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
  /** True while the session screen is showing. Leaving it on purpose clears this run's calibration draft. */
  active: boolean;
  /** True while an earlier interrupted set is waiting for a decision: do not overwrite it. */
  blocked: boolean;
  /** The set being recorded (from the recorder): its draft carries the same id as its history record. */
  currentSet: () => { id: string; startedAt: string } | null;
}

export interface SetDraftControls {
  flush: () => void;
  /** A set reached the history: its draft is no longer needed. */
  saved: (rec: SessionRecord) => void;
  /**
   * A finished set could not be saved: keep it as an ended draft until it is saved or discarded.
   * Returns whether a draft now holds every rep of this set.
   */
  unsaved: (rec: SessionRecord) => boolean;
  /** The id of the set this page is checkpointing right now, or null. */
  activeSetId: () => string | null;
}

/** True when the athlete's draft stands for a different set: it is waiting to be saved or discarded. */
function otherSetWaiting(kv: KeyValueStore, athleteId: string, setId: string | null): boolean {
  const d = loadDraft(kv, athleteId);
  return d?.kind === 'set' && d.record.id !== setId;
}

export function useSetDraft(a: Args): SetDraftControls {
  const latest = useRef(a);
  latest.current = a;
  /** The set this page is checkpointing; cleared once it is saved, kept as unsaved, or discarded. */
  const active = useRef<{ athleteId: string; id: string } | null>(null);
  /** The athlete whose calibration draft THIS page load wrote. Drafts from earlier loads are never touched here. */
  const wroteCalibration = useRef<string | null>(null);

  const flush = useCallback(() => {
    const x = latest.current;
    const s = x.snap;
    if (x.mode !== 'live' || !x.persistent || !x.athleteId || x.blocked) return;
    const now = new Date().toISOString();
    const set = x.currentSet();
    if (s.phase === 'monitoring' && s.baseline && s.monitorReps.length > 0 && set) {
      if (otherSetWaiting(x.kv, x.athleteId, set.id)) return;
      const summary = buildSummary(s.monitorReps, s.exercise, s.athlete, s.alarmRep, s.onsetRep);
      const record = buildSessionRecord({
        id: set.id,
        snap: { ...s, summary },
        ctx: x.launch,
        athleteId: x.athleteId,
        source: 'live',
        config: x.config,
        startedAt: set.startedAt,
        endedAt: now,
        baselineSavedAt: s.baseline.createdAt,
        calibration: calibrationQuality(s.baseline, x.config),
      });
      if (saveDraft(x.kv, { v: 1, kind: 'set', savedAt: now, record })) active.current = { athleteId: x.athleteId, id: set.id };
    } else if (s.phase === 'calibrating' && s.calibrationReps.length > 0) {
      if (otherSetWaiting(x.kv, x.athleteId, null)) return;
      if (saveDraft(x.kv, { v: 1, kind: 'calibration', savedAt: now, athleteId: x.athleteId, protocolId: x.launch.protocol.id, reps: s.calibrationReps.length })) {
        wroteCalibration.current = x.athleteId;
      }
    }
  }, []);

  const saved = useCallback((rec: SessionRecord) => {
    if (active.current?.id === rec.id) active.current = null;
    clearSetDraft(latest.current.kv, rec.athleteId, rec.id);
  }, []);

  const unsaved = useCallback((rec: SessionRecord): boolean => {
    const x = latest.current;
    if (active.current?.id === rec.id) active.current = null;
    if (x.mode !== 'live' || !x.persistent) return false;
    const existing = loadDraft(x.kv, rec.athleteId);
    if (existing?.kind === 'set' && existing.record.id !== rec.id) return false; // another set is waiting: never overwritten
    if (saveDraft(x.kv, { v: 1, kind: 'set', savedAt: new Date().toISOString(), record: rec, ended: true })) return true;
    // Storage refused the final copy too: the last checkpoint still holds the set if it has every rep.
    return existing?.kind === 'set' && existing.record.totalReps === rec.totalReps;
  }, []);

  const activeSetId = useCallback(() => active.current?.id ?? null, []);

  // Checkpoint after every rep and at every phase boundary.
  const phase = a.snap.phase;
  useEffect(() => {
    flush();
  }, [flush, phase, a.snap.monitorReps.length, a.snap.calibrationReps.length, a.snap.alarmRep]);

  // A calibration draft goes when calibration ends or the athlete leaves it on purpose. A set's draft
  // goes only when the set is saved (saved()) or discarded on purpose: monitoring ending in anything but
  // the summary (a confirmed baseline reset). A set that ended but could not be saved keeps its draft.
  const prevPhase = useRef(phase);
  useEffect(() => {
    const prev = prevPhase.current;
    prevPhase.current = phase;
    const kv = latest.current.kv;
    const cal = wroteCalibration.current;
    if (cal && (phase !== 'calibrating' || !a.active)) {
      if (loadDraft(kv, cal)?.kind === 'calibration') clearDraft(kv, cal);
      wroteCalibration.current = null;
    }
    if (active.current && prev === 'monitoring' && phase !== 'monitoring' && phase !== 'summary') {
      clearSetDraft(kv, active.current.athleteId, active.current.id);
      active.current = null;
    }
  }, [phase, a.active]);

  return { flush, saved, unsaved, activeSetId };
}
