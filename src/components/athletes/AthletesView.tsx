import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { DataScope } from '../../data/useAthleteData';
import type { AthleteProfile, LegacyBaseline } from '../../data/types';
import { PROTOCOLS } from '../../protocols/protocols';
import { SystemNav } from '../system/SystemNav';
import { TechnicalCorners } from '../system/TechnicalCorners';
import { AthleteNameField, useAthleteName } from './AthleteNameField';

export interface AthleteSummary {
  sets: number;
  baselines: number;
}

interface Props {
  scope: DataScope;
  athletes: AthleteProfile[];
  activeId: string | null;
  summaries: Record<string, AthleteSummary>;
  legacy: LegacyBaseline[];
  persistent: boolean;
  /** Open the earlier-baselines panel first (from the athlete menu). */
  initialPanel?: Panel;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (athlete: AthleteProfile) => void;
  onSample: () => void;
  onRealData: () => void;
  onDemo: () => void;
  onChooseMovement: () => void;
  onAssignLegacy: (legacyId: string, athleteId: string) => void;
  onDiscardLegacy: (legacyId: string) => void;
  onEntry: () => void;
  onStatus: () => void;
  onResearch: () => void;
}

export type Panel = 'list' | 'add' | 'rename' | 'migration';

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Unknown date' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Make's ATHLETES screen, bound to the athlete repository on this device. */
export function AthletesView(p: Props) {
  const [panel, setPanel] = useState<Panel>(p.initialPanel ?? 'list');
  const current = p.athletes.find((a) => a.id === p.activeId) ?? null;
  const sample = p.scope === 'sample';
  const firstRun = p.athletes.length === 0;
  // The panel a removed condition pointed at falls back to the list (e.g. the last earlier baseline was assigned).
  const shown: Panel = panel === 'migration' && (!p.legacy.length || firstRun) ? 'list' : panel === 'rename' && !current ? 'list' : panel;

  // After a delete the button that opened the confirmation is gone; keep keyboard focus on the list it was in.
  const listHeading = useRef<HTMLHeadingElement>(null);
  const firstRunHeading = useRef<HTMLHeadingElement>(null);
  const count = useRef(p.athletes.length);
  useEffect(() => {
    if (p.athletes.length < count.current) (p.athletes.length ? listHeading : firstRunHeading).current?.focus();
    count.current = p.athletes.length;
  }, [p.athletes.length]);

  return (
    <div className="st-page athletes-page">
      <div className="threshold-environment" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </div>
      <SystemNav current="athletes" onEntry={p.onEntry} onStatus={p.onStatus} onAthletes={() => setPanel('list')} onResearch={p.onResearch} />

      <main className="threshold-canvas" id="main" tabIndex={-1}>
        <section className="athletes-stage">
          <div className="athletes-backplane athletes-plane-a" aria-hidden="true" />
          <div className="athletes-backplane athletes-plane-b" aria-hidden="true" />
          <div className="athletes-frame">
            <TechnicalCorners />
            <div className="athletes-heading">
              <div>
                <span className="threshold-code">Athlete system / on this device</span>
                <h1>Athletes</h1>
                <p>Baselines, sets and records stay separate on this device.</p>
              </div>
              {current && !sample && (
                <button type="button" className="threshold-action heading-action" onClick={p.onChooseMovement}>
                  Choose a movement
                </button>
              )}
            </div>

            <div className="athlete-state-rail" role="group" aria-label="Athlete views">
              {(
                [
                  ['list', firstRun ? 'Get started' : `Saved athletes (${p.athletes.length})`],
                  ['add', 'Add athlete'],
                  ...(p.legacy.length && !firstRun ? ([['migration', `Earlier baselines (${p.legacy.length})`]] as const) : []),
                ] as [Panel, string][]
              ).map(([id, label], i) => (
                <button
                  key={id}
                  type="button"
                  className={`threshold-action ${shown === id ? 'is-active' : ''}`}
                  aria-pressed={shown === id}
                  onClick={() => setPanel(id)}
                >
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  {label}
                </button>
              ))}
            </div>

            {!p.persistent && (
              <p className="athletes-storage-note" role="note">
                Browser storage is unavailable, so athletes and sets last only for this visit.
              </p>
            )}

            <div className="athletes-content" key={shown}>
              {shown === 'add' && (
                <NameEditor
                  key="add"
                  onCancel={() => setPanel('list')}
                  onSave={(name) => {
                    p.onCreate(name);
                    setPanel('list');
                  }}
                />
              )}

              {shown === 'rename' && current && (
                <NameEditor
                  key={`rename-${current.id}`}
                  initialName={current.name}
                  onCancel={() => setPanel('list')}
                  onSave={(name) => {
                    p.onRename(current.id, name);
                    setPanel('list');
                  }}
                />
              )}

              {shown === 'list' && firstRun && (
                <section className="athlete-first-run" aria-labelledby="first-run-title">
                  <TechnicalCorners />
                  <span className="threshold-code">Get started / no athlete yet</span>
                  <h2 id="first-run-title" ref={firstRunHeading} tabIndex={-1}>
                    Your movement data stays here
                  </h2>
                  <p>Athletes, baselines, sets and records are stored only on this device. Nothing is uploaded.</p>
                  {p.legacy.length > 0 && (
                    <p className="athlete-first-run__legacy">
                      {plural(p.legacy.length, 'baseline')} from an earlier version {p.legacy.length === 1 ? 'is' : 'are'} waiting. Add an athlete to assign{' '}
                      {p.legacy.length === 1 ? 'it' : 'them'}.
                    </p>
                  )}
                  <div>
                    <button type="button" className="threshold-action cyan-action" onClick={() => setPanel('add')}>
                      Add athlete
                    </button>
                    <button type="button" className="threshold-action" onClick={p.onDemo}>
                      Run the soccer demo
                    </button>
                    <button type="button" className="threshold-action" onClick={p.onSample}>
                      Explore the sample athlete
                    </button>
                  </div>
                </section>
              )}

              {shown === 'list' && !firstRun && (
                <div className="athlete-list-layout">
                  <section className="saved-athletes" aria-labelledby="saved-athletes-title">
                    <div className="athlete-panel-heading">
                      <h2 id="saved-athletes-title" className="threshold-code" ref={listHeading} tabIndex={-1}>
                        Saved on this device
                      </h2>
                      <span>{plural(p.athletes.length, 'athlete')}</span>
                    </div>
                    <ul className="athlete-rows">
                      {p.athletes.map((a, i) => {
                        const isCurrent = !sample && a.id === p.activeId;
                        const s = p.summaries[a.id] ?? { sets: 0, baselines: 0 };
                        return (
                          <li key={a.id} className={isCurrent ? 'is-current' : ''}>
                            <span className="athlete-row__n">{String(i + 1).padStart(2, '0')}</span>
                            <div className="athlete-row__who">
                              <strong>{a.name}</strong>
                              <small>
                                {isCurrent ? 'Current athlete' : 'On this device'} · {plural(s.sets, 'set')} · {plural(s.baselines, 'baseline')}
                              </small>
                            </div>
                            <div className="athlete-row__actions">
                              {isCurrent ? (
                                <span className="athlete-row__current">Current</span>
                              ) : (
                                <button type="button" className="threshold-action" onClick={() => p.onSwitch(a.id)} aria-label={`Switch to ${a.name}`}>
                                  Switch
                                </button>
                              )}
                              {isCurrent && (
                                <button type="button" className="threshold-action" onClick={() => setPanel('rename')}>
                                  Rename
                                  <span className="visually-hidden"> {a.name}</span>
                                </button>
                              )}
                              <button type="button" className="threshold-action athlete-delete-trigger" onClick={() => p.onDelete(a)} aria-label={`Delete ${a.name}`}>
                                Delete
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    <button type="button" className="threshold-action athlete-add-action" onClick={() => setPanel('add')}>
                      + Add athlete
                    </button>
                  </section>

                  <SampleEntry sample={sample} onSample={p.onSample} onRealData={p.onRealData} />
                </div>
              )}

              {shown === 'migration' && (
                <LegacyPanel items={p.legacy} athletes={p.athletes} onAssign={p.onAssignLegacy} onDiscard={p.onDiscardLegacy} />
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function SampleEntry({ sample, onSample, onRealData }: { sample: boolean; onSample: () => void; onRealData: () => void }) {
  return (
    <section className={`sample-athlete-entry ${sample ? 'is-active' : ''}`} aria-labelledby="sample-entry-title">
      <span className="threshold-code">Synthetic exploration</span>
      <h2 id="sample-entry-title">{sample ? 'Exploring the sample athlete' : 'Explore with the sample athlete'}</h2>
      <p>Synthetic data, never saved to your records.</p>
      {sample ? (
        <button type="button" className="threshold-action violet-action" onClick={onRealData}>
          Back to my data
        </button>
      ) : (
        <button type="button" className="threshold-action violet-action" onClick={onSample}>
          Explore the sample athlete
        </button>
      )}
    </section>
  );
}

function NameEditor({ initialName, onCancel, onSave }: { initialName?: string; onCancel: () => void; onSave: (name: string) => void }) {
  const state = useAthleteName(initialName ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const rename = initialName !== undefined;
  useEffect(() => inputRef.current?.focus(), []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const name = state.submit();
    if (name) onSave(name);
    else inputRef.current?.focus();
  };
  return (
    <form className="athlete-editor" onSubmit={submit} noValidate aria-labelledby="athlete-editor-title">
      <TechnicalCorners />
      <span className="threshold-code">Athlete record / {rename ? 'rename' : 'create'}</span>
      <h2 id="athlete-editor-title">{rename ? `Rename ${initialName}` : 'Add athlete'}</h2>
      <AthleteNameField state={state} inputRef={inputRef} />
      <div className="athlete-editor-actions">
        <button type="button" className="threshold-action" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="threshold-action cyan-action">
          {rename ? 'Save name' : 'Add athlete'}
        </button>
      </div>
    </form>
  );
}

function LegacyPanel({
  items,
  athletes,
  onAssign,
  onDiscard,
}: {
  items: LegacyBaseline[];
  athletes: AthleteProfile[];
  onAssign: (legacyId: string, athleteId: string) => void;
  onDiscard: (legacyId: string) => void;
}) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  return (
    <section className="athlete-migration" aria-labelledby="migration-title">
      <div className="athlete-panel-heading">
        <div>
          <span className="threshold-code">Baselines from an earlier version</span>
          <h2 id="migration-title">Assign saved baselines</h2>
        </div>
        <p>The earlier version saved one baseline per movement without recording whose it was. Choose the athlete each one belongs to, or discard it. Nothing is assigned until you choose.</p>
      </div>
      <ul className="migration-table">
        {items.map((l) => {
          const target = choice[l.id] ?? '';
          const selectId = `legacy-${l.id}`;
          return (
            <li key={l.id}>
              <div className="migration-baseline">
                <span>{PROTOCOLS[l.protocolId]?.name ?? l.exercise}</span>
                <strong>Saved {fmtDate(l.createdAt)}</strong>
                <small>
                  {plural(l.baseline.nReps, 'calibration rep')}
                  {l.savedName ? ` · saved under the name "${l.savedName}"` : ''}
                </small>
              </div>
              <label htmlFor={selectId}>
                <span>Athlete</span>
                <select id={selectId} value={target} onChange={(e) => setChoice({ ...choice, [l.id]: e.target.value })}>
                  <option value="">Choose athlete…</option>
                  {athletes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="threshold-action migration-assign" disabled={!target} onClick={() => onAssign(l.id, target)}>
                Assign
              </button>
              {confirmDiscard === l.id ? (
                <div className="discard-confirm" role="group" aria-label="Confirm discard">
                  <span>Discard this baseline? This can’t be undone.</span>
                  <button type="button" className="threshold-action" onClick={() => setConfirmDiscard(null)} autoFocus>
                    Keep it
                  </button>
                  <button
                    type="button"
                    className="threshold-action is-danger"
                    onClick={() => {
                      setConfirmDiscard(null);
                      onDiscard(l.id);
                    }}
                  >
                    Discard
                  </button>
                </div>
              ) : (
                <button type="button" className="threshold-action migration-discard" onClick={() => setConfirmDiscard(l.id)}>
                  Discard
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
