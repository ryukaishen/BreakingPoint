import type { ReactNode } from 'react';
import type { FeatureLabeler } from '../../protocols/labels';
import { chartModel, type PostSet, type RecoveryState } from '../../session/postWorkout';
import { DISCLAIMER } from '../../session/summary';
import { fmt } from '../../utils/format';
import { TelemetryChart } from './TelemetryChart';

interface Props {
  set: PostSet;
  labels: FeatureLabeler;
  /** "Live session", "Demo dataset" or "Saved set". */
  recordKind: string;
  /** When the set ended, in words. */
  when: string;
  recoveryState: RecoveryState;
  /** Export through the session's existing JSON/CSV functions; null for a stored set. */
  exports: { onJson: () => void; onCsv: () => void } | null;
  actions?: ReactNode;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

const RECOVERY_WORDS: Record<string, string> = {
  recovered: 'back to your usual form',
  partial: 'partly back',
  persistent: 'still different',
};

/** Make's set record: rail, rep-by-rep telemetry, biggest changes and readout, from one real set. */
export function SummaryPanel({ set, labels: L, recordKind, when, recoveryState, exports, actions }: Props) {
  const o = set.outcome;
  const heldNote = !set.recordId
    ? 'not saved'
    : set.eligible === false
      ? `not counted: ${set.ineligibleReasons[0]?.toLowerCase() ?? 'conditions not comparable'}`
      : !o
        ? 'counts toward records'
        : o.kind === 'new-record'
          ? `new record (previous best ${o.previousBest})`
          : o.kind === 'first-record'
            ? 'first recorded set: the line to beat'
            : `your best is ${o.previousBest}`;
  const r = set.recovery;
  const rail: { label: string; value: string; note: string; tone?: 'alert' | 'done' }[] = [
    { label: 'Baseline locked', value: set.baselineReps !== null ? plural(set.baselineReps, 'rep') : '—', note: 'fresh calibration reps', tone: 'done' },
    { label: 'Reps at usual form', value: plural(set.heldReps, 'rep'), note: heldNote, tone: o?.kind === 'new-record' ? 'done' : undefined },
    {
      label: 'Breaking point',
      value: set.alertRep !== null ? `Rep ${set.alertRep}` : 'None',
      note: set.alertRep !== null ? (set.onsetRep !== null ? `changes began around rep ${set.onsetRep}` : 'alert this set') : 'no alert this set',
      tone: set.alertRep !== null ? 'alert' : undefined,
    },
    r
      ? { label: 'Recovery check', value: `${Math.round(r.percent * 100)}%`, note: `of the change gone, ${RECOVERY_WORDS[r.status]}` }
      : recoveryState === 'active' || recoveryState === 'insufficient'
        ? { label: 'Recovery check', value: 'Running', note: '3 reps against your usual form' }
        : set.alertRep !== null
          ? { label: 'Recovery check', value: 'Not run', note: '3 reps after a rest' }
          : { label: 'Recovery check', value: 'Not needed', note: 'no alert this set' },
  ];
  const chart = chartModel(set);

  return (
    <div className="summary-system">
      <div className="summary-heading">
        <div>
          <span className="threshold-code">Set record / {recordKind}</span>
          <h3>{set.athlete}</h3>
          <p>
            {set.contextName} / {set.title}, {when}
          </p>
        </div>
        <div className="summary-export-actions">
          {exports ? (
            <>
              <button type="button" className="threshold-action" onClick={exports.onJson}>
                Export JSON
              </button>
              <button type="button" className="threshold-action" onClick={exports.onCsv}>
                Export CSV
              </button>
            </>
          ) : (
            <p className="summary-export-note">Exports are made from the set screen right after a set. Stored sets keep scores only.</p>
          )}
        </div>
      </div>

      <div className="summary-record-rail">
        {rail.map((x) => (
          <div key={x.label} className={x.tone === 'alert' ? 'is-alert' : x.tone === 'done' ? 'is-done' : ''}>
            <span>{x.label}</span>
            <strong>{x.value}</strong>
            <small>{x.note}</small>
          </div>
        ))}
      </div>

      <section className="summary-chart-panel" aria-labelledby={`chart-${set.recordId ?? 'now'}`}>
        <div className="summary-panel-heading">
          <div>
            <span className="threshold-code">Rep-by-rep telemetry</span>
            <h4 id={`chart-${set.recordId ?? 'now'}`}>Form Changes Over Time</h4>
          </div>
          <p>Form Change Score for each rep, compared with this athlete&apos;s baseline.</p>
        </div>
        <TelemetryChart model={chart} levelsNote={set.levelsNote} levelsRule={set.levels?.rule} />
      </section>

      <div className="summary-lower-grid">
        <section className="summary-changes" aria-label="Biggest changes">
          <span className="threshold-code">Biggest changes{set.pattern ? ` / ${set.pattern.label}` : ''}</span>
          {set.pattern && <p className="summary-pattern">{set.pattern.explain}</p>}
          {set.changes.length ? (
            set.changes.map((c, i) => (
              <div key={c.key} title={`${c.meanZ >= 0 ? '+' : '−'}${Math.abs(c.meanZ).toFixed(1)}σ: change from your usual form in multiples of your normal rep-to-rep variation`}>
                <span>{String(i + 1).padStart(2, '0')}</span>
                <strong>{L.short(c.key)}</strong>
                <b>
                  {c.meanZ >= 0 ? '↑' : '↓'} {Math.abs(c.meanZ).toFixed(1)}×
                </b>
                <small>{c.meanZ >= 0 ? L.up(c.key) : L.down(c.key)}</small>
              </div>
            ))
          ) : (
            <p className="summary-pattern">No measurement could be compared for this set.</p>
          )}
          {set.changes.length > 0 && <p className="summary-changes-key">× = times your usual rep-to-rep variation</p>}
        </section>
        <section className="summary-readout" aria-label="Readout">
          <div>
            <span>Reps</span>
            <strong>{set.totalReps}</strong>
            <small>{set.scoredReps} scored</small>
          </div>
          <div>
            <span>After the alert</span>
            <strong>{set.postReps}</strong>
            <small>{set.alertRep !== null ? `reps from rep ${set.alertRep}` : 'no alert'}</small>
          </div>
          <div>
            <span>Average score before</span>
            <strong>{fmt(set.avgPre)}</strong>
          </div>
          <div>
            <span>Average score after</span>
            <strong className={set.avgPost !== null ? 'is-alert' : ''}>{fmt(set.avgPost)}</strong>
          </div>
          <p>
            {set.explanation && (
              <>
                {set.explanation}
                <br />
              </>
            )}
            {set.recommendation}
          </p>
          <p className="summary-disclaimer">
            {DISCLAIMER} Pattern labels describe how movement changed, not why. Exports contain measurements only, never video.
          </p>
          {actions}
        </section>
      </div>
    </div>
  );
}
