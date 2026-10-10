// Detector evidence for coaches and advanced users: drift score, smoothed
// drift (EWMA), CUSUM, thresholds, ranked feature changes, the baseline, the
// form drawdown chart and per-rep measurements. Hidden from the athlete view
// by default; the athlete view never needs any of it to act safely.

import type { Baseline } from '../../baseline/baseline';
import { featureSpecs, formatFeatureValue, formatWithUnit, type ExerciseType } from '../../biomechanics/catalog';
import type { FeatureDeviation } from '../../detection/driftScore';
import { useLabels } from '../../protocols/labels';
import type { LaunchContext } from '../../protocols/launch';
import { sessionPattern } from '../../protocols/patterns';
import type { RepRecord, Snapshot } from '../../session/engine';
import { C } from '../../ui/theme';
import { arrow, fmt, fmtSigma, pct, STATE_COLOR, STATE_LABEL } from '../../utils/format';
import { FormDrawdown } from '../FormDrawdown';
import { Close } from '../Icons';
import { RepTimeline } from '../RepTimeline';

export function zColor(z: number) {
  const a = Math.abs(z);
  return a >= 2 ? C.break : a >= 1 ? C.drift : C.muted;
}

export function Contributors({ devs, exercise, max = 4 }: { devs: FeatureDeviation[]; exercise: ExerciseType; max?: number }) {
  const L = useLabels(exercise);
  if (!devs.length) return <div className="muted" style={{ fontSize: 13 }}>No scored features yet.</div>;
  return (
    <div className="contrib-list">
      {devs.slice(0, max).map((d, i) => {
        const z = d.zClipped ?? 0;
        const w = Math.min(50, (Math.abs(z) / 4) * 50);
        return (
          <div className="contrib-row" key={d.key}>
            <span className="rank">{i + 1}</span>
            <span className="name">
              {L.short(d.key)}
              <small>{z > 0 ? L.up(d.key) : L.down(d.key)}</small>
            </span>
            <span className="zbar">
              <span className="mid" />
              <span className="f" style={{ background: zColor(z), left: z >= 0 ? '50%' : `${50 - w}%`, width: `${w}%` }} />
            </span>
            <span className="z" style={{ color: zColor(z) }}>
              {fmtSigma(z)} {arrow(z)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function BaselineTable({ baseline, exercise }: { baseline: Baseline; exercise: ExerciseType }) {
  const L = useLabels(exercise);
  return (
    <table className="baseline-table">
      <thead>
        <tr>
          <th>Measurement</th>
          <th style={{ textAlign: 'right' }}>Your typical</th>
          <th style={{ textAlign: 'right' }}>Normal ±</th>
        </tr>
      </thead>
      <tbody>
        {featureSpecs(exercise).map((s) => {
          const b = baseline.features[s.key];
          return (
            <tr key={s.key}>
              <td>{L.short(s.key)}</td>
              {b ? (
                <>
                  <td className="num">{formatWithUnit(s, b.center)}</td>
                  <td className="num muted">±{formatFeatureValue(s, b.scale)}</td>
                </>
              ) : (
                <td colSpan={2} className="num excluded">
                  excluded (low confidence)
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Gauge({ label, value, max, ticks, color, valueText }: { label: string; value: number; max: number; ticks: number[]; color: string; valueText: string }) {
  return (
    <div className="gauge">
      <div className="top">
        <span>{label}</span>
        <span className="mono">{valueText}</span>
      </div>
      <div className="bar">
        <div className="f" style={{ transform: `scaleX(${Math.max(0, Math.min(1, value / max))})`, background: color }} />
        {ticks.map((t, i) => (
          <div key={i} className="tick" style={{ left: `${Math.min(100, (t / max) * 100)}%` }} />
        ))}
      </div>
    </div>
  );
}

function RepDetail({ rep, baseline, exercise, onClose }: { rep: RepRecord; baseline: Baseline | null; exercise: ExerciseType; onClose: () => void }) {
  const st = rep.step;
  const L = useLabels(exercise);
  return (
    <div className="panel rep-detail">
      <div className="panel-title">
        <span>
          Rep {rep.index} measurements {st && <span style={{ color: STATE_COLOR[st.state], marginLeft: 8 }}>{STATE_LABEL[st.state]}</span>}
        </span>
        <button className="btn ghost sm" onClick={onClose} aria-label="Close rep measurements">
          <Close size={14} />
        </button>
      </div>
      <div className="rep-stats">
        <span>
          Drift <b className="mono">{fmt(rep.drift?.score)}</b>
        </span>
        <span>
          Duration <b className="mono">{(rep.tEnd - rep.tStart).toFixed(2)}s</b>
        </span>
        <span>
          Capture <b className="mono">{pct(rep.quality, 0)}</b>
        </span>
      </div>
      <div className="feat hdr">
        <span>Measurement</span>
        <span className="num">This rep</span>
        <span className="num">Baseline</span>
        <span className="num">z</span>
      </div>
      {featureSpecs(exercise).map((s) => {
        const d = rep.drift?.deviations.find((x) => x.key === s.key);
        const b = baseline?.features[s.key];
        return (
          <div className="feat" key={s.key}>
            <span>{L.short(s.key)}</span>
            <span className="num">{formatWithUnit(s, rep.features.values[s.key])}</span>
            <span className="num muted">{b ? formatFeatureValue(s, b.center) : '—'}</span>
            <span className="num" style={{ color: d?.used ? zColor(d.zClipped ?? 0) : C.dim }}>
              {d?.used ? fmtSigma(d.zClipped) : d?.reason === 'low-quality' ? 'low conf.' : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function FocusMetrics({ snap, launch }: { snap: Snapshot; launch: LaunchContext }) {
  const L = useLabels(snap.exercise);
  const last = [...snap.monitorReps].reverse().find((r) => r.drift?.score !== null && r.drift?.score !== undefined);
  return (
    <div className="panel">
      <div className="panel-title">
        <span>{launch.contextName} focus metrics</span>
        {last && <span className="meta">rep {last.index}</span>}
      </div>
      <div className="focus-grid">
        {launch.focus.map((k) => {
          const d = last?.drift?.deviations.find((x) => x.key === k);
          const z = d?.used ? (d.zClipped ?? 0) : null;
          return (
            <div key={k} className="focus-cell">
              <span className="fk">{L.short(k)}</span>
              <span className="fz" style={{ color: z === null ? C.dim : zColor(z) }}>
                {z === null ? '—' : `${fmtSigma(z)} ${arrow(z)}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  snap: Snapshot;
  launch: LaunchContext;
  athleteName: string;
  selectedRep: number | null;
  onSelectRep: (r: number | null) => void;
}

export function Evidence({ snap: s, launch, athleteName, selectedRep, onSelectRep }: Props) {
  const L = useLabels(s.exercise);
  const th = s.thresholds;
  const lastScored = [...s.monitorReps].reverse().find((r) => r.drift?.score !== null && r.drift?.score !== undefined);
  const frozen = s.breakpointContributors;
  const devs = frozen ?? lastScored?.drift?.ranked ?? [];
  const mode = s.config.mode;
  const sel = selectedRep !== null ? s.monitorReps.find((r) => r.index === selectedRep) : null;
  const pattern = s.alarmRep !== null ? sessionPattern(s.exercise, s.monitorReps, s.onsetRep, s.baseline?.reference.sigma0, launch.patternLabels) : null;
  const maxScore = Math.max(1, ...s.monitorReps.map((r) => r.drift?.score ?? 0));
  const triggerText =
    mode === 'ewma'
      ? `The breaking point fires when smoothed drift (EWMA) crosses ${fmt(th?.breakpointLevel)}` +
        (s.config.minimumPersistentReps > 0 ? ` after ${s.config.minimumPersistentReps} or more elevated reps.` : '. One odd rep moves it at most partway.')
      : mode === 'cusum'
        ? `The breaking point fires when CUSUM evidence exceeds h = ${s.config.cusumH}.`
        : mode === 'combined'
          ? 'The breaking point fires when EWMA and CUSUM both confirm persistent drift.'
          : `The breaking point fires after ${Math.max(1, s.config.minimumPersistentReps)} consecutive reps above the line.`;

  return (
    <section className="evidence" aria-labelledby="evidence-title">
      <h2 id="evidence-title" className="evidence-title">
        Detector evidence <small>for coaches and advanced users</small>
      </h2>
      <div className="evidence-grid">
        <div className="panel">
          <div className="metrics-row">
            <div>
              <div className="panel-title" style={{ marginBottom: 6 }}>
                Movement drift score
              </div>
              <div className="metric-big">
                <span className="v" style={{ color: lastScored?.step ? STATE_COLOR[lastScored.step.state] : C.text }}>{fmt(lastScored?.drift?.score)}</span>
                <span className="u">σ RMS</span>
              </div>
              <div className="metric-cap">
                Latest scored rep against your baseline. Your normal range ends at <span className="mono">{fmt(th?.normalUpper)}</span>.
              </div>
            </div>
            <div>
              <Gauge
                label="Smoothed drift (EWMA)"
                value={lastScored?.step?.ewmaLevel ?? th?.mu0 ?? 0}
                max={(th?.breakpointLevel ?? 2) * 1.35}
                ticks={th ? [th.warningLevel, th.breakpointLevel] : []}
                color={lastScored?.step ? STATE_COLOR[lastScored.step.state] : C.stable}
                valueText={`${fmt(lastScored?.step?.ewmaLevel)} · line ${fmt(th?.breakpointLevel)}`}
              />
              <Gauge
                label={mode === 'cusum' || mode === 'combined' ? 'Persistence evidence (CUSUM)' : 'CUSUM, used to estimate drift onset'}
                value={lastScored?.step?.cusum ?? 0}
                max={s.config.cusumH * 1.4}
                ticks={mode === 'cusum' || mode === 'combined' ? [s.config.cusumH] : []}
                color={C.evidence}
                valueText={fmt(lastScored?.step?.cusum, 1)}
              />
            </div>
          </div>
          <div className="trigger-note">{triggerText}</div>
        </div>

        <div className="panel">
          <div className="panel-title">
            <span>{frozen ? `Why rep ${s.alarmRep} was flagged` : 'What changed'}</span>
            {frozen ? <span className="frozen-tag code">Frozen at the breaking point</span> : lastScored && <span className="meta">rep {lastScored.index}</span>}
          </div>
          <Contributors devs={devs} exercise={s.exercise} />
          {pattern && (
            <div className="pattern-line" title={pattern.explain}>
              <span className="k">Movement pattern</span>
              <span className="pattern-tag">{pattern.label}</span>
            </div>
          )}
        </div>

        <FocusMetrics snap={s} launch={launch} />

        {s.baseline && (
          <div className="panel">
            <div className="panel-title">
              <span>{athleteName}'s baseline</span>
              <span className="meta">
                {s.baseline.nReps} fresh reps, in-control drift {fmt(s.baseline.reference.mu0)} ± {fmt(s.baseline.reference.sigma0)}
              </span>
            </div>
            <BaselineTable baseline={s.baseline} exercise={s.exercise} />
          </div>
        )}
      </div>

      <div className="panel chart-card">
        <div className="chart-head">
          <h3>
            Form drawdown
            <small>Drift per rep against {athleteName}'s personal baseline</small>
          </h3>
          <div className="legend">
            <span><i className="box" style={{ background: C.stable, opacity: 0.3 }} />your normal range</span>
            <span><i className="box" style={{ background: C.stable, opacity: 0.7 }} />drift per rep</span>
            <span><i style={{ background: C.text, height: 3 }} />smoothed drift (EWMA)</span>
            <span><i style={{ background: C.drift }} />warning</span>
            <span><i style={{ background: C.break }} />breaking point</span>
            <span><i style={{ background: C.evidence }} />CUSUM evidence</span>
          </div>
        </div>
        <FormDrawdown
          reps={s.monitorReps}
          thresholds={s.thresholds}
          cusumH={s.config.cusumH}
          mode={s.config.mode}
          alarmRep={s.alarmRep}
          onsetRep={s.onsetRep}
          exercise={s.exercise}
          selected={selectedRep}
          onSelect={onSelectRep}
          height={200}
        />
        <div className="chart-caption">
          {s.alarmRep !== null ? (
            <span>
              <b className="c-break">Breaking point at rep {s.alarmRep}.</b> Drift began around rep {s.onsetRep}. Primary changes:{' '}
              <b>{(frozen ?? []).slice(0, 3).map((d) => `${L.short(d.key)} ${arrow(d.zClipped ?? 0)}`).join(', ')}</b>
            </span>
          ) : s.monitorReps.length ? (
            <span>
              No persistent drift. {s.monitorReps.length} rep{s.monitorReps.length > 1 ? 's' : ''} scored against your baseline.
            </span>
          ) : (
            <span className="muted">The chart fills in as monitored reps are completed. Select a bar for its measurements.</span>
          )}
        </div>
        <RepTimeline reps={s.monitorReps} alarmRep={s.alarmRep} selected={selectedRep} onSelect={onSelectRep} maxScore={maxScore} />
      </div>
      {sel && <RepDetail rep={sel} baseline={s.baseline} exercise={s.exercise} onClose={() => onSelectRep(null)} />}
    </section>
  );
}
