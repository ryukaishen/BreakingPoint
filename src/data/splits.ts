// Rep-by-rep comparison of a finished set against the athlete's own best earlier
// set: the data behind the debrief's record-line replay.
//
// Rules (PRODUCT.md): you versus your own past, under comparable conditions only.
//  - The reference is the earlier set with the most reps held at baseline, chosen only
//    among sets comparable to this one (same athlete, source, protocol, detector, and
//    both past the quality floor). No comparable set means no comparison, never a
//    comparison against a set from different conditions.
//  - Only "held at baseline" is compared as better or worse. When drift began and when
//    the breaking point fired are reported as facts and never judged: a later breaking
//    point is not an achievement, and nothing here rewards continuing past a warning.
//  - Reps performed after the warning are kept visible but marked, and never counted.

import { comparable, heldOutcome, type HeldOutcome } from './progress';
import type { SessionRecord, SessionRep } from './types';

export type CellState = 'stable' | 'drift' | 'break' | 'unscored';

export interface SplitCell {
  index: number;
  state: CellState;
  /** Performed after the breaking point warning. Shown, never counted. */
  afterWarning: boolean;
  score: number | null;
}

export interface SplitLane {
  label: string;
  startedAt: string;
  cells: SplitCell[];
  /** Reps held at baseline: the line the record is measured on. */
  held: number;
  onsetRep: number | null;
  breakpointRep: number | null;
}

export interface SplitRow {
  id: 'held' | 'onset' | 'break';
  label: string;
  today: string;
  best: string | null;
  /** Only the held row has a delta; it is stated in words, never implied by colour. */
  delta: string | null;
}

export interface SplitsModel {
  today: SplitLane;
  best: SplitLane | null;
  /** Number of rep columns: the longer of the two sets. */
  slots: number;
  outcome: HeldOutcome;
  headline: string;
  /** Why there is no comparison, or what the first set means. null when a comparison is shown. */
  note: string | null;
  rows: SplitRow[];
}

const STATE: Record<string, CellState> = { STABLE: 'stable', DRIFT: 'drift', BREAKPOINT: 'break' };

export function toCell(r: SessionRep): SplitCell {
  return { index: r.index, state: r.state ? (STATE[r.state] ?? 'unscored') : 'unscored', afterWarning: r.afterWarning, score: r.score };
}

/** The earlier comparable set with the most reps held at baseline; ties go to the most recent. */
export function bestComparable(history: readonly SessionRecord[], rec: SessionRecord): SessionRecord | null {
  let best: SessionRecord | null = null;
  for (const s of history) {
    if (s.id === rec.id || s.startedAt >= rec.startedAt || !comparable(rec, s)) continue;
    if (!best || s.heldReps > best.heldReps || (s.heldReps === best.heldReps && s.startedAt > best.startedAt)) best = s;
  }
  return best;
}

const shortDate = (iso: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(iso));

function lane(rec: SessionRecord, label: string): SplitLane {
  return {
    label,
    startedAt: rec.startedAt,
    cells: rec.reps.map(toCell),
    held: rec.heldReps,
    onsetRep: rec.onsetRep,
    breakpointRep: rec.breakpointRep,
  };
}

const rep = (n: number | null) => (n === null ? 'None' : `Rep ${n}`);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function buildSplits(history: readonly SessionRecord[], rec: SessionRecord, opts: { formatDate?: (iso: string) => string } = {}): SplitsModel {
  const fmt = opts.formatDate ?? shortDate;
  const outcome = heldOutcome(history, rec);
  const ref = outcome.kind === 'not-eligible' ? null : bestComparable(history, rec);
  const today = lane(rec, 'This set');
  const best = ref ? lane(ref, `Best set, ${fmt(ref.startedAt)}`) : null;

  let headline: string;
  let note: string | null = null;
  const held = plural(rec.heldReps, 'rep');
  switch (outcome.kind) {
    case 'new-record':
      headline = `You held your baseline for ${held}, ${plural(rec.heldReps - (outcome.previousBest ?? 0), 'rep')} more than your best.`;
      break;
    case 'matched':
      headline = `You held your baseline for ${held}, matching your best.`;
      break;
    case 'below':
      headline = `You held your baseline for ${held}. Your best is ${outcome.previousBest}.`;
      break;
    case 'first-record':
      headline = `You held your baseline for ${held}.`;
      note = 'This is the first set that counts toward your records. It becomes the line to beat.';
      break;
    default:
      headline = `You held your baseline for ${held}.`;
      note = `Not compared with your other sets: ${outcome.reasons[0]?.toLowerCase() ?? 'conditions were not comparable'}.`;
  }

  const diff = ref ? rec.heldReps - ref.heldReps : null;
  const rows: SplitRow[] = [
    {
      id: 'held',
      label: 'Held at baseline',
      today: String(rec.heldReps),
      best: ref ? String(ref.heldReps) : null,
      delta: diff === null ? null : diff === 0 ? 'same' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)}`,
    },
    { id: 'onset', label: 'Changes began', today: rep(rec.onsetRep), best: ref ? rep(ref.onsetRep) : null, delta: null },
    { id: 'break', label: 'Breaking point', today: rep(rec.breakpointRep), best: ref ? rep(ref.breakpointRep) : null, delta: null },
  ];

  return { today, best, slots: Math.max(today.cells.length, best?.cells.length ?? 0), outcome, headline, note, rows };
}

/** Plain-words state of one rep slot, for the text alternative. */
export function cellLabel(c: SplitCell | undefined): string {
  if (!c) return 'No rep';
  const base = { stable: 'At baseline', drift: 'Form changing', break: 'Breaking point', unscored: 'Not scored' }[c.state];
  return c.afterWarning ? `${base}, after the warning` : base;
}
