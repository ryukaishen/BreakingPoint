import type { ReactNode } from 'react';
import type { HeldRecord } from '../progress/records';
import { heldReps } from '../progress/records';
import { useLabels } from '../protocols/labels';
import type { LaunchContext } from '../protocols/launch';
import { sessionPattern } from '../protocols/patterns';
import type { Snapshot } from '../session/engine';
import { exportCsv, exportJson } from '../session/export';
import { arrow, fmt } from '../utils/format';
import { useDialog } from '../utils/hooks';
import { FormDrawdown } from './FormDrawdown';
import { Check, Close, Download } from './Icons';

interface Props {
  snap: Snapshot;
  launch: LaunchContext;
  /** Personal-best comparison for this set; null for demo runs. */
  heldRecord: HeldRecord | null;
  onClose: () => void;
  onRecovery: () => void;
  onNewSet: () => void;
}

type TileState = 'done' | 'alert' | 'pending' | 'plain';

function RecordTile({ state, label, value, sub, children }: { state: TileState; label: string; value: string; sub?: string; children?: ReactNode }) {
  return (
    <div className={`record-tile ${state}`}>
      <div className="rt-head">
        <span>{label}</span>
        {(state === 'done' || state === 'pending') && (
          <span className="rt-mark" aria-hidden>
            {state === 'done' && <Check size={9} />}
          </span>
        )}
      </div>
      <div className="rt-v">{value}</div>
      {sub && <div className="rt-s">{sub}</div>}
      {children}
    </div>
  );
}

export function SummaryModal({ snap, launch, heldRecord, onClose, onRecovery, onNewSet }: Props) {
  const sm = snap.summary;
  const L = useLabels(snap.exercise);
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  if (!sm) return null;
  const top = sm.topChanges[0];
  const pattern = sm.breakpointRep !== null ? sessionPattern(snap.exercise, snap.monitorReps, snap.onsetRep, snap.baseline?.reference.sigma0, launch.patternLabels) : null;
  const held = heldReps(snap.monitorReps);
  const rec = snap.recovery;
  const heldSub =
    snap.mode === 'demo'
      ? 'Personal bests are saved from live sessions only'
      : heldRecord?.isNewBest
        ? `New personal best (previous ${heldRecord.previousBest})`
        : heldRecord?.previousBest !== null && heldRecord?.previousBest !== undefined
          ? `Personal best ${heldRecord.previousBest}`
          : 'First recorded set for this movement';
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal sys-window" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="summary-title" tabIndex={-1} ref={dialogRef}>
        <div className="modal-header">
          <div>
            <div className="eyebrow">
              Set record, {snap.mode === 'demo' ? 'demo dataset' : 'live session'}
            </div>
            <h2 id="summary-title">
              {sm.athlete}: {launch.contextName} / {launch.title}
            </h2>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </div>
        <div className="modal-body col" style={{ gap: 14 }}>
          <div className="set-record">
            <RecordTile
              state={snap.baseline ? 'done' : 'pending'}
              label="Baseline locked"
              value={snap.baseline ? `${snap.baseline.nReps} reps` : '—'}
              sub="fresh calibration reps"
            />
            <RecordTile state={heldRecord?.isNewBest ? 'done' : 'plain'} label="Held at baseline" value={`${held} rep${held === 1 ? '' : 's'}`} sub={heldSub} />
            <RecordTile
              state={sm.breakpointRep !== null ? 'alert' : 'plain'}
              label="Breaking point"
              value={sm.breakpointRep !== null ? `Rep ${sm.breakpointRep}` : 'None'}
              sub={sm.onsetRep && sm.breakpointRep ? `drift onset ≈ rep ${sm.onsetRep}` : 'no persistent drift this set'}
            />
            {rec ? (
              <RecordTile state="done" label="Recovery check" value={`${(rec.percent * 100).toFixed(0)}%`} sub="returned toward your baseline" />
            ) : sm.breakpointRep !== null ? (
              <RecordTile state="pending" label="Recovery check" value="Not run" sub="3 reps after a rest">
                {snap.phase === 'summary' && (
                  <button className="btn primary sm" onClick={onRecovery}>
                    Run recovery check
                  </button>
                )}
              </RecordTile>
            ) : (
              <RecordTile state="plain" label="Recovery check" value="Not needed" sub="no breaking point this set" />
            )}
          </div>

          <div className="kpis">
            <div className="kpi">
              <div className="k">Reps</div>
              <div className="v">{sm.totalReps}</div>
              <div className="s">{sm.scoredReps} scored</div>
            </div>
            <div className="kpi">
              <div className="k">Avg drift before</div>
              <div className="v">{fmt(sm.avgPre)}</div>
              <div className="s">σ RMS from baseline</div>
            </div>
            <div className="kpi">
              <div className="k">Avg drift after</div>
              <div className={`v ${sm.avgPost !== null ? 'c-break' : ''}`}>{fmt(sm.avgPost)}</div>
              <div className="s">{sm.postReps} reps after the breaking point</div>
            </div>
            <div className="kpi">
              <div className="k">Largest change</div>
              <div className="v" style={{ fontSize: 20, lineHeight: 1.25 }}>
                {top ? `${L.short(top.key)} ${arrow(top.meanZ)}` : '—'}
              </div>
              <div className="s">{top ? `${top.meanZ >= 0 ? '+' : '−'}${Math.abs(top.meanZ).toFixed(1)}σ average (${top.meanZ > 0 ? top.upWord : top.downWord})` : ''}</div>
            </div>
          </div>

          {pattern && (
            <div className="panel pattern-panel">
              <span className="k">Movement pattern</span>
              <span className="pattern-tag">{pattern.label}</span>
              <span className="muted">{pattern.explain}</span>
              {pattern.secondary && <span className="dim">Also {pattern.secondary.label.toLowerCase()}.</span>}
            </div>
          )}
          <div className="panel chart-card">
            <div className="chart-head">
              <h2>Form drawdown</h2>
            </div>
            <FormDrawdown
              reps={snap.monitorReps}
              thresholds={snap.thresholds}
              cusumH={snap.config.cusumH}
              mode={snap.config.mode}
              alarmRep={snap.alarmRep}
              onsetRep={snap.onsetRep}
              exercise={snap.exercise}
              height={190}
            />
          </div>
          {sm.topChanges.length > 0 && (
            <div className="panel">
              <div className="panel-title">Primary changes</div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                {sm.topChanges.map((c) => (
                  <span key={c.key} className="metric-chip" style={{ borderColor: Math.abs(c.meanZ) >= 2 ? 'var(--break)' : undefined }}>
                    {L.short(c.key)} {arrow(c.meanZ)}{' '}
                    <span className="mono">
                      {c.meanZ >= 0 ? '+' : '−'}
                      {Math.abs(c.meanZ).toFixed(1)}σ
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="panel" style={{ borderLeft: `2px solid ${sm.breakpointRep ? 'var(--drift)' : 'var(--stable)'}` }}>
            <b>Recommendation.</b> {sm.recommendation}
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => exportJson(snap, launch)}>
              <Download size={15} /> Export JSON
            </button>
            <button className="btn" onClick={() => exportCsv(snap)}>
              <Download size={15} /> Export CSV
            </button>
            <span className="grow" />
            <button className="btn ghost" onClick={onNewSet}>
              New set
            </button>
          </div>
          <div className="disclaimer">
            {sm.disclaimer} Movement-pattern labels describe changes in movement only. Exports contain derived numeric features only, never video.
          </div>
        </div>
      </div>
    </div>
  );
}
