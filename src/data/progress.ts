// Long-term progression, derived from stored sessions every time it is shown.
// Records, comparisons and milestones are never stored separately, so they can
// never disagree with the session history they come from.
//
// Philosophy: you versus your past self, under comparable conditions only.
// Nothing here rewards reaching the breaking point, reps after a warning,
// volume, or short rests.

import type { MovementState } from '../detection/detector';
import type { AthleteProfile, SessionRecord } from './types';

// ---------------------------------------------------------------- reps held at baseline
type StepLike = { step?: { state: MovementState } | null };

/** Consecutive STABLE reps from the start of a set, stopping at the first DRIFT/BREAKPOINT rep. Unscored reps neither count nor break the run. */
export function heldReps(reps: readonly StepLike[]): number {
  let n = 0;
  for (const r of reps) {
    if (!r.step) continue;
    if (r.step.state !== 'STABLE') break;
    n++;
  }
  return n;
}

/** True while every scored rep so far has been STABLE. */
export function stillHolding(reps: readonly StepLike[]): boolean {
  return reps.every((r) => !r.step || r.step.state === 'STABLE');
}

// ---------------------------------------------------------------- comparability
/** Two sets may be compared only for the same athlete, source, protocol and detector version, and only when both passed the quality floor. */
export function comparable(a: SessionRecord, b: SessionRecord): boolean {
  return (
    a.athleteId === b.athleteId &&
    a.source === b.source &&
    a.protocolId === b.protocolId &&
    a.detectorConfigId === b.detectorConfigId &&
    a.quality.eligible &&
    b.quality.eligible
  );
}

const before = (s: SessionRecord, rec: SessionRecord) => s.id !== rec.id && s.startedAt < rec.startedAt;

export type HeldOutcomeKind = 'new-record' | 'first-record' | 'matched' | 'below' | 'not-eligible';

export interface HeldOutcome {
  kind: HeldOutcomeKind;
  held: number;
  previousBest: number | null;
  previousBestAt: string | null;
  /** Why the set could not count, when kind is 'not-eligible'. */
  reasons: string[];
}

/** How a set's reps held at baseline compares with the athlete's earlier comparable sets. */
export function heldOutcome(history: readonly SessionRecord[], rec: SessionRecord): HeldOutcome {
  const prior = history.filter((s) => before(s, rec) && s.protocolId === rec.protocolId && s.detectorConfigId === rec.detectorConfigId && s.quality.eligible && s.athleteId === rec.athleteId && s.source === rec.source);
  const best = prior.reduce<SessionRecord | null>((b, s) => (!b || s.heldReps > b.heldReps ? s : b), null);
  const base = { held: rec.heldReps, previousBest: best?.heldReps ?? null, previousBestAt: best?.startedAt ?? null, reasons: [] as string[] };
  if (!rec.quality.eligible) return { ...base, kind: 'not-eligible', reasons: rec.quality.reasons };
  if (!best) return { ...base, kind: 'first-record' };
  if (rec.heldReps > best.heldReps) return { ...base, kind: 'new-record' };
  return { ...base, kind: rec.heldReps === best.heldReps ? 'matched' : 'below' };
}

/** The most recent earlier set on the same protocol (for "compared with last time"). */
export function previousSession(history: readonly SessionRecord[], rec: SessionRecord): SessionRecord | null {
  const prior = history.filter((s) => before(s, rec) && s.protocolId === rec.protocolId && s.athleteId === rec.athleteId && s.source === rec.source);
  return prior.length ? prior[prior.length - 1] : null;
}

// ---------------------------------------------------------------- records
export interface RecordEntry {
  value: number;
  sessionId: string;
  at: string;
}

export interface PersonalRecords {
  /** Most reps held at baseline (higher is better). */
  mostHeld: RecordEntry | null;
  /** Best recovery-check return toward baseline, 0–1 (higher is better). */
  bestRecovery: RecordEntry | null;
  /** Lowest in-control spread σ₀ from calibration: most consistent fresh reps (lower is better). */
  steadiestBaseline: RecordEntry | null;
}

export function eligibleSessions(history: readonly SessionRecord[], protocolId: string, configId?: string): SessionRecord[] {
  return history.filter((s) => s.protocolId === protocolId && s.quality.eligible && (!configId || s.detectorConfigId === configId));
}

export function personalRecords(history: readonly SessionRecord[], protocolId: string, configId?: string): PersonalRecords {
  const el = eligibleSessions(history, protocolId, configId);
  const pick = (val: (s: SessionRecord) => number | null, better: (a: number, b: number) => boolean): RecordEntry | null => {
    let out: RecordEntry | null = null;
    for (const s of el) {
      const v = val(s);
      if (v === null || !Number.isFinite(v)) continue;
      if (!out || better(v, out.value)) out = { value: v, sessionId: s.id, at: s.startedAt };
    }
    return out;
  };
  return {
    mostHeld: pick((s) => s.heldReps, (a, b) => a > b),
    bestRecovery: pick((s) => s.recovery?.percent ?? null, (a, b) => a > b),
    steadiestBaseline: pick((s) => (s.calibration.referenceSource === 'loo' ? s.calibration.sigma0 : null), (a, b) => a < b),
  };
}

