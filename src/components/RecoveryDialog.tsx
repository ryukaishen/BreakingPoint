import { useRef } from 'react';
import { storedHeldReps } from '../data/progress';
import type { SetDraft } from '../data/draft';
import { resolveLaunch } from '../protocols/launch';
import { SystemNotification } from './system/SystemNotification';

interface Props {
  athleteName: string;
  draft: SetDraft;
  onKeep: () => void;
  onDiscard: () => void;
  /** Shown when the dialog was opened by trying to start another set: closes it and keeps the set waiting. */
  onLater?: () => void;
  /** Storage could not keep a copy: the set exists only in this page's memory. */
  heldInMemory?: boolean;
}

/**
 * A live set that is not in the history yet. Either it finished but storage refused it (an ended draft),
 * or it was cut off before it ended (a refresh, crash or closed tab) and only its last checkpoint is known.
 * Both choices are explicit: there is no click-away or Escape, so a decision can never be made by
 * accident. Focus starts on the choice that loses nothing.
 */
export function RecoveryDialog({ athleteName, draft, onKeep, onDiscard, onLater, heldInMemory = false }: Props) {
  const keepRef = useRef<HTMLButtonElement>(null);
  const r = draft.record;
  const ctx = resolveLaunch(r.sportId, r.protocolId, r.subSportId);
  const what = ctx ? `${ctx.contextName}, ${ctx.title}` : 'a live set';
  const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(draft.savedAt));
  const held = storedHeldReps(r.reps);
  const reps = `${r.totalReps} rep${r.totalReps === 1 ? '' : 's'}`;
  const ended = draft.ended === true;
  return (
    <SystemNotification
      tone="attention"
      role="alertdialog"
      bar={ended ? 'Unsaved set' : 'Interrupted set'}
      code={heldInMemory ? 'Live set / held until this page closes' : 'Live set / saved on this device'}
      titleId="recovery-title"
      title={ended ? 'A set was not saved' : 'A set was interrupted'}
      bodyId="recovery-body"
      initialFocus={keepRef}
      actions={
        <>
          {onLater && (
            <button type="button" className="threshold-action notification-btn" onClick={onLater}>
              Not now
            </button>
          )}
          <button type="button" className="threshold-action notification-btn is-danger" onClick={onDiscard}>
            Discard set
          </button>
          <button type="button" className="threshold-action notification-btn is-primary" ref={keepRef} onClick={onKeep}>
            {ended ? 'Save set' : 'Keep interrupted set'}
          </button>
        </>
      }
    >
      {ended ? (
        <>
          <p>
            {athleteName}’s set ({what}) finished on {when}, but browser storage was full or unavailable, so it was not added to the history. {reps}{' '}
            {r.totalReps === 1 ? 'was' : 'were'} measured, {held} at your usual form.
          </p>
          <p>
            Save it to add it to your history as it finished, or discard it. Another set for {athleteName} can start once it is saved or discarded.
            {heldInMemory && ' Browser storage could not keep a copy either, so it is held only until this page closes or reloads.'}
          </p>
        </>
      ) : (
        <>
          <p>
            {athleteName}’s set ({what}) was cut off before it ended, most likely because the page closed or reloaded. Its last checkpoint, on {when}, had{' '}
            {reps} measured, {held} at your usual form.
          </p>
          <p>You can keep it in your history up to that checkpoint. Because it was cut off, it will not count toward records or comparisons.</p>
        </>
      )}
    </SystemNotification>
  );
}
