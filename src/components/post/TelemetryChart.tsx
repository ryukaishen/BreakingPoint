import type { CSSProperties } from 'react';
import type { ChartModel } from '../../session/postWorkout';

interface Props {
  model: ChartModel;
  /** Shown under the chart when the warning and alert levels cannot be drawn. */
  levelsNote?: string | null;
  /** Shown under the chart with the levels: how the alert relates to the alert level. */
  levelsRule?: string | null;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Make's rep-by-rep telemetry: one bar per monitored rep, scaled to the set's Form Change Scores,
 * with the detector's warning and alert levels drawn where they really are. Bars from the estimated
 * onset are amber and from the alert red. A rep that could not be scored shows as an empty slot.
 * The level key and the onset and alert markers sit above the plot, so real levels that lie close
 * together never stack their labels on the bars.
 */
export function TelemetryChart({ model, levelsNote, levelsRule }: Props) {
  const n = model.bars.length;
  const columns = { '--telemetry-columns': Math.max(n, 1) } as CSSProperties;
  const top = model.bars.reduce((m, b) => (b.score !== null && b.score > m ? b.score : m), 0);
  const description = n
    ? `Form Change Score for each of ${n} reps, highest ${top.toFixed(2)}.${model.onsetRep !== null ? ` Change began around rep ${model.onsetRep}.` : ''}${model.alertRep !== null ? ` Alert at rep ${model.alertRep}.` : ' No alert.'}`
    : 'No monitored reps.';
  const levels = model.warningAt !== null && model.alertAt !== null;
  return (
    <figure className="post-telemetry">
      <figcaption className="visually-hidden">{description}</figcaption>
      <div className="post-chart-key" aria-hidden="true">
        {levels && (
          <span className="post-chart-legend">
            <span className="is-usual">Usual range</span>
            <span className="is-warning">Warning level</span>
            <span className="is-alert">Alert level</span>
          </span>
        )}
        {(model.onsetRep !== null || model.alertRep !== null) && (
          <span className="post-chart-markers">
            {model.onsetRep !== null && <span className="is-onset">Change began around rep {model.onsetRep}</span>}
            {model.alertRep !== null && <span className="is-alert">Alert at rep {model.alertRep}</span>}
          </span>
        )}
      </div>
      <div className={`post-telemetry-chart ${n > 14 ? 'is-dense' : ''}`} aria-hidden="true">
        <div className="post-chart-plot">
          {levels && (
            <>
              <span className="post-chart-usual" style={{ height: `${model.warningAt! * 100}%` }} />
              <span className="post-chart-level is-warning" style={{ bottom: `${model.warningAt! * 100}%` }} />
              <span className="post-chart-level is-alert" style={{ bottom: `${model.alertAt! * 100}%` }} />
            </>
          )}
          <div className="post-chart-bars" style={columns}>
            {model.bars.map((b) => (
              <i
                key={b.index}
                className={b.tone === 'alert' ? 'is-alert' : b.tone === 'changing' ? 'is-changing' : b.tone === 'unscored' ? 'is-unscored' : ''}
                style={{ '--telemetry-height': `${b.height * 100}%` } as CSSProperties}
              >
                <span>{b.score !== null ? b.score.toFixed(2) : '—'}</span>
              </i>
            ))}
          </div>
        </div>
        <div className="post-chart-axis" style={columns}>
          {model.bars.map((b) => (
            <span key={b.index}>{pad2(b.index)}</span>
          ))}
        </div>
      </div>
      <ol className="visually-hidden">
        {model.bars.map((b) => (
          <li key={b.index}>
            Rep {b.index}: {b.score !== null ? b.score.toFixed(2) : 'not scored'}
          </li>
        ))}
      </ol>
      {levels && levelsRule && <p className="post-chart-note">{levelsRule}</p>}
      {levelsNote && <p className="post-chart-note">{levelsNote}</p>}
    </figure>
  );
}
