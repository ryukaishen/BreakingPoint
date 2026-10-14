import { useCallback, useRef, useState } from 'react';
import { defaultEntry, sharedContexts, sportEntries, sportPrimitives, sportReadiness, statusTone, type MovementEntry } from '../protocols/catalog';
import { getSport, type LaunchContext } from '../protocols/launch';
import type { PrimitiveId } from '../protocols/primitives';
import { PROTOCOLS } from '../protocols/protocols';
import { SPORTS } from '../protocols/sports';
import { MovementDetail, ProtocolStatusTag } from './protocols/MovementDetail';
import { useCarousel } from './protocols/useCarousel';
import { TechnicalCorners } from './system/TechnicalCorners';
import { useModalFocus } from './system/useModalFocus';

interface Props {
  /** Where the library opens: the sport (and discipline and protocol) last looked at. */
  sportId: string;
  subSportId?: string;
  protocolId?: string;
  savedBaselines: Record<string, string>;
  onClose: () => void;
  onOpenSport: (sportId: string, subSportId?: string, protocolId?: string) => void;
  onDemo: (ctx: LaunchContext) => void;
  onLive: (ctx: LaunchContext) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The entry the library opens on: that protocol in that discipline, else that discipline's first runnable one. */
function opening(entries: MovementEntry[], subSportId?: string, protocolId?: string): string {
  const scope = entries.filter((e) => !subSportId || e.sub?.id === subSportId);
  const list = scope.length ? scope : entries;
  return list[defaultEntry(list, protocolId)].key;
}

/**
 * The protocol library: Make's library (sport index, discipline and movement-type filters, the
 * movement grid, the selected protocol and the baseline note) in a modal window. Escape, the close
 * button or a click outside closes it; Tab stays inside; focus returns to the control that opened it.
 */
export function ProtocolLibrary(p: Props) {
  const win = useRef<HTMLElement>(null);
  useModalFocus(win, p.onClose);

  const [sportId, setSportId] = useState(getSport(p.sportId) ? p.sportId : SPORTS[0].id);
  const sport = getSport(sportId)!;
  const all = sportEntries(sport);
  const [discipline, setDiscipline] = useState('all');
  const [category, setCategory] = useState<PrimitiveId | 'all'>('all');
  const [selectedKey, setSelectedKey] = useState(() => opening(all, p.subSportId, p.protocolId));

  const shown = all.filter((e) => (discipline === 'all' || e.sub?.id === discipline) && (category === 'all' || e.primitive.id === category));
  const selected = shown.find((e) => e.key === selectedKey) ?? shown[defaultEntry(shown)] ?? all[0];
  const selectedIndex = shown.indexOf(selected);

  const grid = useRef<HTMLDivElement>(null);
  const settle = useCallback((i: number) => shown[i] && setSelectedKey(shown[i].key), [shown]);
  useCarousel(grid, selectedIndex, settle, '[data-card]', `${sport.id}/${discipline}/${category}`);

  const chooseSport = (id: string) => {
    const next = getSport(id)!;
    setSportId(id);
    setDiscipline('all');
    setCategory('all');
    setSelectedKey(opening(sportEntries(next)));
  };
  const chooseDiscipline = (d: string) => {
    setDiscipline(d);
    setCategory('all');
    const list = all.filter((e) => d === 'all' || e.sub?.id === d);
    if (list.length) setSelectedKey(list[defaultEntry(list)].key);
  };
  const chooseCategory = (c: PrimitiveId | 'all') => {
    setCategory(c);
    setDiscipline('all');
    const list = all.filter((e) => c === 'all' || e.primitive.id === c);
    if (list.length) setSelectedKey(list[defaultEntry(list)].key);
  };

  const disciplines = sport.subSports && sport.subSports.length > 1 ? sport.subSports : null;
  const shared = sharedContexts(selected);

  return (
    <div className="st-modal library-modal">
      <div className="st-scrim" aria-hidden="true" onClick={p.onClose} />
      <section className="protocol-library library-window" role="dialog" aria-modal="true" aria-labelledby="library-title" tabIndex={-1} ref={win}>
        <div className="library-scan-line" aria-hidden="true" />
        <TechnicalCorners />
        <header className="library-heading">
          <div>
            <span className="threshold-code">
              Protocol library / {Object.keys(PROTOCOLS).length} protocols<span className="library-count-sports"> / {SPORTS.length} sports</span>
            </span>
            <h2 id="library-title">Protocol library</h2>
            <p>Browse every sport’s movements by discipline and movement type.</p>
          </div>
          <div className="library-heading-actions">
            <button type="button" className="threshold-action library-enter" onClick={() => p.onOpenSport(sport.id, selected.sub?.id, selected.protocol.id)}>
              Enter movement system <span aria-hidden="true">↗</span>
            </button>
            <button type="button" className="threshold-action library-close" aria-label="Close" onClick={p.onClose}>
              ×
            </button>
          </div>
        </header>

        <div className="library-scroll">
          <div className="library-layout">
            <div className="library-sports" role="group" aria-labelledby="library-sports-label">
              <span id="library-sports-label">Sport index / {pad(SPORTS.length)}</span>
              {SPORTS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  className={`threshold-action ${s.id === sport.id ? 'is-active' : ''}`}
                  aria-pressed={s.id === sport.id}
                  onClick={() => s.id !== sport.id && chooseSport(s.id)}
                >
                  <span aria-hidden="true">{pad(i + 1)}</span>
                  <strong>{s.name}</strong>
                  <small aria-label={`${sportReadiness(s).total} movements`}>{sportReadiness(s).total}</small>
                </button>
              ))}
            </div>

