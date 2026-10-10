import { useEffect, useRef, useState } from 'react';
import type { DataScope } from '../../data/useAthleteData';
import type { AthleteProfile } from '../../data/types';
import { Check } from '../Icons';

interface Props {
  scope: DataScope;
  athlete: AthleteProfile | null;
  athletes: AthleteProfile[];
  legacyCount: number;
  /** Switching is blocked while a live set is running (the caller explains why). */
  locked: boolean;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onRename: () => void;
  onScope: (s: DataScope) => void;
  onLegacy: () => void;
  onLockedAttempt: () => void;
}

/** Who is training: the athlete switcher, plus the way into and out of the sample athlete. */
export function AthleteMenu(p: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

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
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

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
        className={`athlete-trigger ${sample ? 'sample' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => (p.locked ? p.onLockedAttempt() : setOpen((o) => !o))}
        title={p.locked ? 'Finish or end the set to switch athletes' : 'Switch athlete'}
      >
        <span className="athlete-initial" aria-hidden>
          {sample ? 'S' : (p.athlete?.name[0]?.toUpperCase() ?? '+')}
        </span>
        <span className="athlete-name">{label}</span>
        {p.legacyCount > 0 && !sample && <span className="athlete-dot" aria-label="Earlier baselines need review" />}
      </button>
      {open && (
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
                Explore with sample athlete
                <small>Synthetic example data — does not affect your records.</small>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
