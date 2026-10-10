import { useEffect, useState, type RefObject } from 'react';

/**
 * True while an element actually overflows sideways. A scroll region that only a mouse or
 * finger can move is out of reach for keyboard users, so callers give it tabIndex 0, a role
 * and a label exactly when this is true, and leave it out of the tab order otherwise.
 */
export function useScrollable(ref: RefObject<HTMLElement>): boolean {
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScrollable(el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  });
  return scrollable;
}