            <div className="library-main">
              <div className="library-filter-row">
                {disciplines && (
                  <div role="group" aria-labelledby="library-discipline-label">
                    <span id="library-discipline-label">Discipline</span>
                    {[{ id: 'all', name: 'All' }, ...disciplines].map((d) => (
                      <button key={d.id} type="button" className={`threshold-action ${discipline === d.id ? 'is-active' : ''}`} aria-pressed={discipline === d.id} onClick={() => chooseDiscipline(d.id)}>
                        {d.name}
                      </button>
                    ))}
                  </div>
                )}
                <div role="group" aria-labelledby="library-category-label">
                  <span id="library-category-label">Movement type</span>
                  {[{ id: 'all' as const, name: 'All' }, ...sportPrimitives(sport)].map((c) => (
                    <button key={c.id} type="button" className={`threshold-action ${category === c.id ? 'is-active' : ''}`} aria-pressed={category === c.id} onClick={() => chooseCategory(c.id)}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="library-movement-grid" ref={grid} key={`${sport.id}-${discipline}-${category}`}>
                {shown.map((e, i) => (
                  <button
                    key={e.key}
                    type="button"
                    data-card=""
                    className={`threshold-action status-${statusTone(e.status)} ${e === selected ? 'is-selected' : ''} ${e.launch ? '' : 'is-locked'}`}
                    aria-pressed={e === selected}
                    aria-controls="library-detail"
                    onClick={() => setSelectedKey(e.key)}
                  >
                    <span aria-hidden="true">{pad(i + 1)}</span>
                    <ProtocolStatusTag status={e.status} />
                    <strong>{e.title}</strong>
                    <small>
                      {e.context} / {e.primitive.name}
                    </small>
                    {!e.launch && <i aria-hidden="true">Locked</i>}
                  </button>
                ))}
                <div className="custom-protocol-lock">
                  <span>Roadmap / locked</span>
                  <strong>Create your own protocol</strong>
                  <p>Record a few clean reps of any repeatable movement and BreakingPoint learns that athlete’s usual form for it. Not built yet.</p>
                </div>
              </div>

              <div id="library-detail">
                <MovementDetail
                  library
                  headingLevel={3}
                  entry={selected}
                  savedAt={selected.launch ? p.savedBaselines[selected.protocol.id] : undefined}
                  sharedWith={shared}
                  onDemo={p.onDemo}
                  onLive={p.onLive}
                />
              </div>

              <div className="baseline-explainer">
                <span className="threshold-code">Athlete-specific baselines</span>
                <strong>Your baseline belongs to you and this protocol.</strong>
                <p>BreakingPoint compares each monitored rep with the same athlete’s fresh calibration for the selected movement.</p>
              </div>
              <p className="library-disclaimer">
                The detector settings come from a synthetic study of simulated squat-like sessions. They have not been tested on real athletes or for specific sports.
                BreakingPoint gives training information, not a medical diagnosis.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
