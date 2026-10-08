// Athlete repository: profiles, baselines, session history and legacy items,
// all keyed by athlete id. Two kinds exist and never share storage:
//   'real'   – persisted in this browser; accepts only live-camera sessions
//   'sample' – the synthetic sample athlete, in memory only; accepts only demo sessions

import type { KeyValueStore } from './kv';
import { readJson, writeJson } from './kv';
import { SCHEMA_VERSION, type AthleteProfile, type LegacyBaseline, type SessionRecord, type SessionSource, type StoreMeta, type StoredBaseline } from './types';

export type RepositoryKind = 'real' | 'sample';

export const REAL_NAMESPACE = 'bp.v2';
export const NAME_MAX = 32;

export function newId(prefix: string): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const raw = c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${raw}`;
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export class AthleteRepository {
  readonly acceptedSource: SessionSource;

  constructor(
    private kv: KeyValueStore,
    readonly kind: RepositoryKind,
    private ns = kind === 'real' ? REAL_NAMESPACE : 'bp.sample.v2',
  ) {
    this.acceptedSource = kind === 'real' ? 'live' : 'demo';
  }

  private key(...parts: string[]) {
    return [this.ns, ...parts].join('.');
  }

  // ---------------------------------------------------------------- meta
  meta(): StoreMeta {
    return readJson<StoreMeta>(this.kv, this.key('meta')) ?? { schemaVersion: SCHEMA_VERSION, activeAthleteId: null };
  }

  hasMeta(): boolean {
    return this.kv.get(this.key('meta')) !== null;
  }

  writeMeta(meta: StoreMeta): boolean {
    return writeJson(this.kv, this.key('meta'), meta);
  }

  // ---------------------------------------------------------------- athletes
  athletes(): AthleteProfile[] {
    const list = readJson<AthleteProfile[]>(this.kv, this.key('athletes'));
    return Array.isArray(list) ? list.filter((a) => a && typeof a.id === 'string' && typeof a.name === 'string') : [];
  }

  athlete(id: string | null | undefined): AthleteProfile | null {
    return id ? (this.athletes().find((a) => a.id === id) ?? null) : null;
  }

  /** The active athlete, falling back to the first profile when the stored id is gone. */
  activeAthlete(): AthleteProfile | null {
    const list = this.athletes();
    return list.find((a) => a.id === this.meta().activeAthleteId) ?? list[0] ?? null;
  }

  setActive(id: string): boolean {
    if (!this.athlete(id)) return false;
    return this.writeMeta({ ...this.meta(), schemaVersion: SCHEMA_VERSION, activeAthleteId: id });
  }

  createAthlete(name: string, id = newId(this.kind === 'real' ? 'ath' : 'sample')): AthleteProfile {
    const clean = cleanName(name);
    if (!clean) throw new Error('Athlete name is required');
    const profile: AthleteProfile = { id, name: clean, createdAt: new Date().toISOString(), weeklyGoal: null, voiceCues: false };
    if (!writeJson(this.kv, this.key('athletes'), [...this.athletes(), profile])) throw new Error('Could not save the athlete profile');
    const active = this.meta().activeAthleteId;
    if (!active || !this.athlete(active)) this.setActive(profile.id);
    return profile;
  }

  updateAthlete(id: string, patch: Partial<Pick<AthleteProfile, 'name' | 'weeklyGoal' | 'voiceCues'>>): AthleteProfile | null {
    const list = this.athletes();
    const i = list.findIndex((a) => a.id === id);
    if (i < 0) return null;
    const next = { ...list[i], ...patch };
    if (patch.name !== undefined) {
      next.name = cleanName(patch.name);
      if (!next.name) return null;
    }
    if (patch.weeklyGoal !== undefined && patch.weeklyGoal !== null) next.weeklyGoal = Math.max(1, Math.min(7, Math.round(patch.weeklyGoal)));
    list[i] = next;
    return writeJson(this.kv, this.key('athletes'), list) ? next : null;
  }

  // ---------------------------------------------------------------- baselines (athlete × protocol)
  private baselineMap(athleteId: string): Record<string, StoredBaseline> {
    const m = readJson<Record<string, StoredBaseline>>(this.kv, this.key('baselines', athleteId));
    return m && typeof m === 'object' ? m : {};
  }

  baseline(athleteId: string, protocolId: string): StoredBaseline | null {
    const b = this.baselineMap(athleteId)[protocolId];
    return b && b.athleteId === athleteId && b.protocolId === protocolId && b.baseline?.features && b.baseline?.reference ? b : null;
  }

  saveBaseline(stored: StoredBaseline): boolean {
    if (!this.athlete(stored.athleteId)) return false;
    return writeJson(this.kv, this.key('baselines', stored.athleteId), { ...this.baselineMap(stored.athleteId), [stored.protocolId]: stored });
  }

  clearBaseline(athleteId: string, protocolId: string): void {
    const m = this.baselineMap(athleteId);
    if (!(protocolId in m)) return;
    delete m[protocolId];
    writeJson(this.kv, this.key('baselines', athleteId), m);
  }

  // ---------------------------------------------------------------- session history
  sessions(athleteId: string, protocolId?: string): SessionRecord[] {
    const list = readJson<SessionRecord[]>(this.kv, this.key('sessions', athleteId));
    if (!Array.isArray(list)) return [];
    return list
      .filter((s) => s && s.athleteId === athleteId && s.source === this.acceptedSource && (!protocolId || s.protocolId === protocolId))
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  /** Insert or replace a session. Refuses records from the wrong source or for unknown athletes. */
  saveSession(rec: SessionRecord): boolean {
    if (rec.source !== this.acceptedSource) return false;
    if (!this.athlete(rec.athleteId)) return false;
    const list = (readJson<SessionRecord[]>(this.kv, this.key('sessions', rec.athleteId)) ?? []).filter((s) => s.id !== rec.id);
    return writeJson(this.kv, this.key('sessions', rec.athleteId), [...list, rec]);
  }

  // ---------------------------------------------------------------- legacy (v1) baselines awaiting an owner
  legacy(): LegacyBaseline[] {
    const list = readJson<LegacyBaseline[]>(this.kv, this.key('legacy'));
    return Array.isArray(list) ? list : [];
  }

  writeLegacy(list: LegacyBaseline[]): boolean {
    return writeJson(this.kv, this.key('legacy'), list);
  }

  discardLegacy(id: string): void {
    this.writeLegacy(this.legacy().filter((l) => l.id !== id));
  }
}
