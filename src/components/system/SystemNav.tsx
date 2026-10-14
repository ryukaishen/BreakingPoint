export type SystemSection = 'landing' | 'status' | 'athletes';

interface Props {
  current: SystemSection;
  onEntry: () => void;
  onStatus: () => void;
  onAthletes: () => void;
  onResearch: () => void;
}

/**
 * Make's .threshold-nav: the numbered System sections at the left of the Entry, Status and
 * Athletes screens (a row under the header on narrow screens). Research opens the study panel.
 */
export function SystemNav({ current, onEntry, onStatus, onAthletes, onResearch }: Props) {
  const items: [SystemSection | 'research', string, () => void][] = [
    ['landing', 'Entry', onEntry],
    ['status', 'Status', onStatus],
    ['athletes', 'Athletes', onAthletes],
    ['research', 'Research', onResearch],
  ];
  return (
    <nav className="threshold-nav" aria-label="Sections">
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
