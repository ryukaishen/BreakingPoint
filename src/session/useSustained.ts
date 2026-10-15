import { useEffect, useState } from 'react';

/**
 * True once `flag` has held for `ms` without a break, false as soon as it drops. Used so one
 * dropped camera frame does not flash "Tracking lost" while the athlete is still in view.
 */
export function useSustained(flag: boolean, ms: number): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!flag) {
      setHeld(false);
      return;
    }
    const id = window.setTimeout(() => setHeld(true), ms);
    return () => window.clearTimeout(id);
  }, [flag, ms]);
  return flag && held;
}
