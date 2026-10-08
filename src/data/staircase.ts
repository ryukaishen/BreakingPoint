// The record line over time: reps held at baseline for every session, with the
// running record as a staircase. Derived from stored sessions on every render.
//
// Rules (PRODUCT.md): you versus your own past, under comparable conditions only.
//  - Every session is shown, so a session that did not beat the record is still readable.
//  - Only sessions that pass the quality floor (and share a protocol and detector version)
//    move the record. A session that did not count is shown and labelled, never hidden
//    and never allowed to raise the line.
//  - The first counted session establishes the line; it is not called a record.

import type { SessionRecord } from './types';

export type StairStatus = 'first' | 'record' | 'matched' | 'below' | 'not-counted';

export interface StairSession {
  sessionId: string;
  at: string;
  held: number;
  /** The record after this session, counting only sessions that count (0 before the first one). */
  best: number;
  status: StairStatus;
  /** Why it did not count, when status is 'not-counted'. */
  reasons: string[];
}

export interface StaircaseModel {
  sessions: StairSession[];
  /** Sessions before the window, omitted from the chart (their effect on the record is kept). */
  omitted: number;
  record: { value: number; at: string; sessionId: string } | null;
  /** True when the newest session raised the record (the only case that earns the lime treatment). */
  latestIsRecord: boolean;
  yMax: number;
  yTicks: number[];
}

/** A round upper bound and gridline step for a count axis that starts at zero. */
export function niceAxis(max: number): { yMax: number; ticks: number[] } {
  const step = max <= 10 ? 2 : max <= 30 ? 5 : 10;
  const yMax = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= yMax; v += step) ticks.push(v);
  return { yMax, ticks };
}

export function buildStaircase(history: readonly SessionRecord[], protocolId: string, opts: { configId?: string; maxSessions?: number } = {}): StaircaseModel {
  const { configId, maxSessions = 20 } = opts;
  const own = history
    .filter((s) => s.protocolId === protocolId && (!configId || s.detectorConfigId === configId))
    .slice()
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  let best = -1;
  let record: StaircaseModel['record'] = null;
  const all: StairSession[] = [];
  for (const s of own) {
    if (!s.quality.eligible) {
      all.push({ sessionId: s.id, at: s.startedAt, held: s.heldReps, best: Math.max(best, 0), status: 'not-counted', reasons: s.quality.reasons });
      continue;
    }
    const status: StairStatus = best < 0 ? 'first' : s.heldReps > best ? 'record' : s.heldReps === best ? 'matched' : 'below';
    if (s.heldReps > best) {
      best = s.heldReps;
      record = { value: s.heldReps, at: s.startedAt, sessionId: s.id };
    }
    all.push({ sessionId: s.id, at: s.startedAt, held: s.heldReps, best, status, reasons: [] });
  }

  const sessions = all.slice(-Math.max(1, maxSessions));
  const peak = Math.max(0, ...sessions.map((s) => s.held), record?.value ?? 0);
  const { yMax, ticks } = niceAxis(peak);
  const last = all[all.length - 1];
  return { sessions, omitted: all.length - sessions.length, record, latestIsRecord: !!last && last.status === 'record', yMax, yTicks: ticks };
}

export function statusLabel(s: StairSession): string {
  switch (s.status) {
    case 'first':
      return 'First counted session, sets your starting record line';
    case 'record':
      return 'New record';
    case 'matched':
      return 'Matched your record';
    case 'below':
      return 'Below your record';
    default:
      return `Did not count toward records${s.reasons[0] ? `: ${s.reasons[0].toLowerCase()}` : ''}`;
  }
}
