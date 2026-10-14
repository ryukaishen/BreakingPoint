// What a screen reader should hear as a session moves along.
//
// Quiet by default: nothing is announced per rep or per frame, because a live
// region that rewrites itself every rep turns a calm workout into a stream of
// interruptions. Only phase changes and the first drift are spoken politely.
// The breaking point is the single assertive message, because it is the one
// instruction that must interrupt: stop and rest.

import { heldReps } from '../data/progress';
import { RECOVERY_REPS, type Snapshot } from './engine';

export interface Announcement {
  polite: string | null;
  /** Reserved for the breaking point. */
  assertive: string | null;
}

const NONE: Announcement = { polite: null, assertive: null };
const polite = (text: string): Announcement => ({ polite: text, assertive: null });

function phaseMessage(next: Snapshot): string | null {
  switch (next.phase) {
    case 'calibrating':
      return `Calibration started. Perform ${next.calibrationTarget} controlled reps at your normal tempo.`;
    case 'baseline':
      return 'Baseline locked.';
    case 'monitoring':
      return 'Set started.';
    case 'summary': {
      if (next.alarmRep !== null) return `Set ended. The alert triggered at rep ${next.alarmRep}. Rest, then run the recovery check.`;
      const held = heldReps(next.monitorReps);
      return `Set ended. ${next.monitorReps.length} reps, ${held} at your usual form.`;
    }
    case 'recovery':
      return `Recovery check started. Perform ${RECOVERY_REPS} controlled reps.`;
    case 'recoveryDone':
      return next.recovery ? `Recovery check complete. ${Math.round(next.recovery.percent * 100)} percent of the change has gone.` : 'Recovery check complete.';
    default:
      return null;
  }
}

export function announce(prev: Snapshot | null, next: Snapshot): Announcement {
  if (!prev || prev === next) return NONE;

  const phase = prev.phase !== next.phase ? phaseMessage(next) : null;

  // The alert and the end of the set can reach the screen in the same update (the snapshot moved on
  // twice between renders). Both are said then: the stop instruction assertively, the summary politely.
  if (prev.alarmRep === null && next.alarmRep !== null) {
    return { polite: phase, assertive: `Stop. The alert triggered at rep ${next.alarmRep}. End the set and rest.` };
  }

  if (prev.phase !== next.phase) return phase === null ? NONE : polite(phase);

  if (next.phase === 'monitoring' && prev.state === 'STABLE' && next.state === 'DRIFT') {
    return polite('Your form is starting to change. Be ready to stop.');
  }
  return NONE;
}
