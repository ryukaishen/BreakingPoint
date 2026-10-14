import { useRef } from 'react';
import { heldReps } from '../data/progress';
import type { SetDraft } from '../data/draft';
import { resolveLaunch } from '../protocols/launch';
import { SystemNotification } from './system/SystemNotification';

interface Props {
  athleteName: string;
  draft: SetDraft;
  onKeep: () => void;
  onDiscard: () => void;
}

/**
 * Offered once after a live set was cut off (refresh, crash, closed tab). Both choices are explicit:
 * there is no click-away or Escape, so a decision can never be made by accident. Focus starts on
 * the choice that loses nothing.
 */
export function RecoveryDialog({ athleteName, draft, onKeep, onDiscard }: Props) {
  const keepRef = useRef<HTMLButtonElement>(null);
  const r = draft.record;
  const ctx = resolveLaunch(r.sportId, r.protocolId, r.subSportId);
  const what = ctx ? `${ctx.contextName}, ${ctx.title}` : 'a live set';
  const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(draft.savedAt));
  const held = heldReps(r.reps.map((x) => ({ step: x.state ? { state: x.state } : null })));
  return (
    <SystemNotification
      tone="attention"
      role="alertdialog"
      bar="Interrupted set"
      code="Live set / saved on this device"
      titleId="recovery-title"
      title="A set was interrupted"
      bodyId="recovery-body"
      initialFocus={keepRef}
      actions={
        <>
          <button type="button" className="threshold-action notification-btn is-danger" onClick={onDiscard}>
            Discard set
          </button>
          <button type="button" className="threshold-action notification-btn is-primary" ref={keepRef} onClick={onKeep}>
            Keep interrupted set
          </button>
        </>
      }
    >
      <p>
        {athleteName}’s set ({what}) stopped when the page was closed or reloaded on {when}. {r.totalReps} rep{r.totalReps === 1 ? '' : 's'} had been measured, {held} at
        your usual form.
      </p>
      <p>You can keep it in your history. Because it never finished, it will not count toward records or comparisons.</p>
    </SystemNotification>
  );
}
