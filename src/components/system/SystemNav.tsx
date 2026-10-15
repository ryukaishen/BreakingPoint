import { useLayoutEffect, useRef } from 'react';

export type SystemSection = 'landing' | 'status' | 'sports' | 'athletes' | 'history';

interface Props {
  current: SystemSection;
  onEntry: () => void;
  onStatus: () => void;
  onSports: () => void;
  onProtocols: () => void;
  onHistory: () => void;
  onAthletes: () => void;
  onResearch: () => void;
}

/**
 * Make's .threshold-nav: the numbered System sections at the left of the Entry, Status, Sports,
 * History and Athletes screens (a row under the header on narrow screens, which scrolls sideways on phones as
 * Make's mobile nav does). Protocols opens the protocol library and Research the study panel.
 */
export function SystemNav({ current, onEntry, onStatus, onSports, onProtocols, onHistory, onAthletes, onResearch }: Props) {
  const items: [SystemSection | 'protocols' | 'research', string, () => void][] = [
    ['landing', 'Entry', onEntry],
    ['status', 'Status', onStatus],
    ['sports', 'Sports', onSports],
    ['protocols', 'Protocols', onProtocols],
    ['history', 'History', onHistory],
    ['athletes', 'Athletes', onAthletes],
    ['research', 'Research', onResearch],
  ];
  const nav = useRef<HTMLElement>(null);

  // On a phone the row scrolls: start with the current section in view, without moving the page.
  useLayoutEffect(() => {
    const el = nav.current;
    const here = el?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el || !here || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = Math.max(0, here.offsetLeft - (el.clientWidth - here.offsetWidth) / 2);
  }, [current]);

  return (
    <nav className="threshold-nav" aria-label="Sections" ref={nav}>
      <span className="nav-spine" aria-hidden="true" />
      {items.map(([id, label, run], i) => {
        const here = id === current;
        return (
          <button
            key={id}
            type="button"
            className={`threshold-action ${here ? 'is-active' : ''}`}
            aria-current={here ? 'page' : undefined}
            onClick={here ? undefined : run}
          >
            <span>{String(i + 1).padStart(2, '0')}</span>
            <strong>{label}</strong>
          </button>
        );
      })}
    </nav>
  );
}
