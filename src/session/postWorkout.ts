// What Figma Make's post-workout system (Recovery, Summary, History) shows, projected
// from real data only: the session that just finished (engine snapshot and its saved
// record) or a stored SessionRecord. Nothing here is estimated, filled in or invented;
// a value the data does not hold is shown as missing.

import type { ExerciseType } from '../biomechanics/catalog';
import type { DetectorConfig } from '../detection/config';
import type { MovementState } from '../detection/detector';
import type { RecoveryStatus } from '../detection/recovery';
import type { HeldOutcome } from '../data/progress';
import { heldReps } from '../data/progress';
import { detectorConfigId } from '../data/sessionRecord';
import type { SessionRecord, SessionSource } from '../data/types';
import type { LaunchContext } from '../protocols/launch';
import { resolveLaunch } from '../protocols/launch';
import { PATTERN_EXPLAIN, PATTERN_LABELS, sessionPattern, type PatternId } from '../protocols/patterns';
import { RECOVERY_REPS, type SessionPhase, type Snapshot } from './engine';
import { describeChanges, describeTiming, explainAlert, explainAlertText } from './explain';

export type PostSection = 'recovery' | 'summary' | 'history';

export interface PostRep {
  index: number;
  /** Form Change Score, null when the rep could not be scored. */
  score: number | null;
  state: MovementState | null;
}

/** The detector's warning and alert levels for this set's baseline, when they are known. */
export interface PostLevels {
  warning: number;
  alert: number;
  /** How the alert relates to the alert level, in plain words; null when one rep above it is enough. */
  rule: string | null;
}

/**
 * Bars are single reps, but most detector modes alert on the change across reps, so a bar can cross the
 * alert level before the alert (the old chart showed this with its trend line). Says so for this detector.
 */
export function alertRule(cfg: Pick<DetectorConfig, 'mode' | 'ewmaAlpha' | 'minimumPersistentReps'>): string | null {
  const run = Math.max(1, cfg.minimumPersistentReps);
  if (cfg.mode === 'consecutive') return run > 1 ? `The alert needs ${run} reps in a row above the alert level.` : null;
  if (cfg.mode === 'cusum') return 'The alert follows the change building up over several reps, so a rep can cross the alert level without triggering it.';
  if (cfg.ewmaAlpha >= 1 && run <= 1) return null;
  return 'The alert follows the trend across recent reps, so a rep can cross the alert level without triggering it.';
}

export interface PostRecovery {
  percent: number;
  status: RecoveryStatus;
  /** Score of each recovery rep, null for a rep that could not be scored. */
  scores: (number | null)[];
}

/** One finished set, from the engine (just now) or from storage. */
export interface PostSet {
  origin: 'session' | 'record';
  recordId: string | null;
  source: SessionSource;
  athlete: string;
  exercise: ExerciseType;
  launch: LaunchContext | null;
  contextName: string;
  title: string;
  endedAt: string | null;
  baselineReps: number | null;
  totalReps: number;
  scoredReps: number;
  heldReps: number;
  onsetRep: number | null;
  alertRep: number | null;
  /** Reps from the alert on. */
  postReps: number;
  avgPre: number | null;
  avgPost: number | null;
  reps: PostRep[];
  levels: PostLevels | null;
  /** Why the levels are not drawn, when they are not. */
  levelsNote: string | null;
  /** Largest measured changes, signed in units of the athlete's normal rep-to-rep variation. */
  changes: { key: string; meanZ: number }[];
  pattern: { id: PatternId; label: string; explain: string } | null;
  /** What changed and when, in plain words (alert sets only). */
  explanation: string | null;
  recommendation: string;
  recovery: PostRecovery | null;
  /** Whether the set counts toward records and comparisons, and why not. */
  eligible: boolean | null;
  ineligibleReasons: string[];
  outcome: HeldOutcome | null;
}

const RECOMMEND_ALERT =
  'Your reps kept differing from your usual form, so BreakingPoint triggered an alert. Consider resting or lowering the intensity, then run a recovery check.';
