import { useEffect, useState, type ReactNode } from 'react';
import { recoveryModel, type RecoveryInput } from '../../session/postWorkout';

interface Props {
  input: Omit<RecoveryInput, 'restSeconds'>;
  /** When the set ended (ms), for the rest timer; null for a stored set. */
  restSince: number | null;
  /** "Original baseline / Repeated CMJ". */
  code: string;
  /** Live checks: what the camera sees, and any problem with it. */
  capture?: { label: string; problem: string | null } | null;
  /** Buttons for the current state. */
  actions?: (state: ReturnType<typeof recoveryModel>['state']) => ReactNode;
}

/**
 * Make's recovery screen: the diamond with the reading, the three rep nodes, and the command panel
 * with the per-rep recovery scores. Every value comes from the engine or the stored set.
 */
export function RecoveryPanel({ input, restSince, code, capture, actions }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const resting = input.set.origin === 'session' && input.phase === 'summary' && input.set.alertRep !== null && !input.set.recovery;
  useEffect(() => {
    if (!resting) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [resting]);
  const m = recoveryModel({ ...input, restSeconds: restSince ? Math.max(0, (now - restSince) / 1000) : 0 });
  const showScores = m.state === 'active' || m.state === 'insufficient' || m.state === 'recovered' || m.state === 'partial' || m.state === 'persistent';

  return (
    <div className={`recovery-system recovery-${m.state}`}>
      <section className={`recovery-visual ${capture ? (capture.problem ? 'has-capture has-capture-problem' : 'has-capture') : ''}`} aria-label="Recovery status">
        {capture && (
          // What the camera sees, at the top of the visual (in view on a phone too), like the workout's HUD.
          <p className={`recovery-capture ${capture.problem ? 'has-problem' : ''}`} role="note">
            <span>Capture</span>
            <strong>{capture.problem ?? capture.label}</strong>
          </p>
        )}
        <div className="recovery-orbit recovery-orbit-a" aria-hidden="true" />
        <div className="recovery-orbit recovery-orbit-b" aria-hidden="true" />
        <div className="recovery-core">
          {/* One stack turned upright as a whole, so all three lines share the diamond's vertical axis. */}
          <div className="recovery-core-text">
            <span>Recovery status</span>
            <strong>{m.value}</strong>
            <small>{m.valueLabel}</small>
          </div>
        </div>
        <div className="recovery-rep-nodes" aria-hidden="true">
          {m.nodes.map((n) => (
            <i key={n.index} className={n.done ? 'is-complete' : ''}>
              {n.index}
            </i>
          ))}
        </div>
      </section>
      <aside className="recovery-command">
        <span className="threshold-code">{code}</span>
        <h3 className="recovery-title">{m.title}</h3>
        <p>{m.instruction}</p>
        {showScores && (
          <div className="recovery-score-preview">
            <span>Recovery scores / against your usual form</span>
            {m.scores.map((s) => (
              <div key={s.index}>
                <span>Rep {s.index}</span>
                <i className={s.done && s.score !== null ? 'is-visible' : ''} />
                <strong>{!s.done ? '—' : s.score === null ? 'Not scored' : s.score.toFixed(2)}</strong>
              </div>
            ))}
          </div>
        )}
        {m.note && <p className="recovery-note">{m.note}</p>}
        <div className="recovery-actions">{actions?.(m.state)}</div>
      </aside>
    </div>
  );
}
