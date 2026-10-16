// Persists every finished monitored set to the athlete's history (and attaches
// the recovery check when one completes). Live sets go to the real repository;
// demo sets go to the sample athlete only — the repository refuses anything else.
//
// A set is saved once, by whichever comes first: the phase effect seeing it end, or saveNow() called
// right after endSet() by an action that is about to replace the engine (a new session, the demo,
// another protocol), which the effect would never see. The set's id is fixed when monitoring starts
// and shared with its recovery draft (currentSet), so the draft and the history record are one set.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AthleteRepository } from '../data/repository';
import { newId } from '../data/repository';
import { calibrationQuality } from '../data/quality';
import { heldOutcome, personalRecords, previousSession, type HeldOutcome } from '../data/progress';
import { buildSessionRecord, detectorConfigId, withRecovery } from '../data/sessionRecord';
import type { SessionRecord } from '../data/types';
import type { DetectorConfig } from '../detection/config';
import type { LaunchContext } from '../protocols/launch';
import type { Snapshot } from './engine';

interface Args {
  snap: Snapshot;
  mode: 'demo' | 'live';
  repo: AthleteRepository;
  athleteId: string | null;
  launch: LaunchContext;
  config: DetectorConfig;
  /** Changes whenever a new engine (new session) starts. */
  sessionKey: number;
  /** The set (or its recovery check) reached the history. */
  onSaved?: (rec: SessionRecord) => void;
  /** The set could not be saved: storage refused it, or the session's athlete no longer exists. */
  onSaveFailed?: (reason: SaveFailure, rec: SessionRecord) => void;
}

export type SaveFailure = 'storage' | 'athlete';

/** Why a set was not saved, in words the athlete can act on. */
export const SAVE_FAILED: Record<SaveFailure, string> = {
  storage: 'This set could not be saved: browser storage is full or unavailable.',
  athlete: 'This set was not saved: its athlete was deleted on this device.',
};

export interface SessionRecorderState {
  /** The set that just finished (or null while one is in progress). */
  record: SessionRecord | null;
  outcome: HeldOutcome | null;
  previous: SessionRecord | null;
  /** Best reps held at baseline before the current set, under comparable conditions. */
  bestBefore: number | null;
  /**
   * Saves the set that `snap` (taken right after endSet()) ended, now. Returns whether it reached the
   * history; null when there was nothing to save or this set was already handled.
   */
  saveNow: (snap: Snapshot) => boolean | null;
  /** The id and start time of the set being recorded (from monitoring until the next set), or null. */
  currentSet: () => { id: string; startedAt: string } | null;
  /** The athlete discarded this unsaved set: its recovery check must not store it after all. */
  discarded: (setId: string) => void;
}

export function useSessionRecorder(a: Args): SessionRecorderState {
  const [record, setRecord] = useState<SessionRecord | null>(null);
  const setId = useRef<string | null>(null);
  const startedAt = useRef<string | null>(null);
  /** The set already saved (or refused) in this session: it is never saved twice. */
  const handled = useRef<string | null>(null);
  /** An unsaved set the athlete chose to discard. */
  const dropped = useRef<string | null>(null);
  const prevPhase = useRef(a.snap.phase);
  const latest = useRef(a);
  latest.current = a;

  useEffect(() => {
    setRecord(null);
    setId.current = null;
  }, [a.sessionKey]);

  const saveSet = useCallback((snap: Snapshot): boolean | null => {
    const x = latest.current;
    if (snap.phase !== 'summary' || !x.athleteId || !snap.baseline || !snap.monitorReps.length) return null;
    setId.current ??= newId('set');
    if (handled.current === setId.current) return null;
    handled.current = setId.current;
    const rec = buildSessionRecord({
      id: setId.current,
      snap,
      ctx: x.launch,
      athleteId: x.athleteId,
      source: x.mode,
      config: x.config,
      startedAt: startedAt.current ?? new Date().toISOString(),
      endedAt: new Date().toISOString(),
      baselineSavedAt: snap.baseline.createdAt,
      calibration: calibrationQuality(snap.baseline, x.config),
    });
    setRecord(rec);
    // Each repository takes one source (real: live, sample: demo); the other is refused by design.
    if (x.repo.acceptedSource !== x.mode) return null;
    if (!x.repo.athlete(x.athleteId)) {
      x.onSaveFailed?.('athlete', rec);
      return false;
    }
    if (!x.repo.saveSession(rec)) {
      x.onSaveFailed?.('storage', rec);
      return false;
    }
    x.onSaved?.(rec);
    return true;
  }, []);

  const currentSet = useCallback(() => (setId.current && startedAt.current ? { id: setId.current, startedAt: startedAt.current } : null), []);
  const discarded = useCallback((id: string) => {
    dropped.current = id;
  }, []);

  useEffect(() => {
    const prev = prevPhase.current;
    const phase = a.snap.phase;
    prevPhase.current = phase;
    if (phase === prev) return;
    if (phase === 'monitoring') {
      setId.current = newId('set');
      startedAt.current = new Date().toISOString();
      setRecord(null);
      return;
    }
    // A set ends in 'summary'. (Skipping a demo stage can jump there without React ever seeing 'monitoring'.)
    if (phase === 'summary' && prev !== 'recovery' && prev !== 'recoveryDone') {
      saveSet(a.snap);
      return;
    }
    if (phase === 'recoveryDone' && record && record.id !== dropped.current) {
      const rec = withRecovery(record, a.snap, new Date().toISOString());
      if (a.repo.saveSession(rec)) a.onSaved?.(rec);
      setRecord(rec);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.snap.phase]);

  const protocolId = a.launch.protocol.id;
  const configId = detectorConfigId(a.config);
  return useMemo(() => {
    const history = a.athleteId ? a.repo.sessions(a.athleteId, protocolId) : [];
    const before = history.filter((s) => s.id !== record?.id && s.id !== setId.current);
    return {
      record,
      outcome: record ? heldOutcome(history, record) : null,
      previous: record ? previousSession(history, record) : null,
      bestBefore: personalRecords(before, protocolId, configId).mostHeld?.value ?? null,
      saveNow: saveSet,
      currentSet,
      discarded,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, a.repo, a.athleteId, protocolId, configId, a.snap.phase]);
}
