// Keeps the browser's history in step with the app's three views, and protects
// live work in progress from an accidental Back, refresh or close.
//
// What can and cannot be guaranteed:
//  - Back / Forward: fully intercepted. A protected Back is undone, the athlete is
//    asked, and the navigation is replayed only if they confirm.
//  - Refresh / close: `beforeunload` asks the browser to show its own prompt. Browsers
//    may ignore it (mobile browsers, no recent user interaction, crashes, tab discard),
//    so it is only a speed bump. The real safety net is `persist`, called whenever the
//    page is hidden or unloading, which writes a recoverable draft.
//
// The controller takes its window and handlers as arguments so it can be tested
// without a browser.

export type NavView = 'landing' | 'sport' | 'session';

interface Entry {
  view: NavView;
  /** Position in the history stack, so a multi-step jump can be undone exactly. */
  pos: number;
}

export interface HistoryLike {
  readonly state: unknown;
  pushState(data: unknown, unused: string, url?: string | null): void;
  replaceState(data: unknown, unused: string, url?: string | null): void;
  go(delta: number): void;
}

export interface GuardEnv {
  win: {
    readonly history: HistoryLike;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addEventListener(type: string, listener: (e: any) => void): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeEventListener(type: string, listener: (e: any) => void): void;
  };
  doc: {
    readonly visibilityState: string;
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
  };
}

export interface NavGuardHandlers {
  /** The view the app is showing right now. */
  getView(): NavView;
  /** Move the app to a view (only called for Back/Forward the guard allows). */
  setView(view: NavView): void;
  /** True while leaving would throw away live work: calibrating, monitoring or a recovery check in a live set. */
  isProtected(): boolean;
  /** Ask the athlete. `proceed` must be called only if they confirm. */
  requestLeave(proceed: () => void): void;
  /** Write recoverable state now. Called when the page is hidden or unloading. */
  persist(): void;
}

export interface NavGuard {
  /** Tell the guard the app moved to `view` (call after every view change). */
  sync(view: NavView): void;
  dispose(): void;
}

const VIEWS: readonly string[] = ['landing', 'sport', 'session'];

function parse(state: unknown): Entry | null {
  const bp = (state as { bp?: { view?: unknown; pos?: unknown } } | null)?.bp;
  if (!bp || typeof bp.view !== 'string' || !VIEWS.includes(bp.view)) return null;
  if (typeof bp.pos !== 'number' || !Number.isInteger(bp.pos) || bp.pos < 0) return null;
  return { view: bp.view as NavView, pos: bp.pos };
}

export function createNavGuard(env: GuardEnv, h: NavGuardHandlers): NavGuard {
  const { win, doc } = env;
  const hist = win.history;
  let view = h.getView();
  // After a reload the browser keeps the old entry's state: reuse its position, never its view
  // (a reloaded page cannot resume a session).
  let pos = parse(hist.state)?.pos ?? 0;
  hist.replaceState({ bp: { view, pos } }, '');

  /** The position we asked the browser to return to while the athlete decides. */
  let undoTo: number | null = null;
  /** Set once the athlete confirmed, so the replayed navigation is not blocked a second time. */
  let allowLeave = false;

  const onPopState = (e: { state: unknown }) => {
    const st = parse(e.state);
    if (!st) return; // an entry this app did not create: leave it to the browser
    if (undoTo !== null && st.pos === undoTo) {
      // Our own undo landed. Stay where we were.
      undoTo = null;
      pos = st.pos;
      return;
    }
    const from = pos;
    pos = st.pos;
    if (st.view === 'session' && view !== 'session') {
      // Forward onto a session that no longer exists: turn the dead entry into the current view.
      hist.replaceState({ bp: { view, pos } }, '');
      return;
    }
    if (st.view === view) return;
    if (h.isProtected() && !allowLeave) {
      const target = st.pos;
      undoTo = from;
      hist.go(from - target);
      h.requestLeave(() => {
        allowLeave = true;
        hist.go(target - from);
      });
      return;
    }
    allowLeave = false;
    h.setView(st.view);
  };

  const onBeforeUnload = (e: { preventDefault(): void; returnValue?: unknown }) => {
    if (!h.isProtected()) return;
    h.persist();
    e.preventDefault();
    e.returnValue = ''; // Chromium needs this to show its prompt
  };
  const onPageHide = () => h.persist();
  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') h.persist();
  };

  win.addEventListener('popstate', onPopState);
  win.addEventListener('beforeunload', onBeforeUnload);
  win.addEventListener('pagehide', onPageHide);
  doc.addEventListener('visibilitychange', onVisibility);

  return {
    sync(next) {
      if (next === view) return;
      const prev = view;
      view = next;
      const cur = parse(hist.state);
      if (cur && cur.view === next) {
        // Back or Forward already put the browser here.
        pos = cur.pos;
        return;
      }
      if (prev === 'session') {
        // A finished session is not a place to come back to: replace its entry instead of stacking on it.
        hist.replaceState({ bp: { view: next, pos } }, '');
      } else {
        pos += 1;
        hist.pushState({ bp: { view: next, pos } }, '');
      }
    },
    dispose() {
      win.removeEventListener('popstate', onPopState);
      win.removeEventListener('beforeunload', onBeforeUnload);
      win.removeEventListener('pagehide', onPageHide);
      doc.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
