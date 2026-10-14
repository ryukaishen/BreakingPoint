// What the sport page and the protocol library show for each sport: one entry per protocol in a
// sport context (a sport, or one of its disciplines). Built only from sports.ts and protocols.ts,
// and launch rights come from resolveLaunch, so a roadmap protocol can never become runnable here.

import { makeLabeler } from './labels';
import { getSubSport, protocolRefs, resolveLaunch, type LaunchContext } from './launch';
import { PRIMITIVES, type PrimitiveDef, type PrimitiveId } from './primitives';
import { PROTOCOLS, type ProtocolDef, type ProtocolStatus } from './protocols';
import { SPORTS, type SportContextDef, type SportProfile, type SportProtocolRef } from './sports';

export interface MovementEntry {
  /** Unique within a sport: the context and the protocol. */
  key: string;
  sport: SportProfile;
  sub?: SportContextDef;
  /** The discipline's name, or the sport's when it has none. */
  context: string;
  protocol: ProtocolDef;
  ref: SportProtocolRef;
  primitive: PrimitiveDef;
  status: ProtocolStatus;
  title: string;
  tagline?: string;
  purpose: string;
  camera: string;
  /** A runnable context for READY and BETA protocols; null for roadmap protocols, which cannot launch. */
  launch: LaunchContext | null;
  /** What a launchable protocol measures, in the sport's words; for a roadmap protocol, its own planned list. */
  measures: string[];
}

function entry(sport: SportProfile, sub: SportContextDef | undefined, ref: SportProtocolRef): MovementEntry | null {
  const protocol = PROTOCOLS[ref.protocolId];
  if (!protocol) return null;
  const launch = resolveLaunch(sport.id, protocol.id, sub?.id);
  const labels = launch ? makeLabeler(launch.exercise, launch.featureLabels) : null;
  return {
    key: `${sub?.id ?? sport.id}:${protocol.id}`,
    sport,
    sub,
    context: sub?.name ?? sport.name,
    protocol,
    ref,
    primitive: PRIMITIVES[protocol.primitive],
    status: protocol.status,
    title: ref.title ?? protocol.name,
    tagline: ref.tagline,
    purpose: ref.purpose ?? protocol.purpose,
    camera: protocol.camera,
    launch,
    measures: launch && labels ? launch.focus.map((k) => labels.short(k)) : [...(protocol.plannedMetrics ?? [])],
  };
}

const contextsOf = (sport: SportProfile): (SportContextDef | undefined)[] => (sport.subSports?.length ? sport.subSports : [undefined]);

/** The movements of one sport context: the sport, or one discipline (the first when none is named). */
export function movementEntries(sport: SportProfile, subId?: string): MovementEntry[] {
  const sub = getSubSport(sport, subId);
  return protocolRefs(sport, sub?.id).flatMap((ref) => entry(sport, sub, ref) ?? []);
}

/** Every movement of a sport across all of its disciplines, in discipline order. */
export function sportEntries(sport: SportProfile): MovementEntry[] {
  return contextsOf(sport).flatMap((sub) => (sub ?? sport).protocols.flatMap((ref) => entry(sport, sub, ref) ?? []));
}

/** Which entry opens selected: the protocol asked for when present, else the first runnable one, else the first. */
export function defaultEntry(entries: MovementEntry[], preferredProtocolId?: string): number {
  const preferred = preferredProtocolId ? entries.findIndex((e) => e.protocol.id === preferredProtocolId) : -1;
  if (preferred >= 0) return preferred;
  const runnable = entries.findIndex((e) => e.launch !== null);
  return runnable >= 0 ? runnable : 0;
}

/** The movement types (primitives) a sport uses, in first-use order. */
export function sportPrimitives(sport: SportProfile): PrimitiveDef[] {
  const ids: PrimitiveId[] = [];
  for (const e of sportEntries(sport)) if (!ids.includes(e.primitive.id)) ids.push(e.primitive.id);
  return ids.map((id) => PRIMITIVES[id]);
}

/** Ready, beta and roadmap protocols across a sport and its disciplines, each protocol counted once. */
export function sportReadiness(sport: SportProfile): { ready: number; beta: number; roadmap: number; total: number } {
  const ids = new Set(sportEntries(sport).map((e) => e.protocol.id));
  const statuses = [...ids].map((id) => PROTOCOLS[id].status);
  const ready = statuses.filter((s) => s === 'READY').length;
  const beta = statuses.filter((s) => s === 'BETA').length;
  return { ready, beta, roadmap: statuses.length - ready - beta, total: statuses.length };
}

/** The other sport contexts that list the same protocol, by display name. */
export function sharedContexts(e: MovementEntry): string[] {
  const names: string[] = [];
  for (const sport of SPORTS) {
    for (const sub of contextsOf(sport)) {
      if ((sub?.id ?? sport.id) === (e.sub?.id ?? e.sport.id)) continue;
      if ((sub ?? sport).protocols.some((r) => r.protocolId === e.protocol.id)) names.push(sub?.name ?? sport.name);
    }
  }
  return names;
}

/** Display name of a protocol status. */
export const STATUS_NAME: Record<ProtocolStatus, string> = { READY: 'Ready', BETA: 'Beta', COMING_SOON: 'Coming soon', FUTURE: 'Future' };

/** Status family for styling: ready, beta, or roadmap (coming soon and future). */
export function statusTone(s: ProtocolStatus): 'ready' | 'beta' | 'roadmap' {
  return s === 'READY' ? 'ready' : s === 'BETA' ? 'beta' : 'roadmap';
}