const RECOMMEND_CLEAR = 'Your form stayed close to your usual form for this set.';

function patternFor(id: string | null, launch: LaunchContext | null): PostSet['pattern'] {
  if (!id || !(id in PATTERN_LABELS)) return null;
  const pid = id as PatternId;
  return { id: pid, label: launch?.patternLabels?.[pid] ?? PATTERN_LABELS[pid], explain: PATTERN_EXPLAIN[pid] };
}

/** The set that just finished in this session, or null while no set has ended. */
export function postSetFromSession(
  snap: Snapshot,
  launch: LaunchContext,
  saved: { record: SessionRecord | null; outcome: HeldOutcome | null },
): PostSet | null {
  const sm = snap.summary;
  if (!sm) return null;
  const alert = sm.breakpointRep;
  const pattern = alert !== null ? sessionPattern(snap.exercise, snap.monitorReps, snap.onsetRep, snap.baseline?.reference.sigma0, launch.patternLabels) : null;
  const rec = snap.recovery;
  return {
    origin: 'session',
    recordId: saved.record?.id ?? null,
    source: snap.mode,
    athlete: sm.athlete,
    exercise: snap.exercise,
    launch,
    contextName: launch.contextName,
    title: launch.title,
    endedAt: saved.record?.endedAt ?? sm.generatedAt,
    baselineReps: snap.baseline?.nReps ?? null,
    totalReps: sm.totalReps,
    scoredReps: sm.scoredReps,
    heldReps: heldReps(snap.monitorReps),
    onsetRep: alert !== null ? sm.onsetRep : null,
    alertRep: alert,
    postReps: sm.postReps,
    avgPre: sm.avgPre,
    avgPost: sm.avgPost,
    reps: snap.monitorReps.map((r) => ({ index: r.index, score: r.drift?.score ?? null, state: r.step?.state ?? null })),
    levels: snap.thresholds ? { warning: snap.thresholds.warningLevel, alert: snap.thresholds.breakpointLevel, rule: alertRule(snap.config) } : null,
    levelsNote: snap.thresholds ? null : 'No baseline for this set, so no levels are drawn.',
    changes: sm.topChanges.map((c) => ({ key: c.key, meanZ: c.meanZ })),
    pattern: pattern ? { id: pattern.id, label: pattern.label, explain: pattern.explain } : null,
    explanation: alert !== null ? explainAlertText(explainAlert(snap.exercise, snap.monitorReps, snap.onsetRep, alert)) : null,
    recommendation: sm.recommendation,
    recovery: rec ? { percent: rec.percent, status: rec.status, scores: snap.recoveryReps.map((r) => r.drift?.score ?? null) } : null,
    eligible: saved.record ? saved.record.quality.eligible : null,
    ineligibleReasons: saved.record?.quality.reasons ?? [],
    outcome: saved.outcome,
  };
}

