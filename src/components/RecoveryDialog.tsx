import { heldReps } from '../data/progress';
import type { SetDraft } from '../data/draft';
import { resolveLaunch } from '../protocols/launch';
import { useDialog } from '../utils/hooks';

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
  const keepRef = useDialog<HTMLButtonElement>(() => {});
  const r = draft.record;
  const ctx = resolveLaunch(r.sportId, r.protocolId, r.subSportId);
  const what = ctx ? `${ctx.contextName}, ${ctx.title}` : 'a live set';
  const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(draft.savedAt));
  const held = heldReps(r.reps.map((x) => ({ step: x.state ? { state: x.state } : null })));
  return (
    <div className="modal-backdrop">
      <div className="confirm sys-window" role="alertdialog" aria-modal="true" aria-labelledby="recovery-title" aria-describedby="recovery-body">
        <h2 id="recovery-title">A set was interrupted</h2>
        <div id="recovery-body" className="confirm-body">
          <p>
            {athleteName}’s set ({what}) stopped when the page was closed or reloaded on {when}. {r.totalReps} rep{r.totalReps === 1 ? '' : 's'} had been measured, {held} at
            your usual form.
          </p>
          <p>You can keep it in your history. Because it never finished, it will not count toward records or comparisons.</p>
        </div>
        <div className="confirm-actions">
          <button className="btn danger" onClick={onDiscard}>
            Discard set
          </button>
          <button className="btn primary" ref={keepRef} onClick={onKeep}>
            Keep interrupted set
          </button>
        </div>
      </div>
    </div>
  );
}
