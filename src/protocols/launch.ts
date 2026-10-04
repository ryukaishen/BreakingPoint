// Resolves SPORT → PROTOCOL → PRIMITIVE → engine. This is the only place where a
// sport selection turns into something runnable, and it refuses roadmap protocols.
// The result never contains detector parameters: every launch uses the same
// Lab-calibrated DetectorConfig (BreakingPoint Lab; local or HiPerGator) loaded at startup.

import type { ExerciseType } from '../biomechanics/catalog';
import type { PatternId } from './patterns';
import { PRIMITIVES, type PrimitiveDef } from './primitives';
import { canLaunch, PROTOCOLS, type ProtocolDef, type ProtocolStatus } from './protocols';
import { SPORTS, type SportContextDef, type SportProfile, type SportProtocolRef } from './sports';

export interface LaunchContext {
  sport: SportProfile;
  /** The sub-sport when one was chosen (e.g. Pickleball inside Racquet Sports). */
  subSport?: SportContextDef;
  protocol: ProtocolDef;
  ref: SportProtocolRef;
  primitive: PrimitiveDef;
  exercise: ExerciseType;
  status: ProtocolStatus;
  /** Display name of the sport context ("Pickleball", "Soccer"). */
  contextName: string;
  title: string;
  purpose: string;
  session: string;
  focus: string[];
  patternLabels: Partial<Record<PatternId, string>>;
  featureLabels: Record<string, string>;
}

export function getSport(id: string): SportProfile | undefined {
  return SPORTS.find((s) => s.id === id);
}

export function getSubSport(sport: SportProfile, subId?: string): SportContextDef | undefined {
  if (!sport.subSports?.length) return undefined;
  return sport.subSports.find((s) => s.id === subId) ?? sport.subSports[0];
}

export function protocolRefs(sport: SportProfile, subId?: string): SportProtocolRef[] {
  const sub = getSubSport(sport, subId);
  return sub ? sub.protocols : sport.protocols;
}

/** Returns a runnable context, or null when the sport/protocol is unknown or not launchable. */
export function resolveLaunch(sportId: string, protocolId: string, subSportId?: string): LaunchContext | null {
  const sport = getSport(sportId);
  if (!sport) return null;
  const sub = getSubSport(sport, subSportId);
  const ref = protocolRefs(sport, sub?.id).find((r) => r.protocolId === protocolId);
  const protocol = PROTOCOLS[protocolId];
  if (!ref || !protocol || !canLaunch(protocol)) return null;
  const primitive = PRIMITIVES[protocol.primitive];
  return {
    sport,
    subSport: sub,
    protocol,
    ref,
    primitive,
    exercise: primitive.engine as ExerciseType,
    status: protocol.status,
    contextName: sub?.name ?? sport.name,
    title: ref.title ?? protocol.name,
    purpose: ref.purpose ?? protocol.purpose,
    session: ref.session ?? 'Training screen',
    focus: ref.focus ?? protocol.metrics,
    patternLabels: { ...sport.patternLabels, ...sub?.patternLabels },
    featureLabels: { ...sport.featureLabels, ...sub?.featureLabels },
  };
}

/** The original reference implementation: Strength · Bodyweight Squat. */
export const DEFAULT_LAUNCH = resolveLaunch('strength', 'squat-bodyweight') as LaunchContext;

export interface DemoContextDef {
  id: string;
  sportId: string;
  subSportId?: string;
  protocolId: string;
  label: string;
}

/** Featured demo contexts. Same primitive ⇒ same real pipeline; only the sport context differs. */
export const DEMO_CONTEXTS: DemoContextDef[] = [
  { id: 'soccer', sportId: 'soccer', protocolId: 'jump-repeated', label: 'Repeated CMJ' },
  { id: 'volleyball', sportId: 'volleyball', protocolId: 'jump-repeated', label: 'Repeated jump' },
  { id: 'strength', sportId: 'strength', protocolId: 'squat-bodyweight', label: 'Squat' },
  { id: 'pickleball', sportId: 'racquet', subSportId: 'pickleball', protocolId: 'lunge-forward', label: 'Forward lunge' },
];

export function resolveDemo(id: string): LaunchContext | null {
  const d = DEMO_CONTEXTS.find((c) => c.id === id);
  return d ? resolveLaunch(d.sportId, d.protocolId, d.subSportId) : null;
}

/** Backwards-compatible deep links (?exercise=squat|cmj|lunge). */
export function launchForExercise(ex: string | null): LaunchContext {
  if (ex === 'cmj') return resolveLaunch('soccer', 'jump-repeated') as LaunchContext;
  if (ex === 'lunge') return resolveLaunch('racquet', 'lunge-forward', 'pickleball') as LaunchContext;
  return DEFAULT_LAUNCH;
}

/** Every (sport, sub-sport, protocol) combination, for the protocol library and tests. */
export function allProtocolEntries(): { sport: SportProfile; sub?: SportContextDef; ref: SportProtocolRef; protocol: ProtocolDef }[] {
  const out: { sport: SportProfile; sub?: SportContextDef; ref: SportProtocolRef; protocol: ProtocolDef }[] = [];
  for (const sport of SPORTS) {
    const contexts: (SportContextDef | undefined)[] = sport.subSports?.length ? sport.subSports : [undefined];
    for (const sub of contexts) {
      for (const ref of (sub ?? sport).protocols) {
        const protocol = PROTOCOLS[ref.protocolId];
        if (protocol) out.push({ sport, sub, ref, protocol });
      }
    }
  }
  return out;
}
