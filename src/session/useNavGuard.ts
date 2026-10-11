import { useEffect, useRef } from 'react';
import { createNavGuard, type NavGuard, type NavView } from './navGuard';

interface Args {
  view: NavView;
  setView: (view: NavView) => void;
  /** True while leaving would throw away live work. */
  isProtected: boolean;
  /** Ask the athlete (and end the set if they agree) before `proceed` runs. */
  requestLeave: (proceed: () => void) => void;
  /** Write a recovery draft now. */
  persist: () => void;
}

/** Wires the browser Back/Forward/refresh/close protection (see navGuard.ts) to the app's view state. */
export function useNavGuard(a: Args): void {
  const latest = useRef(a);
  latest.current = a;
  const guard = useRef<NavGuard | null>(null);

  useEffect(() => {
    const g = createNavGuard(
      { win: window, doc: document },
      {
        getView: () => latest.current.view,
        setView: (v) => latest.current.setView(v),
        isProtected: () => latest.current.isProtected,
        requestLeave: (proceed) => latest.current.requestLeave(proceed),
        persist: () => latest.current.persist(),
      },
    );
    guard.current = g;
    return () => {
      g.dispose();
      guard.current = null;
    };
  }, []);

  useEffect(() => {
    guard.current?.sync(a.view);
  }, [a.view]);
}