/** A stored set. Levels are drawn only when it was scored by the detector version in use now. */
export function postSetFromRecord(rec: SessionRecord, athleteName: string, config: DetectorConfig, outcome: HeldOutcome | null = null): PostSet {
  const launch = resolveLaunch(rec.sportId, rec.protocolId, rec.subSportId);
  const sameDetector = rec.detectorConfigId === detectorConfigId(config);
  const { mu0, sigma0 } = rec.calibration;
  const alert = rec.breakpointRep;
  const what = alert !== null ? describeChanges(rec.exercise, rec.topChanges.map((c) => ({ key: c.key, z: c.meanZ }))) : null;
  return {
    origin: 'record',
    recordId: rec.id,
    source: rec.source,
    athlete: athleteName,
    exercise: rec.exercise,
    launch,
    contextName: launch?.contextName ?? rec.sportId,
    title: launch?.title ?? rec.protocolId,
    endedAt: rec.endedAt,
    baselineReps: rec.calibration.nReps,
    totalReps: rec.totalReps,
    scoredReps: rec.scoredReps,
    heldReps: rec.heldReps,
    onsetRep: rec.onsetRep,
    alertRep: alert,
    postReps: alert === null ? 0 : rec.reps.filter((r) => r.index >= alert).length,
    avgPre: rec.avgPre,
    avgPost: rec.avgPost,
    reps: rec.reps.map((r) => ({ index: r.index, score: r.score, state: r.state })),
    levels:
      sameDetector && Number.isFinite(mu0) && Number.isFinite(sigma0)
        ? { warning: mu0 + config.warningThreshold * sigma0, alert: mu0 + config.breakpointThreshold * sigma0, rule: alertRule(config) }
        : null,
    levelsNote: sameDetector ? null : 'Saved with a different detector version, so its warning and alert levels are not drawn.',
    changes: rec.topChanges.map((c) => ({ key: c.key, meanZ: c.meanZ })),
    pattern: patternFor(rec.patternId, launch),
    explanation: alert !== null ? [what, describeTiming(rec.onsetRep, alert)].filter(Boolean).join(' ') : null,
    recommendation: alert !== null ? RECOMMEND_ALERT : RECOMMEND_CLEAR,
    recovery: rec.recovery ? { percent: rec.recovery.percent, status: rec.recovery.status, scores: rec.recovery.scores } : null,
    eligible: rec.quality.eligible,
    ineligibleReasons: rec.quality.reasons,
    outcome,
  };
}

// ---------------------------------------------------------------- recovery
export type RecoveryState = 'not-needed' | 'rest' | 'active' | 'insufficient' | 'not-run' | RecoveryStatus;

export interface RecoveryModel {
  state: RecoveryState;
  title: string;
  instruction: string;
  /** The large reading in the diamond: reps done, rest time or the share of the change gone. */
  value: string;
  valueLabel: string;
  note: string | null;
  /** Rep nodes: done reps light up. */
  nodes: { index: number; done: boolean }[];
  /** Recovery scores so far (shown while the check runs and after it). */
  scores: { index: number; score: number | null; done: boolean }[];
}

