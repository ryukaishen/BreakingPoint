import { Pause, Play, Skip } from '../Icons';

interface Props {
  speed: number;
  paused: boolean;
  onSpeed: (s: number) => void;
  onPause: () => void;
  onSkip: () => void;
}

/** Presenter controls for the synthetic demo: pause, playback speed and skip (also Space, 1, 2, 4 and S). */
export function DemoControls(p: Props) {
  return (
    <div className="speed-ctl workout-demo-controls" role="group" aria-label="Demo controls">
      <span className="workout-demo-label">Demo playback</span>
      <button className="threshold-action" onClick={p.onPause} title="Pause / resume (Space)" aria-label={p.paused ? 'Resume demo' : 'Pause demo'}>
        {p.paused ? <Play size={14} /> : <Pause size={14} />}
      </button>
      <div className="seg" role="group" aria-label="Demo speed">
        {[1, 2, 4].map((v) => (
          <button key={v} className={`threshold-action ${p.speed === v ? 'active' : ''}`} aria-pressed={p.speed === v} onClick={() => p.onSpeed(v)}>
            {v}×
          </button>
        ))}
      </div>
      <button className="threshold-action" onClick={p.onSkip} title="Skip to the end of this stage (S)">
        <Skip size={14} /> Skip
      </button>
    </div>
  );
}
