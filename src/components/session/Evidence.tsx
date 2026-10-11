// Detector evidence for coaches and advanced users: the Form Change Score, its
// trend (EWMA) and build-up of change (CUSUM), thresholds, ranked measurement
// changes, the baseline, the chart of every rep and per-rep measurements.
// Hidden from the athlete view by default in live sessions; the athlete view
// never needs any of it to act safely.

import type { Baseline } from '../../baseline/baseline';
import { featureSpecs, formatFeatureValue, formatWithUnit, type ExerciseType } from '../../biomechanics/catalog';
import type { FeatureDeviation } from '../../detection/driftScore';
import { useLabels } from '../../protocols/labels';
import type { LaunchContext } from '../../protocols/launch';
import { sessionPattern } from '../../protocols/patterns';
import { RECOVERY_REPS, type RepRecord, type Snapshot } from '../../session/engine';
import { explainAlert } from '../../session/explain';
import { C } from '../../ui/theme';
import { arrow, fmt, fmtSigma, pct, STATE_COLOR, STATE_LABEL } from '../../utils/format';
import { FormDrawdown } from '../FormDrawdown';
import { Close } from '../Icons';
import { RepTimeline } from '../RepTimeline';

const SCORE_TIP =
  'How different a rep is from your usual form, across all measurements. Higher means more different, in either direction. It is not a percentage, and it does not measure fatigue or injury risk.';
const SIGMA_TIP = 'Change from your usual form, in multiples of your normal rep-to-rep variation (σ). Arrows show the direction.';

export function zColor(z: number) {
  const a = Math.abs(z);
  return a >= 2 ? C.break : a >= 1 ? C.drift : C.muted;
}

