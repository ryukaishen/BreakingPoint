import type { RecoveryStatus } from '../../detection/recovery';
import type { StoredBaseline, SessionRecord } from '../../data/types';
import { getSport } from '../../protocols/launch';
import { PROTOCOLS, type ProtocolStatus } from '../../protocols/protocols';

export interface StatusMovement {
  protocolId: string;
  sportId: string | null;
  subSportId?: string;
  contextName: string;
  title: string;
  availability: ProtocolStatus | null;
  sessionCount: number;
  latestAt: string | null;
}

export interface StatusHero {
  /** Reps held at usual form on the latest set that counted. Null when none has. */
  held: number | null;
  sessionId: string | null;
  startedAt: string | null;
}

export interface StatusLatest {
  id: string;
  startedAt: string;
  eligible: boolean;
  reasons: string[];
  heldReps: number;
  breakpointRep: number | null;
  onsetRep: number | null;
  recoveryPercent: number | null;
  recoveryStatus: RecoveryStatus | null;
}

export interface StatusBaselineFact {
  saved: boolean;
  savedAt: string | null;
  nReps: number | null;
  /** Whether that saved baseline was consistent enough to count toward records. */
  countsTowardRecords: boolean | null;
}

export interface StatusModel {
  movements: StatusMovement[];
  selected: StatusMovement | null;
  hero: StatusHero;
  latest: StatusLatest | null;
  countedSets: number;
  storedSets: number;
  baseline: StatusBaselineFact;
  /** A newer set exists, and it did not count, while the hero comes from an older counted set. */
  newerSetUncounted: boolean;
}

function names(protocolId: string, sportId: string | null, subSportId?: string): Pick<StatusMovement, 'contextName' | 'title' | 'availability'> {
  const protocol = PROTOCOLS[protocolId];
  const sport = sportId ? getSport(sportId) : undefined;
  const sub = sport?.subSports?.find((s) => s.id === subSportId);
  const ref = (sub?.protocols ?? sport?.protocols ?? []).find((r) => r.protocolId === protocolId);
  return {
    contextName: sub?.name ?? sport?.name ?? 'Saved on this device',
    title: ref?.title ?? protocol?.name ?? protocolId,
    availability: protocol?.status ?? null,
  };
}

function latestSession(rows: readonly SessionRecord[]): SessionRecord | null {
  return rows.reduce<SessionRecord | null>((best, row) => (!best || row.startedAt > best.startedAt ? row : best), null);
}

/**
 * Status readout for one athlete. Every figure comes from stored sessions and
 * saved baselines. The hero is reps held at usual form, never a level or score.
 */
export function deriveStatus(args: { sessions: readonly SessionRecord[]; baselines: readonly StoredBaseline[]; selectedProtocolId?: string | null }): StatusModel {
  const byProtocol = new Map<string, SessionRecord[]>();
  for (const session of args.sessions) {
    const rows = byProtocol.get(session.protocolId) ?? [];
    rows.push(session);
    byProtocol.set(session.protocolId, rows);
  }
  for (const baseline of args.baselines) {
    if (!byProtocol.has(baseline.protocolId)) byProtocol.set(baseline.protocolId, []);
  }

  const movements: StatusMovement[] = [...byProtocol.entries()].map(([protocolId, rows]) => {
    const newest = latestSession(rows);
    const named = names(protocolId, newest?.sportId ?? null, newest?.subSportId);
    return {
      protocolId,
      sportId: newest?.sportId ?? null,
      subSportId: newest?.subSportId,
      ...named,
      sessionCount: rows.length,
      latestAt: newest?.startedAt ?? null,
    };
  });
  movements.sort((a, b) => (b.latestAt ?? '').localeCompare(a.latestAt ?? '') || a.title.localeCompare(b.title));

  const selected = movements.find((m) => m.protocolId === args.selectedProtocolId) ?? movements[0] ?? null;
  const rows = selected ? (byProtocol.get(selected.protocolId) ?? []) : [];
  const latestRow = latestSession(rows);
  const counted = rows.filter((row) => row.quality.eligible).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const heroRow = counted[counted.length - 1] ?? null;
  const stored = selected ? args.baselines.find((b) => b.protocolId === selected.protocolId) ?? null : null;

  const latest: StatusLatest | null = latestRow
    ? {
        id: latestRow.id,
        startedAt: latestRow.startedAt,
        eligible: latestRow.quality.eligible,
        reasons: latestRow.quality.reasons,
        heldReps: latestRow.heldReps,
        breakpointRep: latestRow.breakpointRep,
        onsetRep: latestRow.onsetRep,
        recoveryPercent: latestRow.recovery?.percent ?? null,
        recoveryStatus: latestRow.recovery?.status ?? null,
      }
    : null;

  return {
    movements,
    selected,
    hero: {
      held: heroRow?.heldReps ?? null,
      sessionId: heroRow?.id ?? null,
      startedAt: heroRow?.startedAt ?? null,
    },
    latest,
    countedSets: counted.length,
    storedSets: rows.length,
    baseline: stored
      ? { saved: true, savedAt: stored.savedAt, nReps: stored.calibration.nReps, countsTowardRecords: stored.calibration.ok }
      : { saved: false, savedAt: null, nReps: null, countsTowardRecords: null },
    newerSetUncounted: !!latest && !!heroRow && latest.id !== heroRow.id && !latest.eligible,
  };
}
