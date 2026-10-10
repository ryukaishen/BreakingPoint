// Persists every finished monitored set to the athlete's history (and attaches
// the recovery check when one completes). Live sets go to the real repository;
// demo sets go to the sample athlete only — the repository refuses anything else.

import { useEffect, useMemo, useRef, useState } from 'react';
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
  onSaved?: () => void;
  onStorageError?: (message: string) => void;
}

export interface SessionRecorderState {
  /** The set that just finished (or null while one is in progress). */
  record: SessionRecord | null;
  outcome: HeldOutcome | null;
  previous: SessionRecord | null;
  /** Best reps held at baseline before the current set, under comparable conditions. */
  bestBefore: number | null;
}

export function useSessionRecorder(a: Args): SessionRecorderState {
  const [record, setRecord] = useState<SessionRecord | null>(null);
  const setId = useRef<string | null>(null);
  const startedAt = useRef<string | null>(null);
  const prevPhase = useRef(a.snap.phase);

  useEffect(() => {
    setRecord(null);
    setId.current = null;
  }, [a.sessionKey]);

  useEffect(() => {
    const prev = prevPhase.current;
    const phase = a.snap.phase;
    prevPhase.current = phase;
    if (phase === prev) return;
    const source = a.mode;
    if (phase === 'monitoring') {
      setId.current = newId('set');
      startedAt.current = new Date().toISOString();
      setRecord(null);
      return;
    }
    // A set ends in 'summary'. (Skipping a demo stage can jump there without React ever seeing 'monitoring'.)
    if (phase === 'summary' && prev !== 'recovery' && prev !== 'recoveryDone' && a.athleteId && a.snap.baseline && a.snap.monitorReps.length) {
      setId.current ??= newId('set');
      const rec = buildSessionRecord({
        id: setId.current,
        snap: a.snap,
        ctx: a.launch,
        athleteId: a.athleteId,
        source,
        config: a.config,
        startedAt: startedAt.current ?? new Date().toISOString(),
        endedAt: new Date().toISOString(),
        baselineSavedAt: a.snap.baseline.createdAt,
        calibration: calibrationQuality(a.snap.baseline, a.config),
      });
      if (a.repo.saveSession(rec)) a.onSaved?.();
      else if (a.repo.acceptedSource === source) a.onStorageError?.('This set could not be saved: browser storage is full or unavailable.');
      setRecord(rec);
      return;
    }
    if (phase === 'recoveryDone' && record) {
      const rec = withRecovery(record, a.snap, new Date().toISOString());
      if (a.repo.saveSession(rec)) a.onSaved?.();
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, a.repo, a.athleteId, protocolId, configId, a.snap.phase]);
}
