import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { LaunchContext } from '../protocols/launch';
import { RECOVERY_REPS, type Snapshot } from '../session/engine';
import { Book, Flask, LogoMark, Menu, Reset } from './Icons';
import { SportIcon } from './SportIcons';

interface MenuItem {
  label: string;
  icon?: ReactNode;
  run: () => void;
}

/**
 * Phone-width navigation: the header buttons that do not fit (protocols, the Lab study,
 * reset baseline) in one disclosure. A plain list of buttons, not an ARIA menu: Tab moves
 * through it, Escape or a click outside closes it and returns focus to the toggle.
 */
function MoreMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    wrap.current?.querySelector<HTMLButtonElement>('.more-list button')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="more-nav show-sm" ref={wrap}>
      <button ref={toggle} className="btn ghost sm" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Menu size={15} /> More
      </button>
      {open && (
        <div className="more-list" id={id}>
          {items.map((it) => (
            <button
              key={it.label}
              className="btn ghost sm block"
              onClick={() => {
                setOpen(false);
                it.run();
              }}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  view: 'landing' | 'sport' | 'session';
  snap: Snapshot | null;
  mode: 'demo' | 'live';
  launch: LaunchContext;
  /** Athlete switcher (owned by the app, which knows about profiles and the sample athlete). */
  athleteSlot: ReactNode;
  onHome: () => void;
  onChangeProtocol: () => void;
  onLibrary: () => void;
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
        {p.athleteSlot}
        <span className="header-sep" aria-hidden />
        <button className="btn ghost sm hide-sm" onClick={p.onLibrary} title="Movement protocol library">
          Protocols
        </button>
        <button className="btn ghost sm hide-sm" onClick={p.onLab} title="Synthetic validation study (UF HiPerGator)">
          <Flask size={15} /> Lab
        </button>
        <button className="btn ghost sm" onClick={p.onResearch} title="How it works, evidence and limits" aria-label="Research: how it works, evidence and limits">
          <Book size={15} /> <span className="label-wide">Research</span>
        </button>
        {p.view === 'session' && (
          <button className="btn ghost sm hide-sm" onClick={p.onResetBaseline} title="Clear the personal baseline and recalibrate" aria-label="Reset baseline">
            <Reset size={15} />
          </button>
        )}
        <MoreMenu
          items={[
            { label: 'Protocols', run: p.onLibrary },
            { label: 'Lab study', icon: <Flask size={15} />, run: p.onLab },
            ...(p.view === 'session' ? [{ label: 'Reset baseline', icon: <Reset size={15} />, run: p.onResetBaseline }] : []),
          ]}
        />
      </div>
    </header>
  );
}
