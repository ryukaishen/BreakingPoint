// Session history for the post-workout system: one athlete's stored sets, newest first,
// with the movement filter and the "compared with" check. Comparisons follow the same
// rules as records (data/progress.ts, comparable): same athlete, source, protocol and
// detector version, and both sets eligible. Nothing here writes to storage.

import { resolveLaunch } from '../protocols/launch';
import { comparable } from './progress';
import type { SessionRecord } from './types';

export interface HistoryEntry {
  record: SessionRecord;
  /** The movement's display name, from the protocol registry. */
  title: string;
  contextName: string;
}

export function historyEntries(records: readonly SessionRecord[]): HistoryEntry[] {
  return [...records]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((record) => {
      const ctx = resolveLaunch(record.sportId, record.protocolId, record.subSportId);
      return { record, title: ctx?.title ?? record.protocolId, contextName: ctx?.contextName ?? record.sportId };
    });
}

/** The movements present in this history, most recently trained first. */
export function historyMovements(entries: readonly HistoryEntry[]): { protocolId: string; title: string; count: number }[] {
  const out = new Map<string, { protocolId: string; title: string; count: number }>();
  for (const e of entries) {
    const m = out.get(e.record.protocolId);
    if (m) m.count++;
    else out.set(e.record.protocolId, { protocolId: e.record.protocolId, title: e.title, count: 1 });
  }
  return [...out.values()];
}

export function filterHistory(entries: readonly HistoryEntry[], protocolId: string | null): HistoryEntry[] {
  return protocolId ? entries.filter((e) => e.record.protocolId === protocolId) : [...entries];
}

/** Why two sets cannot be compared, in plain words (empty when they can). */
export function comparabilityReasons(a: SessionRecord, b: SessionRecord): string[] {
  const out: string[] = [];
  if (a.athleteId !== b.athleteId) out.push('Different athletes');
  if (a.source !== b.source) out.push('One is a demo set and one a live set');
  if (a.protocolId !== b.protocolId) out.push('Different movements');
  if (a.detectorConfigId !== b.detectorConfigId) out.push('Scored by different detector versions');
  if (!a.quality.eligible) out.push(`This set does not count: ${a.quality.reasons[0]?.toLowerCase() ?? 'conditions not comparable'}`);
  if (!b.quality.eligible) out.push(`The earlier set does not count: ${b.quality.reasons[0]?.toLowerCase() ?? 'conditions not comparable'}`);
  return out;
}

export type Comparison =
  | { kind: 'compared'; previous: SessionRecord; heldDelta: number }
  | { kind: 'no-earlier' }
  | { kind: 'not-comparable'; previous: SessionRecord | null; reasons: string[] };

/**
 * The selected set against the most recent earlier comparable set on the same movement. The
 * comparison is reps held at the athlete's usual form; reaching the alert is never rewarded.
 */
export function compareWithEarlier(history: readonly SessionRecord[], rec: SessionRecord): Comparison {
  const earlier = history
    .filter((s) => s.id !== rec.id && s.startedAt < rec.startedAt && s.protocolId === rec.protocolId && s.athleteId === rec.athleteId && s.source === rec.source)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  if (!earlier.length) return { kind: 'no-earlier' };
  const match = earlier.find((s) => comparable(rec, s));
  if (match) return { kind: 'compared', previous: match, heldDelta: rec.heldReps - match.heldReps };
  return { kind: 'not-comparable', previous: earlier[0], reasons: comparabilityReasons(rec, earlier[0]) };
}

const DAY = 86_400_000;

/** "Today", "Yesterday", "5 days ago", or a date for anything older than a month. */
export function relativeDay(iso: string, now: Date): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 31) return `${days} days ago`;
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}
