import type { Snapshot } from '../session/engine';
import { exportCsv, exportJson } from '../session/export';
import { arrow, fmt } from '../utils/format';
import { FormDrawdown } from './FormDrawdown';
import { Close, Download } from './Icons';

interface Props {
  snap: Snapshot;
  onClose: () => void;
  onRecovery: () => void;
  onNewSet: () => void;
}

export function SummaryModal({ snap, onClose, onRecovery, onNewSet }: Props) {
  const sm = snap.summary;
  if (!sm) return null;
  const top = sm.topChanges[0];
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Session summary">
        <div className="modal-header">
          <div>
            <div className="eyebrow">Session summary · {snap.mode === 'demo' ? 'Demo dataset' : 'Live session'}</div>
            <h2>
              {sm.athlete} · {snap.exercise === 'squat' ? 'Bodyweight squat' : 'Countermovement jump'}
            </h2>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </div>
        <div className="modal-body col" style={{ gap: 14 }}>
          <div className="kpis">
            <div className="kpi">
              <div className="k">Total reps</div>
              <div className="v">{sm.totalReps}</div>
              <div className="s">{sm.scoredReps} scored</div>
            </div>
            <div className="kpi" style={{ borderColor: sm.breakpointRep ? 'rgba(255,77,94,0.5)' : undefined }}>
              <div className="k">Breaking point</div>
              <div className="v" style={{ color: sm.breakpointRep ? '#ff4d5e' : '#2ee59d' }}>{sm.breakpointRep ? `Rep ${sm.breakpointRep}` : 'None'}</div>
              <div className="s">{sm.onsetRep && sm.breakpointRep ? `drift onset ≈ rep ${sm.onsetRep}` : 'no persistent drift'}</div>
            </div>
            <div className="kpi">
              <div className="k">Stable reps</div>
              <div className="v c-stable">{sm.stableReps}</div>
              <div className="s">before the breaking point</div>
            </div>
            <div className="kpi">
              <div className="k">Post-breaking point</div>
              <div className="v c-break">{sm.postReps}</div>
              <div className="s">reps with persistent drift</div>
            </div>
          </div>
          <div className="kpis">
            <div className="kpi">
              <div className="k">Avg drift · pre</div>
              <div className="v">{fmt(sm.avgPre)}</div>
              <div className="s">σ RMS from baseline</div>
            </div>
            <div className="kpi">
              <div className="k">Avg drift · post</div>
              <div className="v c-break">{fmt(sm.avgPost)}</div>
              <div className="s">σ RMS from baseline</div>
            </div>
            <div className="kpi" style={{ gridColumn: 'span 2' }}>
              <div className="k">Largest mechanical drift</div>
              <div className="v" style={{ fontSize: 22 }}>{top ? `${top.label} ${arrow(top.meanZ)}` : '—'}</div>
              <div className="s">{top ? `${top.meanZ >= 0 ? '+' : '−'}${Math.abs(top.meanZ).toFixed(1)}σ average after the breaking point (${top.meanZ > 0 ? top.upWord : top.downWord})` : ''}</div>
            </div>
          </div>
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
                  <span key={c.key} className="chip" style={{ borderColor: Math.abs(c.meanZ) >= 2 ? 'rgba(255,77,94,0.5)' : undefined }}>
                    {c.short} {arrow(c.meanZ)} <span className="mono">{c.meanZ >= 0 ? '+' : '−'}{Math.abs(c.meanZ).toFixed(1)}σ</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="panel" style={{ borderColor: sm.breakpointRep ? 'rgba(255,176,32,0.4)' : undefined }}>
            <b>Recommendation.</b> {sm.recommendation}
          </div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {sm.breakpointRep !== null && snap.phase === 'summary' && (
              <button className="btn primary" onClick={onRecovery}>
                Run recovery check
              </button>
            )}
            <button className="btn" onClick={() => exportJson(snap)}>
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
          <div className="disclaimer">{sm.disclaimer} Exports contain derived numeric features only — never video.</div>
        </div>
      </div>
    </div>
  );
}
