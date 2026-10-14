// The navigation guard against a fake browser. `go()` delivers popstate
// asynchronously (queued until flush), like real browsers, so the undo/replay
// logic is exercised under the awkward ordering it has to survive.
import { describe, expect, it, vi } from 'vitest';
import { createNavGuard, type GuardEnv, type HistoryLike, type NavGuardHandlers, type NavView } from '../src/session/navGuard';

type Listener = (e: unknown) => void;

class FakeBrowser {
  stack: { state: unknown }[] = [{ state: null }];
  idx = 0;
  private winL = new Map<string, Set<Listener>>();
  private docL = new Map<string, Set<Listener>>();
  private queue: number[] = [];
  visibility = 'visible';

  history: HistoryLike = {
    get state() {
      return undefined; // replaced below (needs `this`)
    },
    pushState: (s) => {
      this.stack.splice(this.idx + 1);
      this.stack.push({ state: s });
      this.idx += 1;
    },
    replaceState: (s) => {
      this.stack[this.idx].state = s;
    },
    go: (d) => {
      this.queue.push(d);
    },
  };

  constructor() {
    Object.defineProperty(this.history, 'state', { get: () => this.stack[this.idx].state });
  }

  env: GuardEnv = {
    win: {
      history: this.history,
      addEventListener: (t, l) => this.add(this.winL, t, l),
      removeEventListener: (t, l) => this.winL.get(t)?.delete(l),
    },
    doc: {
      get visibilityState() {
        return 'visible';
      },
      addEventListener: (t, l) => this.add(this.docL, t, l),
      removeEventListener: (t, l) => this.docL.get(t)?.delete(l),
    },
  };

  constructorDocPatch = (() => {
    const self = this;
    Object.defineProperty(this.env.doc, 'visibilityState', { get: () => self.visibility });
  })();

  private add(m: Map<string, Set<Listener>>, t: string, l: Listener) {
    if (!m.has(t)) m.set(t, new Set());
    m.get(t)!.add(l);
  }
  fireWin(type: string, e: unknown) {
    this.winL.get(type)?.forEach((l) => l(e));
  }
  fireDoc(type: string) {
    this.docL.get(type)?.forEach((l) => l(undefined));
  }
  listenerCount() {
    return [...this.winL.values(), ...this.docL.values()].reduce((n, s) => n + s.size, 0);
  }
  /** Deliver queued history traversals in order, including ones queued by handlers. */
  flush() {
    while (this.queue.length) {
      const d = this.queue.shift()!;
      const next = Math.max(0, Math.min(this.stack.length - 1, this.idx + d));
      if (next === this.idx) continue;
      this.idx = next;
      this.fireWin('popstate', { state: this.stack[this.idx].state });
    }
  }
  back() {
    this.history.go(-1);
    this.flush();
  }
  forward() {
    this.history.go(1);
    this.flush();
  }
  topView() {
    return (this.stack[this.idx].state as { bp: { view: NavView } } | null)?.bp.view;
  }
}

/** A tiny app: owns `view`, tells the guard about changes the way App's effect does. */
function setup(initial: NavView = 'landing') {
  const b = new FakeBrowser();
  const app = { view: initial, protectedNow: false };
  const pending: { proceed: () => void }[] = [];
  const persist = vi.fn();
  let guard: ReturnType<typeof createNavGuard>;
  const handlers: NavGuardHandlers = {
    getView: () => app.view,
    setView: (v) => {
      app.view = v;
      guard.sync(v); // React effect after the state change
    },
    isProtected: () => app.protectedNow,
    requestLeave: (proceed) => pending.push({ proceed }),
    persist,
  };
  guard = createNavGuard(b.env, handlers);
  const go = (v: NavView) => {
    app.view = v;
    guard.sync(v);
  };
  return { b, app, guard, go, pending, persist };
}

describe('navigation guard: history', () => {
  it('claims the first entry as the landing view', () => {
    const { b } = setup();
    expect(b.stack[0].state).toEqual({ bp: { view: 'landing', pos: 0 } });
  });

  it('after a reload reuses the entry position but never a stale session view', () => {
    const b = new FakeBrowser();
    b.stack = [{ state: null }, { state: { bp: { view: 'sport', pos: 1 } } }, { state: { bp: { view: 'session', pos: 2 } } }];
    b.idx = 2;
    createNavGuard(b.env, { getView: () => 'landing', setView: () => {}, isProtected: () => false, requestLeave: () => {}, persist: () => {} });
    expect(b.stack[2].state).toEqual({ bp: { view: 'landing', pos: 2 } });
  });

  it('pushes one entry per forward navigation', () => {
    const { b, go } = setup();
    go('sport');
    go('session');
    expect(b.stack.length).toBe(3);
    expect(b.idx).toBe(2);
    expect(b.topView()).toBe('session');
  });

  it('Back from an unprotected session returns to the previous view without asking', () => {
    const { b, app, go, pending } = setup();
    go('sport');
    go('session');
    b.back();
    expect(app.view).toBe('sport');
    expect(pending).toHaveLength(0);
    expect(b.stack.length).toBe(3); // history unchanged, no new push when the view follows the browser
    expect(b.idx).toBe(1);
  });

  it('Status and Athletes are history entries that Back and Forward move between', () => {
    const { b, app, go, pending } = setup();
    go('athletes');
    go('status');
    b.back();
    b.flush();
    expect(app.view).toBe('athletes');
    b.back();
    b.flush();
    expect(app.view).toBe('landing');
    b.forward();
    b.flush();
    expect(app.view).toBe('athletes');
    expect(pending).toHaveLength(0);
  });

  it('Back from a protected session to the Athletes page asks first', () => {
    const { b, app, go, pending } = setup();
    go('athletes');
    go('session');
    app.protectedNow = true;
    b.back();
    b.flush();
    expect(app.view).toBe('session');
    expect(pending).toHaveLength(1);
    app.protectedNow = false;
    pending[0].proceed();
    b.flush();
    expect(app.view).toBe('athletes');
  });

  it('leaving the session through the app replaces its entry instead of stacking', () => {
    const { b, go } = setup();
    go('sport');
    go('session');
    go('landing');
    expect(b.stack.length).toBe(3);
    expect(b.topView()).toBe('landing');
  });

  it('Forward onto a session that no longer exists is turned into the current view', () => {
    const { b, app, go } = setup();
    go('sport');
    go('session');
    b.back(); // session -> sport
    b.forward(); // onto the dead session entry
    expect(app.view).toBe('sport');
    expect(b.topView()).toBe('sport');
  });

  it('ignores history entries it did not create', () => {
    const { b, app } = setup();
    b.stack.push({ state: null });
    b.history.go(1);
    b.flush();
    expect(app.view).toBe('landing');
  });
});

