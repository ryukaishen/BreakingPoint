import { useEffect, useRef, useState } from 'react';
import type { DataScope } from '../../data/useAthleteData';
import type { AthleteProfile } from '../../data/types';
import { Check } from '../Icons';

interface Props {
  scope: DataScope;
  athlete: AthleteProfile | null;
  athletes: AthleteProfile[];
  legacyCount: number;
  /** Switching is blocked while a live set is running; the menu then explains why instead of opening. */
  locked: boolean;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onRename: () => void;
  onManage: () => void;
  onScope: (s: DataScope) => void;
  onLegacy: () => void;
}

/** Who is training: the athlete switcher, plus the way into and out of the sample athlete. */
export function AthleteMenu(p: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const lockNote = useRef<HTMLDivElement>(null);

  /** Room for the lock note between the trigger's left edge and the screen edge (it covers only the header actions there). */
  const [lockRoom, setLockRoom] = useState(560);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    let timer: number | undefined;
    if (p.locked) {
      const left = trigger.current?.getBoundingClientRect().left ?? 0;
      setLockRoom(Math.max(150, Math.min(560, document.documentElement.clientWidth - left - 8)));
      lockNote.current?.focus();
      // An explanation, not a prompt: it goes away by itself.
      timer = window.setTimeout(() => {
        const hadFocus = lockNote.current?.contains(document.activeElement) ?? false;
        setOpen(false);
        if (hadFocus) trigger.current?.focus();
      }, 6000);
    }
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(timer);
    };
  }, [open, p.locked]);

  // A set that ends while the lock note is open: close it, the menu works again.
  useEffect(() => {
    if (!p.locked) setOpen(false);
  }, [p.locked]);

  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  const sample = p.scope === 'sample';
  const label = sample ? 'Sample athlete' : (p.athlete?.name ?? 'Add athlete');

  return (
    <div className="athlete-menu" ref={wrap}>
      <button
        ref={trigger}
        className={`athlete-trigger ${sample ? 'sample' : ''} ${p.locked ? 'is-locked' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title={p.locked ? 'Finish or end the set to switch athletes' : 'Switch athlete'}
      >
        <span className="athlete-initial" aria-hidden>
          {sample ? 'S' : (p.athlete?.name[0]?.toUpperCase() ?? '+')}
        </span>
        <span className="athlete-text">
          <span className="athlete-kicker">{sample ? 'Synthetic data' : p.athlete ? 'Athlete' : 'No athlete yet'}</span>
          <span className="athlete-name">{label}</span>
        </span>
        {p.legacyCount > 0 && !sample && <span className="athlete-dot" aria-label="Earlier baselines need review" />}
      </button>
      {open && p.locked && (
        // Lies over the header actions to the right of the trigger and nowhere else: never over the camera,
        // the athlete view, the LIVE badge or the movement. Not a dialog, so hands-free keeps running.
        <div
          className={`athlete-locked-note ${lockRoom < 380 ? 'is-compact' : ''}`}
          style={{ width: lockRoom }}
          role="group"
          aria-labelledby="athlete-locked-title"
          aria-describedby="athlete-locked-who"
          tabIndex={-1}
          ref={lockNote}
          onClick={() => {
            setOpen(false);
            trigger.current?.focus();
          }}
          onBlur={(e) => {
            if (!wrap.current?.contains(e.relatedTarget as Node)) setOpen(false);
          }}
        >
          <span className="athlete-lock-mark" aria-hidden="true">
            <span>×</span>
          </span>
          <span className="athlete-locked-text">
            <strong id="athlete-locked-title">Finish or end the set to switch athletes.</strong>
            <span id="athlete-locked-who" className="athlete-locked-who">
              {sample ? 'The sample athlete' : (p.athlete?.name ?? 'This athlete')} stays the current athlete for this set.
            </span>
          </span>
        </div>
      )}
      {open && !p.locked && (
        <div className="athlete-pop" role="group" aria-label="Athletes">
          {p.athletes.length > 0 && (
            <ul className="athlete-list">
              {p.athletes.map((a) => {
                const current = !sample && a.id === p.athlete?.id;
                return (
                  <li key={a.id}>
                    <button className="athlete-option" aria-current={current ? 'true' : undefined} onClick={act(() => p.onSwitch(a.id))}>
                      <span>{a.name}</span>
                      {current && <Check size={14} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="athlete-actions">
            <button className="athlete-option" onClick={act(p.onAdd)}>
              Add athlete
            </button>
            {p.athlete && !sample && (
              <button className="athlete-option" onClick={act(p.onRename)}>
                Rename {p.athlete.name}
              </button>
            )}
            <button className="athlete-option" onClick={act(p.onManage)}>
              Manage athletes
            </button>
            {p.legacyCount > 0 && (
              <button className="athlete-option" onClick={act(p.onLegacy)}>
                Review {p.legacyCount} baseline{p.legacyCount === 1 ? '' : 's'} from an earlier version
              </button>
            )}
          </div>
          <div className="athlete-actions">
            {sample ? (
              <button className="athlete-option strong" onClick={act(() => p.onScope('real'))}>
                Back to my data
              </button>
            ) : (
              <button className="athlete-option" onClick={act(() => p.onScope('sample'))}>
                Explore with the sample athlete
                <small>Synthetic data, never saved to your records.</small>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