const RESULT_COPY: Record<RecoveryStatus, { title: string; instruction: string }> = {
  recovered: { title: 'Back to your usual form', instruction: 'Your form is back within your normal range.' },
  partial: { title: 'Partly back', instruction: 'Consider more rest or a lighter session before you test again.' },
  persistent: {
    title: 'Still different',
    instruction: 'Your form is still different from your usual form. Consider keeping the rest of today light.',
  },
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export interface RecoveryInput {
  set: PostSet;
  /** The live engine phase, for a set from this session; null for a stored set. */
  phase: SessionPhase | null;
  /** Recovery reps so far in this session (score or null when not scored). */
  liveScores: (number | null)[];
  /** Seconds since the set ended (the rest so far), for this session's set. */
  restSeconds: number;
}

/**
 * The recovery check's state. Its criteria are the engine's (detection/recovery.ts): after 3 reps the
 * check is assessed from the scored ones. If none of them could be scored, the engine keeps waiting for
 * a scored rep; the screen says so instead of showing a result.
 */
export function recoveryModel(i: RecoveryInput): RecoveryModel {
  const { set } = i;
  const nodes = (done: number) => Array.from({ length: RECOVERY_REPS }, (_, k) => ({ index: k + 1, done: k < done }));
  const scoresOf = (s: (number | null)[]) =>
    Array.from({ length: Math.max(RECOVERY_REPS, s.length) }, (_, k) => ({ index: k + 1, score: s[k] ?? null, done: k < s.length }));

  if (set.recovery) {
    const r = set.recovery;
    const copy = RESULT_COPY[r.status];
    const scored = r.scores.filter((x) => x !== null).length;
    return {
      state: r.status,
      ...copy,
      value: `${Math.round(r.percent * 100)}%`,
      valueLabel: 'of the change gone',
      note: r.scores.length ? `From ${scored} scored rep${scored === 1 ? '' : 's'} of ${r.scores.length}` : null,
      nodes: nodes(Math.min(RECOVERY_REPS, r.scores.length)),
      scores: scoresOf(r.scores),
    };
  }
  if (set.alertRep === null) {
    return {
      state: 'not-needed',
      title: 'No recovery check needed',
      instruction: 'This set ended without an alert, so there is no change to recover from.',
      value: '—',
      valueLabel: 'No alert this set',
      note: null,
      nodes: nodes(0),
      scores: scoresOf([]),
    };
  }
  if (set.origin === 'record' || i.phase === null) {
    return {
      state: 'not-run',
      title: 'No recovery check',
      instruction: 'No recovery check was completed after this set.',
      value: '—',
      valueLabel: 'Not run',
      note: null,
      nodes: nodes(0),
      scores: scoresOf([]),
    };
  }
  if (i.phase === 'recovery') {
    const done = i.liveScores.length;
    const scored = i.liveScores.filter((x) => x !== null).length;
    if (done >= RECOVERY_REPS && scored === 0) {
      return {
        state: 'insufficient',
        title: 'Not enough scored reps',
        instruction: `None of the ${plural(done, 'recovery rep')} could be scored, so the check cannot be assessed yet. Make sure your whole body is in view and do another rep.`,
        value: String(done),
        valueLabel: 'reps, none scored',
        note: 'The check finishes with your next scored rep',
        nodes: nodes(RECOVERY_REPS),
        scores: scoresOf(i.liveScores),
      };
    }
    return {
      state: 'active',
      title: 'Recovery check',
      instruction: `${RECOVERY_REPS} controlled reps, compared with your usual form.`,
      value: String(Math.min(done, RECOVERY_REPS)),
      valueLabel: `of ${RECOVERY_REPS} reps`,
      note: done > scored ? `${plural(done - scored, 'rep')} not scored` : null,
      nodes: nodes(Math.min(done, RECOVERY_REPS)),
      scores: scoresOf(i.liveScores),
    };
  }
  return {
    state: 'rest',
    title: 'Rest, then check your recovery',
    instruction: 'Set saved. Rest until you feel ready, then do 3 controlled reps. They are compared with your usual form.',
    value: mmss(i.restSeconds),
    valueLabel: 'resting',
    note: null,
    nodes: nodes(0),
    scores: scoresOf([]),
  };
}

// ---------------------------------------------------------------- rep chart
export interface ChartBar {
  index: number;
  score: number | null;
  /** Bar height as a share of the chart, 0–1 (0 for a rep that was not scored). */
  height: number;
  tone: 'usual' | 'changing' | 'alert' | 'unscored';
}

export interface ChartModel {
  bars: ChartBar[];
  /** Warning and alert lines as a share of the chart height, when the levels are known. */
  warningAt: number | null;
  alertAt: number | null;
  onsetRep: number | null;
  alertRep: number | null;
}

/** Make's rep-by-rep telemetry bars, scaled so the alert line (when known) stays inside the chart. */
export function chartModel(set: Pick<PostSet, 'reps' | 'levels' | 'onsetRep' | 'alertRep'>): ChartModel {
  const scores = set.reps.map((r) => r.score).filter((s): s is number => s !== null && Number.isFinite(s));
  const top = Math.max(1, ...scores, set.levels ? set.levels.alert * 1.15 : 0);
  const at = (v: number) => Math.max(0, Math.min(1, v / top));
  return {
    bars: set.reps.map((r) => ({
      index: r.index,
      score: r.score,
      height: r.score === null ? 0 : at(r.score),
      tone:
        r.score === null
          ? 'unscored'
          : (set.alertRep !== null && r.index >= set.alertRep) || r.state === 'BREAKPOINT'
            ? 'alert'
            : r.state === 'DRIFT' || (set.onsetRep !== null && r.index >= set.onsetRep)
              ? 'changing'
              : 'usual',
    })),
    warningAt: set.levels ? at(set.levels.warning) : null,
    alertAt: set.levels ? at(set.levels.alert) : null,
    onsetRep: set.onsetRep,
    alertRep: set.alertRep,
  };
}