describe('navigation guard: protected Back', () => {
  function inLiveSet() {
    const s = setup();
    s.go('sport');
    s.go('session');
    s.app.protectedNow = true;
    return s;
  }

  it('undoes the Back, asks, and stays in the session until confirmed', () => {
    const s = inLiveSet();
    s.b.back();
    expect(s.pending).toHaveLength(1);
    expect(s.app.view).toBe('session');
    expect(s.b.idx).toBe(2); // returned to the session entry
    expect(s.b.topView()).toBe('session');
  });

  it('cancelling leaves everything as it was', () => {
    const s = inLiveSet();
    s.b.back();
    s.pending.length = 0; // dialog dismissed, proceed never called
    s.b.flush();
    expect(s.app.view).toBe('session');
    expect(s.b.idx).toBe(2);
  });

  it('confirming replays the navigation exactly once', () => {
    const s = inLiveSet();
    s.b.back();
    s.app.protectedNow = false; // App ends the set while confirming
    s.pending[0].proceed();
    s.b.flush();
    expect(s.app.view).toBe('sport');
    expect(s.b.idx).toBe(1);
    expect(s.pending).toHaveLength(1); // no second prompt
  });

  it('confirming still works if React has not yet cleared the protection', () => {
    const s = inLiveSet();
    s.b.back();
    s.pending[0].proceed(); // protectedNow is still true here
    s.b.flush();
    expect(s.app.view).toBe('sport');
    expect(s.pending).toHaveLength(1);
  });

  it('a multi-step jump is undone to the exact entry and replayed to the exact target', () => {
    const s = inLiveSet();
    s.b.history.go(-2);
    s.b.flush();
    expect(s.app.view).toBe('session');
    expect(s.b.idx).toBe(2);
    s.app.protectedNow = false;
    s.pending[0].proceed();
    s.b.flush();
    expect(s.app.view).toBe('landing');
    expect(s.b.idx).toBe(0);
  });

  it('pressing Back twice while the dialog is open keeps one coherent state', () => {
    const s = inLiveSet();
    s.b.back();
    s.b.back();
    expect(s.app.view).toBe('session');
    expect(s.b.idx).toBe(2);
    expect(s.pending.length).toBeGreaterThanOrEqual(1);
  });

  it('is not protected after the set is over', () => {
    const s = inLiveSet();
    s.app.protectedNow = false;
    s.b.back();
    expect(s.pending).toHaveLength(0);
    expect(s.app.view).toBe('sport');
  });
});

describe('navigation guard: unload and hide', () => {
  it('does not interfere with leaving when nothing is at risk', () => {
    const s = setup();
    const e = { preventDefault: vi.fn(), returnValue: undefined as unknown };
    s.b.fireWin('beforeunload', e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(s.persist).not.toHaveBeenCalled();
  });

  it('asks the browser to confirm, and saves a draft, while a live set is in progress', () => {
    const s = setup();
    s.app.protectedNow = true;
    const e = { preventDefault: vi.fn(), returnValue: undefined as unknown };
    s.b.fireWin('beforeunload', e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.returnValue).toBe('');
    expect(s.persist).toHaveBeenCalledTimes(1);
  });

  it('persists on pagehide and when the page becomes hidden, not when it becomes visible', () => {
    const s = setup();
    s.b.fireWin('pagehide', {});
    expect(s.persist).toHaveBeenCalledTimes(1);
    s.b.visibility = 'hidden';
    s.b.fireDoc('visibilitychange');
    expect(s.persist).toHaveBeenCalledTimes(2);
    s.b.visibility = 'visible';
    s.b.fireDoc('visibilitychange');
    expect(s.persist).toHaveBeenCalledTimes(2);
  });

  it('dispose removes every listener', () => {
    const s = setup();
    expect(s.b.listenerCount()).toBe(4);
    s.guard.dispose();
    expect(s.b.listenerCount()).toBe(0);
  });
});
