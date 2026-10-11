interface Props {
  /** Reps held at baseline so far in this set. */
  held: number;
  /** The athlete's best under comparable conditions, or null before their first counted set. */
  best: number | null;
  /** True after the warning: the line no longer moves and nothing is being chased. */
  frozen: boolean;
}

/**
 * The record line: how many reps you have held your usual form this set, against a
 * marker at your own best. It only grows while your form stays usual, so it can
 * never reward continuing after your form has changed.
 */
export function RecordLane({ held, best, frozen }: Props) {
  const scale = Math.max(8, held, best ?? 0) + 2;
  const fill = Math.min(1, held / scale);
  const mark = best !== null ? best / scale : null;
  const past = best !== null && held > best;
  return (
    <div className={`lane ${frozen ? 'frozen' : ''} ${past ? 'past' : ''}`}>
      <div className="lane-top">
        <span className="lane-label">Held your usual form</span>
        <span className="lane-value" aria-hidden>
          {held}
        </span>
      </div>
      <div
        className="lane-track"
        role="meter"
        aria-label="Reps held at your usual form"
        aria-valuemin={0}
        aria-valuemax={scale}
        aria-valuenow={held}
        aria-valuetext={`${held} rep${held === 1 ? '' : 's'} held${best !== null ? `, your best is ${best}` : ''}`}
      >
        <span className="lane-fill" style={{ transform: `scaleX(${fill})` }} />
        {mark !== null && <span className="lane-mark" style={{ left: `${mark * 100}%` }} />}
      </div>
      <div className="lane-foot">
        {frozen ? (
          <span>The record line counts only reps before your form started to change.</span>
        ) : best === null ? (
          <span>No record yet. This set draws your first line.</span>
        ) : past ? (
          <span>Past your best of {best}.</span>
        ) : (
          <span>Your best: {best}</span>
        )}
      </div>
    </div>
  );
}
