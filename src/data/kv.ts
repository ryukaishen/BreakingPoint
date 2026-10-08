// Key-value persistence used by the athlete data layer. The browser store wraps
// localStorage defensively (it can be missing, blocked, or full); the memory
// store backs tests and the synthetic sample athlete, which must never persist.

export interface KeyValueStore {
  get(key: string): string | null;
  /** Returns false when the value could not be stored (quota, blocked storage). */
  set(key: string, value: string): boolean;
  remove(key: string): void;
  keys(): string[];
}

export class MemoryStore implements KeyValueStore {
  private map = new Map<string, string>();

  constructor(seed?: Record<string, string>) {
    if (seed) for (const [k, v] of Object.entries(seed)) this.map.set(k, v);
  }

  get(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  set(key: string, value: string): boolean {
    this.map.set(key, value);
    return true;
  }

  remove(key: string): void {
    this.map.delete(key);
  }

  keys(): string[] {
    return [...this.map.keys()];
  }
}

/** localStorage when it works; otherwise an in-memory fallback so the app still runs (data then lasts one visit). */
export function browserStore(): KeyValueStore & { persistent: boolean } {
  try {
    const ls = window.localStorage;
    const probe = '__bp_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      persistent: true,
      get: (k) => {
        try {
          return ls.getItem(k);
        } catch {
          return null;
        }
      },
      set: (k, v) => {
        try {
          ls.setItem(k, v);
          return true;
        } catch {
          return false;
        }
      },
      remove: (k) => {
        try {
          ls.removeItem(k);
        } catch {
          /* ignore */
        }
      },
      keys: () => {
        try {
          return Array.from({ length: ls.length }, (_, i) => ls.key(i)).filter((k): k is string => k !== null);
        } catch {
          return [];
        }
      },
    };
  } catch {
    return Object.assign(new MemoryStore(), { persistent: false });
  }
}

export function readJson<T>(kv: KeyValueStore, key: string): T | null {
  const raw = kv.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(kv: KeyValueStore, key: string, value: unknown): boolean {
  return kv.set(key, JSON.stringify(value));
}
