import { useCallback, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { defaultEntry, movementEntries, sportReadiness, statusTone } from '../protocols/catalog';
import { getSubSport, type LaunchContext } from '../protocols/launch';
import { SPORTS, type SportProfile } from '../protocols/sports';
import { Check, Lock } from './Icons';
import { MovementDetail, ProtocolStatusTag } from './protocols/MovementDetail';
import { useCarousel } from './protocols/useCarousel';
import { SystemNav } from './system/SystemNav';
import { TechnicalCorners } from './system/TechnicalCorners';

interface Props {
  sport: SportProfile;
  subSportId?: string;
  /** The movement to show selected; the first runnable one when absent or not in this context. */
  protocolId?: string;
  /** Saved baselines of the current athlete: protocol id to the date it was saved. */
  savedBaselines: Record<string, string>;
  onSport: (id: string) => void;
  onSubSport: (id: string) => void;
  onSelect: (protocolId: string) => void;
  onDemo: (ctx: LaunchContext) => void;
  onLive: (ctx: LaunchContext) => void;
  onLibrary: () => void;
  onEntry: () => void;
  onStatus: () => void;
  onAthletes: () => void;
  onResearch: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const PANEL_ID = 'movement-detail';
const tabId = (protocolId: string) => `movement-tab-${protocolId}`;

/**
 * The sport page: Make's movement system ("Select movement"). Sports along the top, the
 * discipline below, then the sport's movements as floating violet planes around the athlete's
 * baseline mark, and the selected movement's detail with its launch actions. On phones the
 * planes become Make's touch carousel. Everything shown comes from the protocol registry.
 */
export function SportPage(p: Props) {
  const sub = getSubSport(p.sport, p.subSportId);
  const entries = movementEntries(p.sport, sub?.id);
  const selected = defaultEntry(entries, p.protocolId);
  const current = entries[selected];
  const contextName = sub?.name ?? p.sport.name;
  const contextKey = sub?.id ?? p.sport.id;

  // On a phone the sport row scrolls: keep the current sport in view (sideways only, the page stays put).
  const switcher = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const row = switcher.current;
    const here = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !here || row.scrollWidth <= row.clientWidth) return;
    row.scrollLeft = Math.max(0, here.offsetLeft - (row.clientWidth - here.offsetWidth) / 2);
  }, [p.sport.id]);

  const planes = useRef<HTMLDivElement>(null);
  const { onSelect } = p;
  const select = useCallback((i: number) => entries[i] && onSelect(entries[i].protocol.id), [entries, onSelect]);
  useCarousel(planes, selected, select, '[role="tab"]', `${p.sport.id}/${sub?.id ?? ''}`);

  // Tabs: arrow keys move the selection and focus with it; Home and End jump to the ends.
  const onPlaneKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = entries.length;
    const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const j = (next + n) % n;
    select(j);
    planes.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[j]?.focus();
  };

  return (
    <div className="st-page sports-page">
      <div className="threshold-environment" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <SystemNav current="sports" onEntry={p.onEntry} onStatus={p.onStatus} onSports={() => window.scrollTo({ top: 0 })} onProtocols={p.onLibrary} onAthletes={p.onAthletes} onResearch={p.onResearch} />

      <main className="landing threshold-canvas sports-canvas" id="main" tabIndex={-1}>
        <section className="arsenal-stage sport-arsenal" aria-labelledby="sport-title">
          <div className="arsenal-backplane backplane-one" aria-hidden="true" />
          <div className="arsenal-backplane backplane-two" aria-hidden="true" />
          <div className="arsenal-frame">
            <TechnicalCorners />
            <header className="sport-selector-heading">
              <div>
                <span className="threshold-code">Sport / movement system</span>
                <h1 id="sport-title">
                  Select movement<span className="visually-hidden">: {contextName}</span>
                </h1>
                <p>Each baseline belongs to one athlete and one movement.</p>
              </div>
              <button type="button" className="threshold-action" onClick={p.onLibrary}>
                Open protocol library <span aria-hidden="true">↗</span>
              </button>
            </header>

            <div className="sport-switcher" role="group" aria-label="Sport" ref={switcher}>
              {SPORTS.map((s, i) => {
                const here = s.id === p.sport.id;
                const r = sportReadiness(s);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`threshold-action ${here ? 'is-active' : ''} ${r.ready + r.beta ? '' : 'is-roadmap'}`}
                    aria-pressed={here}
                    onClick={() => !here && p.onSport(s.id)}
                  >
                    <span aria-hidden="true">{pad(i + 1)}</span>
                    <strong>{s.name}</strong>
                    <small>
                      {r.total} movement{r.total === 1 ? '' : 's'}
                    </small>
                  </button>
                );
              })}
            </div>

            {p.sport.subSports && p.sport.subSports.length > 1 ? (
              <div className="discipline-switcher" role="group" aria-labelledby="discipline-label">
                <span id="discipline-label">Discipline</span>
                {p.sport.subSports.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={`threshold-action ${d.id === sub?.id ? 'is-active' : ''}`}
                    aria-pressed={d.id === sub?.id}
                    onClick={() => d.id !== sub?.id && p.onSubSport(d.id)}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="discipline-switcher sport-context-line">
                <span>Sport context</span>
                <strong>{p.sport.descriptor}</strong>
                {(sub?.note ?? p.sport.note) && <small>{sub?.note ?? p.sport.note}</small>}
              </div>
            )}

            <div className={`movement-constellation movement-count-${entries.length}`} key={contextKey}>
              <div className="movement-focus" aria-hidden="true">
                <div className="focus-orbit orbit-one" />
                <div className="focus-orbit orbit-two" />
                <div className="focus-mark" key={current?.protocol.id} />
                <span>Athlete-specific baseline</span>
              </div>
              <div className="movement-planes" role="tablist" aria-label={`${contextName} movements`} ref={planes}>
                {entries.map((e, i) => {
                  const on = i === selected;
                  return (
                    <button
                      key={e.key}
                      type="button"
                      role="tab"
                      id={tabId(e.protocol.id)}
                      aria-selected={on}
                      aria-controls={PANEL_ID}
                      tabIndex={on ? 0 : -1}
                      className={`threshold-action movement-plane movement-position-${i + 1} status-${statusTone(e.status)} ${on ? 'is-selected' : ''} ${e.launch ? '' : 'is-locked'}`}
                      style={{ '--panel-index': i + 1 } as CSSProperties}
                      onClick={() => select(i)}
                      onKeyDown={(ev) => onPlaneKey(ev, i)}
                    >
                      <span className="movement-index" aria-hidden="true">
                        {pad(i + 1)}
                      </span>
                      <span className="movement-copy">
                        <ProtocolStatusTag status={e.status} />
                        <strong>{e.title}</strong>
                        <small>
                          {e.context} / {e.primitive.name}
                        </small>
                      </span>
                      {!e.launch && (
                        <span className="movement-lock" aria-hidden="true">
                          <Lock size={13} />
                          <span>Locked</span>
                        </span>
                      )}
                      {e.launch && p.savedBaselines[e.protocol.id] && (
                        <span className="movement-saved">
                          <Check size={13} aria-hidden="true" />
                          <span>Baseline saved</span>
                        </span>
                      )}
                      <i className="movement-notch" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>
            {entries.length > 1 && (
              <div className="movement-pager" aria-hidden="true">
                {entries.map((e, i) => (
                  <i key={e.key} className={i === selected ? 'is-active' : ''} />
                ))}
                <span>
                  {pad(selected + 1)} / {pad(entries.length)}
                </span>
              </div>
            )}

            {current && (
              <MovementDetail
                entry={current}
                savedAt={current.launch ? p.savedBaselines[current.protocol.id] : undefined}
                panel={{ id: PANEL_ID, labelledBy: tabId(current.protocol.id) }}
                onDemo={p.onDemo}
                onLive={p.onLive}
              />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
