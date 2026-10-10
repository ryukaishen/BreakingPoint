// Hands-free progression for live sessions, used only where the signals are
// reliable: the athlete in frame and standing still (start calibration), a
// locked baseline (start the set), and the athlete standing idle (end the set).
// Every automatic step shows a countdown first and can be done by hand instead.
// Starting the recovery check stays manual: only the athlete knows when they
// have rested enough.

import { useEffect, useRef, useState } from 'react';
import type { SessionEngine, Snapshot } from './engine';

export interface Countdown {
  kind: 'calibration' | 'monitoring' | 'end';
  label: string;
  seconds: number;
}

/** Hold still in frame this long before the calibration countdown starts. */
const READY_HOLD_MS = 2000;
const CALIBRATION_COUNTDOWN_MS = 3000;
const MONITORING_COUNTDOWN_MS = 5000;
/** After the warning, the set ends once the athlete has stood still this long. */
const END_AFTER_WARNING_MS = 3000;
/** Without a warning, a set ends after this long standing still (at least 3 reps done). */
const END_IDLE_MS = 8000;
const END_COUNTDOWN_MS = 2000;

export function useHandsFree(engine: SessionEngine, snap: Snapshot, active: boolean): Countdown | null {
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const [countdown, setCountdown] = useState<Countdown | null>(null);
  const t = useRef({ readySince: 0, deadline: 0, kind: null as Countdown['kind'] | null, reps: 0, lastRepAt: 0, phaseSince: 0, phase: snap.phase });

  useEffect(() => {
    if (!active) {
      setCountdown(null);
      return;
    }
    const tick = () => {
      const s = snapRef.current;
      const st = t.current;
      const now = Date.now();
      if (s.phase !== st.phase) {
        st.phase = s.phase;
        st.phaseSince = now;
        st.kind = null;
        st.readySince = 0;
        st.reps = s.monitorReps.length;
        st.lastRepAt = now;
      }
      let next: Countdown | null = null;
      const arm = (kind: Countdown['kind'], ms: number) => {
        if (st.kind !== kind) {
          st.kind = kind;
          st.deadline = now + ms;
        }
      };
      const disarm = () => {
        st.kind = null;
      };

      if (s.phase === 'idle') {
        const ready = s.live.present && s.live.quality >= 0.65 && s.live.calibrated && s.live.repPhase === 'standing';
        if (ready) {
          st.readySince ||= now;
          if (now - st.readySince >= READY_HOLD_MS) arm('calibration', CALIBRATION_COUNTDOWN_MS);
        } else {
          st.readySince = 0;
          disarm();
        }
        if (st.kind === 'calibration') {
          if (now >= st.deadline) {
            disarm();
            engine.startCalibration();
          } else next = { kind: 'calibration', label: 'Calibration starts in', seconds: Math.ceil((st.deadline - now) / 1000) };
        }
      } else if (s.phase === 'baseline') {
        arm('monitoring', MONITORING_COUNTDOWN_MS);
        if (now >= st.deadline) {
          disarm();
          engine.startMonitoring();
        } else next = { kind: 'monitoring', label: 'Your set starts in', seconds: Math.ceil((st.deadline - now) / 1000) };
      } else if (s.phase === 'monitoring') {
        if (s.monitorReps.length !== st.reps) {
          st.reps = s.monitorReps.length;
          st.lastRepAt = now;
          disarm();
        }
        const still = s.live.repPhase === 'standing';
        const idleFor = now - st.lastRepAt;
        const limit = s.alarmRep !== null ? END_AFTER_WARNING_MS : s.monitorReps.length >= 3 ? END_IDLE_MS : Infinity;
        if (still && idleFor >= limit - END_COUNTDOWN_MS) {
          arm('end', limit - idleFor);
          if (now >= st.deadline) {
            disarm();
            engine.endSet();
          } else next = { kind: 'end', label: 'Ending the set in', seconds: Math.ceil((st.deadline - now) / 1000) };
        } else disarm();
      } else disarm();

      setCountdown((c) => (c?.kind === next?.kind && c?.seconds === next?.seconds ? c : next));
    };
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [active, engine]);

  return active ? countdown : null;
}
