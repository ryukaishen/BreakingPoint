import { useEffect, useRef, type ReactNode } from 'react';
import type { Comparison, HistoryEntry } from '../../data/history';
import { relativeDay } from '../../data/history';
import { chartModel, type PostSet } from '../../session/postWorkout';
import { TechnicalCorners } from '../system/TechnicalCorners';
import { TelemetryChart } from './TelemetryChart';

export type HistoryEmpty = { code: string; title: string; text: string; actions?: ReactNode };

interface Props {
  scope: 'real' | 'sample';
  /** Switch between the device's records and the synthetic sample; null when the session fixes it. */
  onScope: ((s: 'real' | 'sample') => void) | null;
  athleteName: string | null;
  entries: HistoryEntry[];
  movements: { protocolId: string; title: string; count: number }[];
  movement: string | null;
  onMovement: (protocolId: string | null) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The selected set as the summary sees it. */
  selected: PostSet | null;
  compare: boolean;
  onCompare: () => void;
  comparison: Comparison | null;
  empty: HistoryEmpty | null;
  now: Date;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const RECOVERY_WORDS: Record<string, string> = { recovered: 'back to your usual form', partial: 'partly back', persistent: 'still different' };
/** "today", "yesterday", "5 days ago" or "on 12 Sep 2026", for use inside a sentence. */
const inSentence = (iso: string, now: Date) => {
  const r = relativeDay(iso, now);
  return r === 'Today' ? 'today' : r === 'Yesterday' ? 'yesterday' : r.endsWith(' ago') ? r : `on ${r}`;
};

/**
 * Make's training telemetry: the athlete's stored sets, filtered by movement, with the selected
 * set's rep chart, facts and comparison. On phones the session list is Make's perspective carousel.
 */
export function HistoryPanel(p: Props) {
  const list = useRef<HTMLDivElement>(null);
  const sampleScope = p.scope === 'sample';

  // Keep the selected session in view in the phone carousel (and the desktop list).
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    const box = list.current;
    if (!el || !box) return;
    if (box.scrollWidth > box.clientWidth + 2) box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2, behavior: 'auto' });
  }, [p.selectedId, p.movement]);

  return (
    <div className="history-system">
      <header className="history-heading">
        <div>
          <span className="threshold-code">On-device session history</span>
          <h3>Training telemetry</h3>
          <p>Comparisons need the same athlete, source, movement and detector version, and sets that pass the calibration and capture-quality floors.</p>
        </div>
        <div className="history-scope" role="group" aria-label="Whose history">
          {p.onScope ? (
            <>
              <button type="button" className="threshold-action" aria-pressed={!sampleScope} onClick={() => p.onScope?.('real')}>
                Saved records
              </button>
              <button type="button" className="threshold-action" aria-pressed={sampleScope} onClick={() => p.onScope?.('sample')}>
                Sample athlete
              </button>
            </>
          ) : (
            <span className="history-scope-fixed">{sampleScope ? 'Sample athlete / synthetic' : `${p.athleteName ?? 'Athlete'} / saved records`}</span>
          )}
        </div>
      </header>

      {p.empty ? (
        <section className="history-empty-state">
          <TechnicalCorners />
          <span className="threshold-code">{p.empty.code}</span>
          <h4>{p.empty.title}</h4>
          <p>{p.empty.text}</p>
          {p.empty.actions && <div className="history-empty-actions">{p.empty.actions}</div>}
        </section>
      ) : (
        <>
          <div className="history-filters" role="group" aria-label="Filter by movement">
            <span>{sampleScope ? 'Synthetic sample / in memory only' : `${p.athleteName ?? 'Athlete'} / stored on this device`}</span>
            <button type="button" className="threshold-action" aria-pressed={p.movement === null} onClick={() => p.onMovement(null)}>
              All movements
            </button>
            {p.movements.map((m) => (
              <button key={m.protocolId} type="button" className="threshold-action" aria-pressed={p.movement === m.protocolId} onClick={() => p.onMovement(m.protocolId)}>
                {m.title}
              </button>
            ))}
            <button type="button" className="threshold-action history-compare-toggle" aria-pressed={p.compare} onClick={p.onCompare}>
              {p.compare ? 'Comparing' : 'Compare with earlier'}
            </button>
          </div>
          <div className="history-layout">
            <div className="history-session-list" ref={list} role="group" aria-label={`${plural(p.entries.length, 'stored set')}`}>
              {p.entries.map((e) => {
                const r = e.record;
                const on = r.id === p.selectedId;
                return (
                  <button key={r.id} type="button" className={`threshold-action ${on ? 'is-active' : ''}`} aria-pressed={on} onClick={() => p.onSelect(r.id)}>
                    <span>{relativeDay(r.startedAt, p.now)}</span>
                    <strong>{e.title}</strong>
                    <small>
                      {plural(r.totalReps, 'rep')} / {r.heldReps} at usual form / {r.breakpointRep !== null ? `alert\u00a0rep\u00a0${r.breakpointRep}` : 'no\u00a0alert'}
                    </small>
                    {!r.quality.eligible && <em>Not counted</em>}
                  </button>
                );
              })}
            </div>
            {p.selected && (
              <section className="history-detail" key={p.selectedId ?? 'none'} aria-label="Selected session">
                <div className="history-detail-heading">
                  <div>
                    <span className="threshold-code">{sampleScope ? 'Selected synthetic session' : 'Selected session'}</span>
                    <h4>{p.selected.title}</h4>
                    <p>
                      {p.selected.endedAt ? relativeDay(p.selected.endedAt, p.now) : ''}
                      {' / '}
                      {p.selected.eligible ? 'counts toward records' : `not counted: ${p.selected.ineligibleReasons[0]?.toLowerCase() ?? 'conditions not comparable'}`}
                    </p>
                  </div>
                  <div>
                    <span>Reps held</span>
                    <strong>{p.selected.heldReps}</strong>
                  </div>
                </div>
                <TelemetryChart model={chartModel(p.selected)} levelsNote={p.selected.levelsNote} levelsRule={p.selected.levels?.rule} />
                <div className="history-detail-facts">
                  <div>
                    <span>Change began</span>
                    <strong>{p.selected.onsetRep !== null ? `Around rep ${p.selected.onsetRep}` : p.selected.alertRep !== null ? 'Not estimated' : 'No change'}</strong>
                  </div>
                  <div>
                    <span>Alert</span>
                    <strong className={p.selected.alertRep !== null ? 'is-alert' : ''}>{p.selected.alertRep !== null ? `Rep ${p.selected.alertRep}` : 'None'}</strong>
                  </div>
                  <div>
                    <span>Recovery</span>
                    <strong>
                      {p.selected.recovery
                        ? `${Math.round(p.selected.recovery.percent * 100)}% / ${RECOVERY_WORDS[p.selected.recovery.status]}`
                        : p.selected.alertRep !== null
                          ? 'Not run'
                          : 'Not needed'}
                    </strong>
                  </div>
                </div>
                {p.compare && p.comparison && <ComparisonPanel comparison={p.comparison} selected={p.selected} now={p.now} />}
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ComparisonPanel({ comparison: c, selected, now }: { comparison: Comparison; selected: PostSet; now: Date }) {
  if (c.kind === 'no-earlier') {
    return (
      <div className="history-compare" role="note">
        <span>Comparison / {selected.title}</span>
        <strong>No earlier set of this movement to compare with.</strong>
        <p>Comparisons use the same athlete, source, movement and detector version.</p>
      </div>
    );
  }
  if (c.kind === 'not-comparable') {
    return (
      <div className="history-compare is-blocked" role="note">
        <span>Comparison / not comparable</span>
        <strong>This set cannot be compared with the one before it{c.previous ? ` (${inSentence(c.previous.startedAt, now)})` : ''}.</strong>
        <ul>
          {c.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
    );
  }
  const d = c.heldDelta;
  return (
    <div className="history-compare" role="note">
      <span>Comparison / same athlete, movement and detector</span>
      <strong>
        Held {plural(selected.heldReps, 'rep')} at usual form, {d === 0 ? 'the same as' : `${Math.abs(d)} ${d > 0 ? 'more' : 'fewer'} than`} the set {inSentence(c.previous.startedAt, now)} ({c.previous.heldReps}).
      </strong>
      <p>Only reps held at usual form are compared. Reaching the alert is never rewarded.</p>
    </div>
  );
}
