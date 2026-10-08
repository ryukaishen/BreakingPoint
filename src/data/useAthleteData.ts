import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { browserStore } from './kv';
import { migrateV1, type MigrationReport } from './migrate';
import { AthleteRepository } from './repository';
import { createSampleRepository } from './sample';
import type { AthleteProfile } from './types';

/** Whose data the app is showing: the athletes on this device, or the synthetic sample athlete. */
export type DataScope = 'real' | 'sample';

export interface AthleteData {
  scope: DataScope;
  setScope: (s: DataScope) => void;
  /** Repository for the current scope. */
  repo: AthleteRepository;
  /** The device's real athletes (always available, even while exploring the sample). */
  real: AthleteRepository;
  athlete: AthleteProfile | null;
  /** False when browser storage is unavailable: data then lasts only this visit. */
  persistent: boolean;
  migration: MigrationReport;
  /** Bumps after every write so views re-read derived data. */
  version: number;
  refresh: () => void;
}

export function useAthleteData(): AthleteData {
  const init = useMemo(() => {
    const kv = browserStore();
    const real = new AthleteRepository(kv, 'real');
    const migration = migrateV1(kv, real);
    return { real, migration, persistent: kv.persistent };
  }, []);
  const sampleRef = useRef<AthleteRepository | null>(null);
  const [scope, setScopeState] = useState<DataScope>('real');
  const [version, refresh] = useReducer((x: number) => x + 1, 0);

  const setScope = useCallback((s: DataScope) => {
    // The sample is rebuilt on each visit: nothing done while exploring it carries over.
    if (s === 'sample' && !sampleRef.current) sampleRef.current = createSampleRepository();
    if (s === 'real') sampleRef.current = null;
    setScopeState(s);
    refresh();
  }, []);

  const repo = scope === 'sample' ? (sampleRef.current ??= createSampleRepository()) : init.real;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const athlete = useMemo(() => repo.activeAthlete(), [repo, version]);

  return { scope, setScope, repo, real: init.real, athlete, persistent: init.persistent, migration: init.migration, version, refresh };
}
