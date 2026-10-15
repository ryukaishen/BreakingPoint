import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import brandMark from '../assets/brand-mark.svg';
import type { LaunchContext } from '../protocols/launch';
import type { Snapshot } from '../session/engine';
import type { NavView } from '../session/navGuard';
import { Book, Flask, Menu, Reset } from './Icons';
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
  view: NavView;
  snap: Snapshot | null;
  mode: 'demo' | 'live';
  launch: LaunchContext;
  /** Athlete switcher (owned by the app, which knows about profiles and the sample athlete). */
  athleteSlot: ReactNode;
  onHome: () => void;
  onStatus: () => void;
  onAthletes: () => void;
  onChangeProtocol: () => void;
  onLibrary: () => void;
  onResearch: () => void;
  onLab: () => void;
  onHistory: () => void;
  onResetBaseline: () => void;
}

export function Header(p: Props) {
  const locked = p.view === 'session' && p.snap !== null && (p.snap.phase === 'monitoring' || p.snap.phase === 'calibrating');
  // Entry, Status, Sports and Athletes carry the section nav (Entry, Status, Sports, Protocols, Athletes, Research), so the header keeps only what it lacks.
  const systemPage = p.view === 'landing' || p.view === 'status' || p.view === 'sport' || p.view === 'athletes' || p.view === 'history';
  return (
    <header className="app-header">
      <button className="brand" onClick={p.onHome} title="Home" aria-label="BreakingPoint home">
        <img className="brand-mark" src={brandMark} alt="" width={29} height={30} />
        <span className="brand-name">
          Breaking<b>Point</b>
        </span>
      </button>
      <div className="header-center">
        {p.view === 'session' && (
          <button
            className="context-chip"
            onClick={p.onChangeProtocol}
            disabled={locked}
            aria-label={`${p.launch.contextName}: ${p.launch.title}${p.launch.status === 'BETA' ? ' (beta)' : ''}. ${locked ? 'Finish or end the set to change it.' : 'Change sport or movement.'}`}
            title={locked ? 'Finish or end the set to change the movement.' : 'Change sport or movement'}
          >
            <SportIcon id={p.launch.sport.icon} size={18} />
            <span className="cc-text">
              <span className="cc-sport">{p.launch.contextName}</span>
              <span className="cc-proto">{p.launch.title}</span>
            </span>
            {p.launch.status === 'BETA' && <span className="status-badge beta">beta</span>}
          </button>
        )}
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
        {!systemPage && (
          <button className="btn ghost sm hide-sm" onClick={p.onStatus}>
            Status
          </button>
        )}
        {!systemPage && p.view !== 'session' && (
          <button className="btn ghost sm hide-sm" onClick={p.onAthletes}>
            Athletes
          </button>
        )}
        {!systemPage && (
          <button className="btn ghost sm hide-sm" onClick={p.onLibrary} title="Movement protocol library">
            Protocols
          </button>
        )}
        <button className="btn ghost sm hide-sm" onClick={p.onLab} title="Synthetic validation study (UF HiPerGator)">
          <Flask size={15} /> Lab
        </button>
        {!systemPage && (
          <button className="btn ghost sm hide-sm" onClick={p.onResearch} title="How it works, evidence and limits" aria-label="Research: how it works, evidence and limits">
            <Book size={15} /> Research
          </button>
        )}
        {p.view === 'session' && (
          <button className="btn ghost sm hide-sm" onClick={p.onResetBaseline} title="Clear the personal baseline and recalibrate" aria-label="Reset baseline">
            <Reset size={15} />
          </button>
        )}
        <MoreMenu
          items={[
            { label: 'Status', run: p.onStatus },
            { label: 'Athletes', run: p.onAthletes },
            { label: 'Protocols', run: p.onLibrary },
            { label: 'History', run: p.onHistory },
            { label: 'Lab study', icon: <Flask size={15} />, run: p.onLab },
            { label: 'Research', icon: <Book size={15} />, run: p.onResearch },
            ...(p.view === 'session' ? [{ label: 'Reset baseline', icon: <Reset size={15} />, run: p.onResetBaseline }] : []),
          ]}
        />
      </div>
    </header>
  );
}
