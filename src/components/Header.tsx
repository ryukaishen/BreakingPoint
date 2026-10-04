import type { ExerciseType } from '../biomechanics/catalog';
import type { Snapshot } from '../session/engine';
import { Book, Flask, LogoMark, Reset } from './Icons';

interface Props {
  view: 'landing' | 'session';
  snap: Snapshot | null;
  mode: 'demo' | 'live';
  exercise: ExerciseType;
  athlete: string;
  onHome: () => void;
  onExercise: (e: ExerciseType) => void;
  onAthlete: (name: string) => void;
  onResearch: () => void;
  onLab: () => void;
  onResetBaseline: () => void;
}

function Stepper({ snap }: { snap: Snapshot }) {
  const p = snap.phase;
  const hasBaseline = !!snap.baseline;
  const steps = [
    { n: 1, label: 'Calibrate', active: p === 'idle' || p === 'calibrating', done: hasBaseline },
    { n: 2, label: 'Monitor', active: p === 'baseline' || (p === 'monitoring' && snap.alarmRep === null), done: snap.monitorReps.length > 0 && (snap.alarmRep !== null || p === 'summary' || p.startsWith('recovery')) },
    { n: 3, label: 'Detect', active: snap.alarmRep !== null && (p === 'monitoring' || p === 'summary'), done: snap.alarmRep !== null && p.startsWith('recovery') },
    { n: 4, label: 'Recover', active: p === 'recovery', done: p === 'recoveryDone' },
  ];
  return (
    <div className="stepper" aria-label="Session progress">
      {steps.map((s, i) => (
        <div key={s.n} className="row" style={{ gap: 6 }}>
          {i > 0 && <span className="step-sep" />}
          <span className={`step ${s.active ? 'active' : ''} ${s.done && !s.active ? 'done' : ''}`}>
            <span className="num">{s.done && !s.active ? '✓' : s.n}</span>
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Header(p: Props) {
  const locked = p.view === 'session' && p.snap !== null && (p.snap.phase === 'monitoring' || p.snap.phase === 'calibrating');
  return (
    <header className="app-header">
      <div className="brand" onClick={p.onHome} title="Home">
        <LogoMark />
        <span className="brand-name">
          Breaking<b>Point</b>
        </span>
        <span className="brand-tag">EDGE</span>
      </div>
      <div className="header-center">
        <div className="seg" role="tablist" aria-label="Exercise">
          <button className={p.exercise === 'squat' ? 'active' : ''} disabled={locked} onClick={() => p.onExercise('squat')} title="Bodyweight squat">
            Squat
          </button>
          <button className={p.exercise === 'cmj' ? 'active' : ''} disabled={locked} onClick={() => p.onExercise('cmj')} title="Countermovement jump">
            Jump (CMJ)
          </button>
        </div>
        {p.view === 'session' && p.snap && <Stepper snap={p.snap} />}
      </div>
      <div className="header-right">
        {p.view === 'session' && (
          <span className={`badge ${p.mode}`}>
            <span className="dot" />
            {p.mode === 'demo' ? 'Demo dataset' : 'Live camera'}
          </span>
        )}
        <label className="row hide-sm" style={{ gap: 4 }} title="Athlete name (stored only on this device)">
          <span className="muted" style={{ fontSize: 12 }}>Athlete</span>
          <input className="name-input" value={p.athlete} maxLength={18} onChange={(e) => p.onAthlete(e.target.value)} />
        </label>
        <button className="btn ghost sm hide-sm" onClick={p.onLab} title="BreakingPoint Lab validation">
          <Flask size={15} /> Lab
        </button>
        <button className="btn ghost sm" onClick={p.onResearch} title="Method, science and limitations">
          <Book size={15} /> Research
        </button>
        {p.view === 'session' && (
          <button className="btn ghost sm hide-sm" onClick={p.onResetBaseline} title="Clear the personal baseline and recalibrate">
            <Reset size={15} /> Reset baseline
          </button>
        )}
      </div>
    </header>
  );
}
