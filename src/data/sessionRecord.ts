// Turns a finished SessionEngine snapshot into a stored SessionRecord. Only data
// the engine actually produced is recorded; nothing is estimated or filled in.

import type { DetectorConfig } from '../detection/config';
import type { LaunchContext } from '../protocols/launch';
import { sessionPattern } from '../protocols/patterns';
import type { Snapshot } from '../session/engine';
import { heldReps } from './progress';
import { sessionQuality } from './quality';
import { SCHEMA_VERSION, type CalibrationQuality, type SessionRecord, type SessionRep, type SessionSource } from './types';

export interface SessionRecordInput {
  id: string;
  snap: Snapshot;
  ctx: LaunchContext;
  athleteId: string;
  source: SessionSource;
  config: DetectorConfig;
  startedAt: string;
  endedAt: string;
  baselineSavedAt: string;
  calibration: CalibrationQuality;
}

export function detectorConfigId(config: DetectorConfig): string {
  return config.configId ?? config.source;
}

export function buildSessionRecord(i: SessionRecordInput): SessionRecord {
  const s = i.snap;
  const alarm = s.alarmRep;
  const reps: SessionRep[] = s.monitorReps.map((r) => ({
    index: r.index,
    score: r.drift?.score ?? null,
    state: r.step?.state ?? null,
    ewma: r.step?.ewmaLevel ?? null,
    quality: r.quality,
    afterWarning: alarm !== null && r.index > alarm,
  }));
  const pattern = alarm !== null ? sessionPattern(s.exercise, s.monitorReps, s.onsetRep, s.baseline?.reference.sigma0, i.ctx.patternLabels) : null;
  const sm = s.summary;
  return {
    schemaVersion: SCHEMA_VERSION,
    id: i.id,
    athleteId: i.athleteId,
    source: i.source,
    sportId: i.ctx.sport.id,
    subSportId: i.ctx.subSport?.id,
    protocolId: i.ctx.protocol.id,
    exercise: s.exercise,
    detectorConfigId: detectorConfigId(i.config),
    startedAt: i.startedAt,
    endedAt: i.endedAt,
    baselineSavedAt: i.baselineSavedAt,
    calibration: i.calibration,
    reps,
    totalReps: reps.length,
    scoredReps: reps.filter((r) => r.score !== null).length,
    heldReps: heldReps(s.monitorReps),
    onsetRep: alarm !== null ? s.onsetRep : null,
    breakpointRep: alarm,
    avgPre: sm?.avgPre ?? null,
    avgPost: sm?.avgPost ?? null,
    topChanges: (sm?.topChanges ?? []).map((c) => ({ key: c.key, meanZ: c.meanZ })),
    patternId: pattern?.id ?? null,
    recovery: null,
    quality: sessionQuality(reps, i.calibration),
  };
}

/** Attach a completed recovery check to a stored set. */
export function withRecovery(rec: SessionRecord, snap: Snapshot, completedAt: string): SessionRecord {
  const r = snap.recovery;
  if (!r) return rec;
  return {
    ...rec,
    recovery: {
      percent: r.percent,
      status: r.status,
      meanRecovery: r.meanRecovery,
      meanPost: r.meanPost,
      scores: snap.recoveryReps.map((x) => x.drift?.score ?? null),
      completedAt,
    },
  };
}