export interface RecordStep {
  sessionId: string;
  at: string;
  held: number;
  /** The record after this session (the staircase). */
  best: number;
  /** This session raised the record (the first session establishes it). */
  raised: boolean;
}

/** Staircase data for the record line: every eligible comparable set with the running best. */
export function recordSteps(history: readonly SessionRecord[], protocolId: string, configId?: string): RecordStep[] {
  let best = -1;
  return eligibleSessions(history, protocolId, configId).map((s) => {
    const raised = s.heldReps > best;
    best = Math.max(best, s.heldReps);
    return { sessionId: s.id, at: s.startedAt, held: s.heldReps, best, raised };
  });
}

// ---------------------------------------------------------------- training consistency
/** Monday 00:00 local time of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export interface TrainingWeek {
  weekStart: Date;
  /** Distinct days with at least one completed set. */
  days: number;
  /** null when the athlete has not set a weekly goal. */
  met: boolean | null;
  current: boolean;
}

/** Training days per week for the last `weeks` weeks (oldest first). Rest days never break anything. */
export function trainingWeeks(history: readonly SessionRecord[], goal: number | null, now: Date, weeks = 8): TrainingWeek[] {
  const thisWeek = startOfWeek(now);
  const out: TrainingWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisWeek);
    start.setDate(start.getDate() - 7 * i);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const days = new Set(
      history
        .map((s) => new Date(s.startedAt))
        .filter((d) => d >= start && d < end)
        .map(dayKey),
    ).size;
    out.push({ weekStart: start, days, met: goal ? days >= goal : null, current: i === 0 });
  }
  return out;
}

/** Consecutive weeks on goal, counting back from the current week (an unfinished current week only adds once met). */
export function goalStreak(weeks: readonly TrainingWeek[]): number {
  let n = 0;
  for (let i = weeks.length - 1; i >= 0; i--) {
    const w = weeks[i];
    if (w.met) n++;
    else if (w.current) continue;
    else break;
  }
  return n;
}

// ---------------------------------------------------------------- milestones
export interface Milestone {
  id: string;
  title: string;
  /** Exactly what earns it, in plain words. */
  criterion: string;
  earned: boolean;
  earnedAt: string | null;
  /** Current standing, e.g. "Best so far 83%". */
  detail: string;
  count?: number;
}

export function milestones(history: readonly SessionRecord[], profile: Pick<AthleteProfile, 'weeklyGoal'>, protocolId: string, now: Date, configId?: string): Milestone[] {
  const own = history.filter((s) => s.protocolId === protocolId);
  const calibrated = own.find((s) => s.calibration.ok) ?? null;
  const steps = recordSteps(history, protocolId, configId);
  const raises = steps.filter((s, i) => s.raised && i > 0);
  const recovered = own.find((s) => s.recovery?.status === 'recovered') ?? null;
  const bestRec = personalRecords(history, protocolId, configId).bestRecovery;
  const weeks = trainingWeeks(history, profile.weeklyGoal, now, 52);
  const metWeeks = weeks.filter((w) => w.met).length;
  return [
    {
      id: 'baseline-locked',
      title: 'Baseline locked',
      criterion: 'Calibrate this protocol with a baseline consistent enough to count toward records.',
      earned: !!calibrated,
      earnedAt: calibrated?.startedAt ?? null,
      detail: calibrated ? `${calibrated.calibration.nReps} fresh reps` : 'Not yet calibrated to the record standard',
    },
    {
      id: 'new-record',
      title: 'New record',
      criterion: 'Hold your baseline for more reps than your best comparable set.',
      earned: raises.length > 0,
      earnedAt: raises.length ? raises[raises.length - 1].at : null,
      detail: raises.length ? `${raises.length} time${raises.length === 1 ? '' : 's'}` : steps.length ? `Current best ${steps[steps.length - 1].best}` : 'Complete a set that counts toward records',
      count: raises.length,
    },
    {
      id: 'back-to-baseline',
      title: 'Back to baseline',
      criterion: 'A recovery check rated "recovered": back inside your warning line with at least 75% of the extra drift gone.',
      earned: !!recovered,
      earnedAt: recovered?.recovery?.completedAt ?? null,
      detail: bestRec ? `Best so far ${Math.round(bestRec.value * 100)}%` : 'Run a recovery check after a rest',
    },
    {
      id: 'goal-weeks',
      title: 'Weeks on goal',
      criterion: 'Train on as many days as your weekly goal. Rest days never count against you.',
      earned: metWeeks > 0,
      earnedAt: null,
      detail: profile.weeklyGoal ? `${metWeeks} week${metWeeks === 1 ? '' : 's'} met` : 'Set a weekly goal',
      count: metWeeks,
    },
  ];
}
