import { useEffect, useRef, useState } from 'react';
import { announce, type Announcement } from '../session/announce';
import type { Snapshot } from '../session/engine';

/**
 * The session's only live regions, visually hidden. Mount once. Visual panels should
 * not set their own aria-live: a region that rewrites itself every rep is read out
 * every rep. Polite for progress, an alert only for the breaking point.
 */
export function SessionAnnouncer({ snap }: { snap: Snapshot }) {
  const prev = useRef<Snapshot | null>(null);
  const [msg, setMsg] = useState<Announcement>({ polite: null, assertive: null });

  useEffect(() => {
    const a = announce(prev.current, snap);
    const phaseChanged = prev.current !== null && prev.current.phase !== snap.phase;
    prev.current = snap;
    if (a.polite || a.assertive || phaseChanged) {
      // A stale stop message is cleared once the phase moves on.
      setMsg((m) => ({ polite: a.polite ?? m.polite, assertive: a.assertive ?? (phaseChanged ? null : m.assertive) }));
    }
  }, [snap]);

  return (
    <div className="visually-hidden">
      <div role="status" aria-live="polite" aria-atomic="true">
        {msg.polite}
      </div>
      <div role="alert" aria-atomic="true">
        {msg.assertive}
      </div>
    </div>
  );
}
