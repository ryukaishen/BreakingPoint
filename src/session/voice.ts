// Optional spoken cues for an athlete who is several metres from the screen.
// Uses the browser's built-in speech synthesis (no dependency, no network).
// Cues fire on stage changes and warnings only, never on every rep.

import { useEffect, useRef } from 'react';
import type { Snapshot } from './engine';
import { RECOVERY_REPS } from './engine';

export const voiceAvailable = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

function speak(text: string, interrupt: boolean) {
  if (!voiceAvailable()) return;
  const synth = window.speechSynthesis;
  if (interrupt) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.02;
  synth.speak(u);
}

/** Speak a short cue when the session changes stage. Safety cues interrupt anything already speaking. */
export function useVoiceCues(snap: Snapshot, enabled: boolean) {
  const prev = useRef({ phase: snap.phase, state: snap.state, alarm: snap.alarmRep, event: snap.event?.id ?? 0 });

  useEffect(() => {
    const p = prev.current;
    prev.current = { phase: snap.phase, state: snap.state, alarm: snap.alarmRep, event: snap.event?.id ?? 0 };
    if (!enabled) return;
    if (snap.alarmRep !== null && p.alarm === null) return speak('Stop. End the set and rest.', true);
    if (snap.phase !== p.phase) {
      switch (snap.phase) {
        case 'calibrating':
          return speak(`Calibration. ${snap.calibrationTarget} controlled reps at your normal tempo.`, false);
        case 'baseline':
          return speak('Baseline locked.', false);
        case 'monitoring':
          return speak('Set started.', false);
        case 'summary':
          return speak(snap.alarmRep !== null ? 'Set saved. Rest, then run the recovery check.' : 'Set complete.', false);
        case 'recovery':
          return speak(`Recovery check. ${RECOVERY_REPS} controlled reps.`, false);
        case 'recoveryDone': {
          const s = snap.recovery?.status;
          return speak(
            `Recovery check complete. ${s === 'recovered' ? 'Back to your usual form.' : s === 'partial' ? 'Partly back to your usual form.' : 'Still different from your usual form.'}`,
            false,
          );
        }
        default:
          return;
      }
    }
    if (snap.phase === 'monitoring' && snap.state === 'DRIFT' && p.state === 'STABLE') speak('Form changing. Be ready to stop.', false);
  }, [snap.phase, snap.state, snap.alarmRep, snap.event, snap.calibrationTarget, snap.recovery, enabled]);

  useEffect(() => () => {
    if (voiceAvailable()) window.speechSynthesis.cancel();
  }, []);
}