export function Contributors({ devs, exercise, max = 4 }: { devs: FeatureDeviation[]; exercise: ExerciseType; max?: number }) {
  const L = useLabels(exercise);
  if (!devs.length) return <div className="muted" style={{ fontSize: 13 }}>No scored measurements yet.</div>;
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
            <span className="z" style={{ color: zColor(z) }} title={SIGMA_TIP}>
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
          <th style={{ textAlign: 'right' }}>Your usual</th>
          <th style={{ textAlign: 'right' }} title="Your normal rep-to-rep variation">
            Normal ±
          </th>
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
                  not used (camera view unclear)
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
        <span title={SCORE_TIP}>
          Form Change Score <b className="mono">{fmt(rep.drift?.score)}</b>
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
        <span className="num">Usual</span>
        <span className="num" title={SIGMA_TIP}>
          Change
        </span>
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
              {d?.used ? fmtSigma(d.zClipped) : d?.reason === 'low-quality' ? 'unclear' : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Sport-featured measurements for the latest scored rep (display only; the ranking above stays by size of change). */
function FocusMetrics({ snap, launch }: { snap: Snapshot; launch: LaunchContext }) {
  const L = useLabels(snap.exercise);
  const last = [...snap.monitorReps].reverse().find((r) => r.drift?.score !== null && r.drift?.score !== undefined);
  return (
    <div className="panel">
      <div className="panel-title">
        <span>{launch.contextName} focus measurements</span>
        {last && <span className="meta">rep {last.index}</span>}
      </div>
      <div className="focus-grid">
        {launch.focus.map((k) => {
          const d = last?.drift?.deviations.find((x) => x.key === k);
          const z = d?.used ? (d.zClipped ?? 0) : null;
          return (
            <div key={k} className="focus-cell">
              <span className="fk">{L.short(k)}</span>
              <span className="fz" style={{ color: z === null ? C.dim : zColor(z) }} title={SIGMA_TIP}>
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
  const pattern =
    s.state !== 'STABLE' ? sessionPattern(s.exercise, s.monitorReps, s.onsetRep ?? s.firstWarnRep, s.baseline?.reference.sigma0, launch.patternLabels) : null;
  const explanation = s.alarmRep !== null ? explainAlert(s.exercise, s.monitorReps, s.onsetRep, s.alarmRep) : null;
  const maxScore = Math.max(1, ...s.monitorReps.map((r) => r.drift?.score ?? 0));
  // While a set runs the axis stays put so bars do not jump; once it ends it fits the set.
  const minReps = s.phase === 'monitoring' || !s.monitorReps.length ? 14 : Math.max(6, s.monitorReps.length);
  const triggerText =
    mode === 'ewma'
      ? `The alert triggers when the trend line crosses ${fmt(th?.breakpointLevel)}` +
        (s.config.minimumPersistentReps > 0
          ? ` after ${s.config.minimumPersistentReps} or more high reps.`
          : '. Each rep moves the trend line only part of the way, so one unusual rep rarely triggers it on its own.')
      : mode === 'cusum'
        ? `The alert triggers when the build-up of change (CUSUM) passes h = ${s.config.cusumH}.`
        : mode === 'combined'
          ? 'The alert triggers when the trend line (EWMA) and the build-up of change (CUSUM) both show a lasting change.'
          : `The alert triggers after ${Math.max(1, s.config.minimumPersistentReps)} reps in a row above the line.`;

  return (
    <section className="evidence" id="evidence" aria-labelledby="evidence-title">
      <h2 id="evidence-title" className="evidence-title">
        Detector evidence <small>for coaches and advanced users</small>
      </h2>

      <div className="panel chart-card">
        <div className="chart-head">
          <h3>
            Form Changes Over Time
            <small>Form Change Score for each rep, compared with {athleteName}'s usual form</small>
          </h3>
          <div className="legend">
            <span><i className="box" style={{ background: C.stable, opacity: 0.3 }} />your normal range</span>
            <span><i className="box" style={{ background: C.stable, opacity: 0.65 }} />score for each rep</span>
            <span><i style={{ background: C.text, height: 3 }} />trend (smoothed)</span>
            <span><i style={{ background: C.drift }} />warning line</span>
            <span><i style={{ background: C.break }} />alert line</span>
            <span><i style={{ background: C.evidence }} />build-up of change (CUSUM)</span>
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
          minReps={minReps}
        />
        <div className="chart-caption">
          {explanation ? (
            <>
              <span>
                {explanation.what} <b className="c-break">{explanation.when}</b>
                {pattern && (
                  <>
                    {' '}
                    Pattern: <b>{pattern.label}</b>.
                  </>
                )}
              </span>
              <span>
                Biggest changes at the alert rep: <b>{(frozen ?? []).slice(0, 3).map((d) => `${L.short(d.key)} ${arrow(d.zClipped ?? 0)}`).join(', ')}</b>
              </span>
            </>
          ) : s.monitorReps.length ? (
            <span>
              No alert yet. {s.monitorReps.length} rep{s.monitorReps.length > 1 ? 's' : ''} compared with your usual form.
            </span>
          ) : (
            <span className="muted">The chart fills in as monitored reps are completed. Select a bar for its measurements.</span>
          )}
        </div>
        <RepTimeline reps={s.monitorReps} alarmRep={s.alarmRep} selected={selectedRep} onSelect={onSelectRep} maxScore={maxScore} />
      </div>
      {sel && <RepDetail rep={sel} baseline={s.baseline} exercise={s.exercise} onClose={() => onSelectRep(null)} />}

      <div className="evidence-grid">
        <div className="panel">
          <div className="metrics-row">
            <div>
              <div className="panel-title" style={{ marginBottom: 6 }} title={SCORE_TIP}>
                Form Change Score
              </div>
              <div className="metric-big">
                <span className="v" style={{ color: lastScored?.step ? STATE_COLOR[lastScored.step.state] : C.text }}>{fmt(lastScored?.drift?.score)}</span>
              </div>
              <div className="metric-cap">
                How different the latest rep is from your usual form. Your normal range is up to <span className="mono">{fmt(th?.normalUpper)}</span>.
              </div>
            </div>
            <div>
              <Gauge
                label="Trend (smoothed score)"
                value={lastScored?.step?.ewmaLevel ?? th?.mu0 ?? 0}
                max={(th?.breakpointLevel ?? 2) * 1.35}
                ticks={th ? [th.warningLevel, th.breakpointLevel] : []}
                color={lastScored?.step ? STATE_COLOR[lastScored.step.state] : C.stable}
                valueText={`${fmt(lastScored?.step?.ewmaLevel)} · line ${fmt(th?.breakpointLevel)}`}
              />
              <Gauge
                label={mode === 'cusum' || mode === 'combined' ? 'Build-up of change (CUSUM)' : 'Build-up of change (CUSUM, for timing)'}
                value={lastScored?.step?.cusum ?? 0}
                max={s.config.cusumH * 1.4}
                ticks={[s.config.cusumH]}
                color={C.evidence}
                valueText={`${fmt(lastScored?.step?.cusum, 1)} / ${s.config.cusumH}`}
              />
            </div>
          </div>
          <div className="trigger-note">{triggerText}</div>
        </div>

        <div className="panel">
          <div className="panel-title">
            <span>{frozen ? `What changed at rep ${s.alarmRep}` : 'What changed'}</span>
            {frozen ? <span className="frozen-tag code">Kept from the alert rep</span> : lastScored && <span className="meta">rep {lastScored.index}</span>}
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

        {s.baseline ? (
          <div className="panel">
            <div className="panel-title">
              <span>{athleteName}'s usual form</span>
              <span
                className="meta"
                title={`Technical: the fresh reps scored ${fmt(s.baseline.reference.mu0)} ± ${fmt(s.baseline.reference.sigma0)} against each other (leave-one-out). Later reps are judged against this spread.`}
              >
                {s.baseline.nReps} fresh reps recorded
              </span>
            </div>
            <BaselineTable baseline={s.baseline} exercise={s.exercise} />
          </div>
        ) : (
          <div className="panel">
            <div className="panel-title">
              <span>Calibration reps</span>
              <span className="meta">{s.calibrationReps.length} so far</span>
            </div>
            <div className="rep-chips">
              {s.calibrationReps.map((r) => (
                <span className="rep-chip" key={r.index}>
                  #{r.index}:{' '}
                  {s.exercise === 'cmj'
                    ? `jump ${((r.features.values.jumpHeight ?? 0) * 100).toFixed(0)}% of leg length`
                    : `depth ${((r.features.values.depth ?? 0) * 100).toFixed(0)}% of leg length`}
                  , {(r.tEnd - r.tStart).toFixed(1)}s
                </span>
              ))}
              {!s.calibrationReps.length && <span className="muted" style={{ fontSize: 13 }}>Waiting for the first fresh rep.</span>}
            </div>
          </div>
        )}

        {(s.phase === 'recovery' || s.phase === 'recoveryDone') && (
          <div className="panel">
            <div className="panel-title">
              <span>Recovery reps</span>
              <span className="meta">
                {s.recoveryReps.length} of {RECOVERY_REPS}
              </span>
            </div>
            {s.recoveryReps.map((rep) => (
              <div key={rep.index} className="row" style={{ justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                <span>Rep {rep.index}</span>
                <span className="mono" title={SCORE_TIP}>
                  score {fmt(rep.drift?.score)}
                </span>
              </div>
            ))}
            {s.recovery && (
              <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
                Average Form Change Score {fmt(s.recovery.meanRecovery)} now, {fmt(s.recovery.meanPost)} after the alert. Your normal range is up to{' '}
                {fmt(th?.normalUpper)}.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
