import type { LaunchContext } from '../protocols/launch';
import { RECOVERY_REPS, type Snapshot } from '../session/engine';
import { Book, Flask, LogoMark, Reset } from './Icons';
import { SportIcon } from './SportIcons';

interface Props {
  view: 'landing' | 'sport' | 'session';
  snap: Snapshot | null;
  mode: 'demo' | 'live';
  launch: LaunchContext;
  athlete: string;
  onHome: () => void;
  onChangeProtocol: () => void;
  onLibrary: () => void;
  onAthlete: (name: string) => void;
  onResearch: () => void;
  onLab: () => void;
  onResetBaseline: () => void;
}

/** Calibrate → Monitor → Detect → Recover, each with its real progress. */
function SessionTrack({ snap }: { snap: Snapshot }) {
  const p = snap.phase;
  const hasBaseline = !!snap.baseline;
  const recovering = p === 'recovery' || p === 'recoveryDone';
  const stages = [
    {
      label: 'Calibrate',
      active: p === 'idle' || p === 'calibrating',
      done: hasBaseline,
      count: p === 'calibrating' ? `${snap.calibrationReps.length}/${snap.calibrationTarget}` : null,
    },
    {
      label: 'Monitor',
      active: p === 'baseline' || (p === 'monitoring' && snap.alarmRep === null),
      done: snap.monitorReps.length > 0 && (snap.alarmRep !== null || p === 'summary' || recovering),
      count: p === 'monitoring' && snap.alarmRep === null ? `${snap.monitorReps.length}` : null,
    },
    {
      label: 'Detect',
      active: snap.alarmRep !== null && (p === 'monitoring' || p === 'summary'),
      done: snap.alarmRep !== null && recovering,
      count: snap.alarmRep !== null && (p === 'monitoring' || p === 'summary') ? `rep ${snap.alarmRep}` : null,
    },
    {
      label: 'Recover',
      active: p === 'recovery',
      done: p === 'recoveryDone',
      count: p === 'recovery' ? `${snap.recoveryReps.length}/${RECOVERY_REPS}` : null,
    },
  ];
  return (
    <ol className="track" aria-label="Session progress">
      {stages.map((s, i) => {
        const state = s.active ? 'active' : s.done ? 'done' : '';
        return (
          <li key={s.label} className="row" style={{ gap: 0 }}>
            {i > 0 && <span className={`track-link ${stages[i - 1].done ? 'done' : ''}`} aria-hidden />}
            <span className={`track-stage ${state}`} aria-current={s.active ? 'step' : undefined}>
              <span className="track-node" aria-hidden />
              <span className="track-label">{s.label}</span>
              {s.count && <span className="track-count">{s.count}</span>}
              {s.done && !s.active && <span className="visually-hidden">(complete)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Header(p: Props) {
  const locked = p.view === 'session' && p.snap !== null && (p.snap.phase === 'monitoring' || p.snap.phase === 'calibrating');
  return (
    <header className="app-header">
      <button className="brand" onClick={p.onHome} title="Home" aria-label="BreakingPoint home">
        <LogoMark />
        <span className="brand-name">
          Breaking<b>Point</b>
        </span>
        <span className="brand-tag code">Edge</span>
      </button>
      <div className="header-center">
        {p.view === 'session' && (
          <button
            className="context-chip"
            onClick={p.onChangeProtocol}
            disabled={locked}
            title={`${p.launch.contextName} / ${p.launch.title}. ${locked ? 'Finish or end the set to change protocol.' : 'Change sport or protocol.'}`}
          >
            <SportIcon id={p.launch.sport.icon} size={18} />
            <span className="cc-sport">{p.launch.contextName}</span>
            <span className="cc-sep">/</span>
            <span className="cc-proto">{p.launch.title}</span>
            {p.launch.status === 'BETA' && <span className="status-badge beta">beta</span>}
          </button>
        )}
        {p.view === 'session' && p.snap && <SessionTrack snap={p.snap} />}
      </div>
      <div className="header-right">
        {p.view === 'session' && (
          <span className={`badge ${p.mode}`}>
            <span className="dot" />
            {p.mode === 'demo' ? 'Demo' : 'Live'}
          </span>
        )}
        <label className="row hide-sm" style={{ gap: 2 }} title="Athlete name (stored only on this device)">
          <span className="visually-hidden">Athlete name</span>
          <input className="name-input" value={p.athlete} maxLength={18} onChange={(e) => p.onAthlete(e.target.value)} />
        </label>
        <span className="header-sep" aria-hidden />
        <button className="btn ghost sm hide-sm" onClick={p.onLibrary} title="Movement protocol library">
          Protocols
        </button>
        <button className="btn ghost sm hide-sm" onClick={p.onLab} title="BreakingPoint Lab validation">
          <Flask size={15} /> Lab
        </button>
        <button className="btn ghost sm" onClick={p.onResearch} title="Method, science and limitations">
          <Book size={15} /> Research
        </button>
        {p.view === 'session' && (
          <button className="btn ghost sm hide-sm" onClick={p.onResetBaseline} title="Clear the personal baseline and recalibrate" aria-label="Reset baseline">
            <Reset size={15} />
          </button>
        )}
      </div>
    </header>
  );
}
