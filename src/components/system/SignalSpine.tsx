import type { Snapshot } from '../../session/engine';
import { currentStage, stageTrack, type StageStatus } from './stageTrack';

const SPOKEN: Record<StageStatus, string> = {
  pending: '',
  current: ' (current)',
  done: ' (complete)',
  warning: ' (form changing)',
  alert: ' (alert)',
};

/**
 * The session stage track, Calibrate → Monitor → Detect → Recover, in the Figma Make
 * System Threshold style (Make's stage track under the phone camera). It heads the session
 * panel: beside the camera on wide screens, under it on narrow ones. Read-only: every stage
 * comes from the engine snapshot.
 */
export function SignalSpine({ snapshot }: { snapshot: Snapshot }) {
  const stages = stageTrack(snapshot);
  const now = currentStage(stages);
  return (
    <ol className="signal-spine" aria-label="Session progress">
      {stages.map((st, i) => (
        <li key={st.id} className={`signal-spine__stage is-${st.status}`} aria-current={st.id === now ? 'step' : undefined}>
          {i > 0 && <span className="signal-spine__link" aria-hidden="true" />}
          <span className="signal-spine__label">{st.label}</span>
          {st.count && <span className="signal-spine__count">{st.count}</span>}
          {SPOKEN[st.status] && <span className="visually-hidden">{SPOKEN[st.status]}</span>}
        </li>
      ))}
    </ol>
  );
}
