import type { Baseline } from '../baseline/baseline';
import { featureSpecs, formatFeatureValue, formatWithUnit, type ExerciseType } from '../biomechanics/catalog';
import type { FeatureDeviation } from '../detection/driftScore';
import { heldReps, stillHolding } from '../data/progress';
import { useLabels } from '../protocols/labels';
import type { LaunchContext } from '../protocols/launch';
import { sessionPattern } from '../protocols/patterns';
import type { RepRecord, Snapshot } from '../session/engine';
import { RECOVERY_REPS } from '../session/engine';
import { describeAlertTiming, explainAlert, explainAlertText } from '../session/explain';
import { arrow, fmt, fmtSigma, pct, STATE_CLASS, STATE_COLOR, STATE_LABEL } from '../utils/format';
import { C } from '../ui/theme';
import { Check, Close } from './Icons';

interface Props {
  snap: Snapshot;
  mode: 'demo' | 'live';
  launch: LaunchContext;
  selectedRep: number | null;
  onSelectRep: (r: number | null) => void;
  savedBaseline: Baseline | null;
  /** Personal best for reps held at baseline (live sessions only; null in demo or before a first live set). */
  bestHeld: number | null;
  onStartCalibration: () => void;
  onFinishCalibration: () => void;
  onUseSaved: () => void;
  onStartMonitoring: () => void;
  onEndSet: () => void;
  onStartRecovery: () => void;
  onShowSummary: () => void;
  onNewSet: () => void;
}

// ---------------------------------------------------------------- pieces
const SCORE_TIP =
  'How different a rep is from your usual form, across all measurements. Higher means more different, in either direction. It is not a percentage, and it does not measure fatigue or injury risk.';
const SIGMA_TIP = 'Change from your usual form, in multiples of your normal rep-to-rep variation (σ). Arrows show the direction.';

function zColor(z: number) {
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
          <th style={{ textAlign: 'right' }} title="Your normal rep-to-rep variation">Normal ±</th>
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
                <td colSpan={2} className="num excluded">not used (camera view unclear)</td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** One cell per real rep: the cells fill as the athlete performs them. */
function SyncMeter({ value, total, tone, label }: { value: number; total: number; tone?: 'violet'; label: string }) {
  const cells = Math.max(total, value);
  return (
    <div className="sync" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(value, total)}>
      <div className="sync-count">
        {value}
        <small>/{total}</small>
      </div>
      <div className="sync-body">
        <div className="eyebrow">{label}</div>
        <div className={`seg-meter ${tone ?? ''}`}>
          {Array.from({ length: cells }, (_, i) => (
            <span key={i} className={`cell ${i < value ? 'on' : ''} ${i === value - 1 ? 'latest' : ''}`} />
          ))}
        </div>
      </div>
    </div>
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
        <button className="btn ghost sm" onClick={onClose} aria-label="Close">
          <Close size={14} />
        </button>
      </div>
      <div className="rep-stats">
        <span>
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

/** Stable → drift → breaking point, with the current state lit. Text label lives next to it. */
function StateScale({ state }: { state: Snapshot['state'] }) {
  const lvl = state === 'STABLE' ? 0 : state === 'DRIFT' ? 1 : 2;
  return (
    <span className="state-scale" aria-hidden>
      {[0, 1, 2].map((i) => (
        <i key={i} className={i === lvl ? 'on' : ''} />
      ))}
    </span>
  );
}

/** Reps held at the usual form before it started to change, plus the live personal best when there is one. */
function HeldLine({ held, holding, best }: { held: number; holding: boolean; best: number | null }) {
  const beat = best !== null && held > best;
  return (
    <div className="held">
      <span className="v">{held}</span>
      <span className="l">{holding ? `rep${held === 1 ? '' : 's'} at your usual form so far` : `rep${held === 1 ? '' : 's'} at your usual form before it started to change`}</span>
      {best !== null && <span className={`pb ${beat ? 'new' : ''}`}>{beat ? `New personal best (was ${best})` : `Personal best ${best}`}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- views
function SetupView(p: Props) {
  const l = p.snap.live;
  const items = [
    { ok: l.present, text: 'Athlete detected in frame' },
    { ok: l.quality >= 0.65, text: 'Whole body visible, head to feet, nothing cropped' },
    { ok: l.present && l.calibrated, text: 'Standing still briefly so BreakingPoint can find your standing posture' },
  ];
  return (
    <>
      <div className="panel">
        <div className="panel-title">Camera setup</div>
        <ul className="checklist">
          <li>
            <span className="ic">1</span>
            <span>
              <b>{p.launch.title}</b>: {p.launch.protocol.camera}.
            </span>
          </li>
          <li>
            <span className="ic">2</span>
            <span>Camera at hip height, about 2.5–3.5 m away, in good, even light.</span>
          </li>
          {items.map((it) => (
            <li key={it.text} className={it.ok ? 'ok' : ''}>
              <span className="ic">{it.ok ? <Check size={12} /> : '·'}</span>
              <span>{it.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="panel">
        <div className="panel-title">
          <span>Learn your usual form</span>
          <span className="meta">Calibrate</span>
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Do 5–8 controlled {p.launch.primitive.name.toLowerCase()} reps at your normal pace while you're fresh. BreakingPoint learns how <b>you</b> move, not an
          "ideal" form.
        </p>
        <div className="col">
          <button className="btn primary lg block" onClick={p.onStartCalibration}>
            Start calibration
          </button>
          {p.savedBaseline && (
            <button className="btn block" onClick={p.onUseSaved}>
              Use saved baseline ({p.savedBaseline.nReps} reps, {new Date(p.savedBaseline.createdAt).toLocaleDateString()})
            </button>
          )}
          {l.quality < 0.65 && <span className="muted" style={{ fontSize: 12.5 }}>Capture quality is low, so reps may not be scored reliably.</span>}
        </div>
      </div>
    </>
  );
}

function CalibratingView(p: Props) {
  const s = p.snap;
  return (
    <div className="panel">
      <div className="panel-title">
        <span>Learning {s.athlete}'s baseline</span>
        <span className="meta">Calibrate</span>
      </div>
      <SyncMeter value={s.calibrationReps.length} total={s.calibrationTarget} label="Fresh reps calibrated" />
      <p className="muted" style={{ fontSize: 13, margin: '12px 0 0' }}>
        Do controlled reps at your normal pace. Each one teaches BreakingPoint more about <b>your</b> usual form.
      </p>
      <div className="rep-chips" style={{ marginTop: 12 }}>
        {s.calibrationReps.map((r) => (
          <span className="rep-chip" key={r.index}>
            #{r.index}: {s.exercise === 'cmj' ? `jump ${((r.features.values.jumpHeight ?? 0) * 100).toFixed(0)}% of leg length` : `depth ${((r.features.values.depth ?? 0) * 100).toFixed(0)}% of leg length`}, {(r.tEnd - r.tStart).toFixed(1)}s
          </span>
        ))}
        {!s.calibrationReps.length && <span className="muted" style={{ fontSize: 13 }}>Waiting for the first rep…</span>}
      </div>
      {p.mode === 'live' && (
        <button className="btn block" style={{ marginTop: 14 }} disabled={s.calibrationReps.length < 5} onClick={p.onFinishCalibration}>
          Finish calibration {s.calibrationReps.length < 5 ? `(need ${5 - s.calibrationReps.length} more)` : ''}
        </button>
      )}
    </div>
  );
}

function BaselineView(p: Props) {
  const s = p.snap;
  if (!s.baseline) return null;
  return (
    <>
      <div className="sys-window toned tone-violet panel">
        <div className="milestone">
          <span className="ms-mark" aria-hidden>
            <Check size={15} />
          </span>
          <div>
            <div className="ms-title">Baseline locked</div>
            <div
              className="ms-sub"
              title={`Technical: your fresh reps scored ${fmt(s.baseline.reference.mu0)} ± ${fmt(s.baseline.reference.sigma0)} against each other (leave-one-out). Later reps are judged against this spread.`}
            >
              {s.baseline.nReps} fresh reps recorded. Every rep from now on is compared with this usual form.
            </div>
          </div>
        </div>
        {p.mode === 'live' && (
          <button className="btn go lg block" style={{ marginTop: 14 }} onClick={p.onStartMonitoring}>
            Start monitored set
          </button>
        )}
        {p.mode === 'demo' && <div className="muted" style={{ fontSize: 13, marginTop: 10 }}>Starting the monitored set…</div>}
      </div>
      <div className="panel">
        <div className="panel-title">
          <span>Your usual form</span>
          <span className="meta">from your fresh reps</span>
        </div>
        <BaselineTable baseline={s.baseline} exercise={s.exercise} />
      </div>
    </>
  );
}

function MonitorView(p: Props) {
  const s = p.snap;
  const last = s.monitorReps[s.monitorReps.length - 1];
  const th = s.thresholds;
  const lastScored = [...s.monitorReps].reverse().find((r) => r.drift?.score !== null && r.drift?.score !== undefined);
  const state = s.state;
  const sub =
    state === 'BREAKPOINT'
      ? describeAlertTiming(s.onsetRep, s.alarmRep ?? s.monitorReps.length)
      : state === 'DRIFT'
        ? 'Your form is starting to change.'
        : s.monitorReps.length
          ? 'Your reps match your usual form.'
          : `Do your set. Each rep is compared with ${s.athlete}'s usual form.`;
  const frozen = s.breakpointContributors;
  const devs = frozen ?? lastScored?.drift?.ranked ?? [];
  const mode = s.config.mode;
  const pattern = state !== 'STABLE' ? sessionPattern(s.exercise, s.monitorReps, s.onsetRep ?? s.firstWarnRep, s.baseline?.reference.sigma0, p.launch.patternLabels) : null;
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
  const held = heldReps(s.monitorReps);
  const holding = stillHolding(s.monitorReps);
  return (
    <>
      <div key={state} className={`sys-window toned state-card ${STATE_CLASS[state]}`} role="status" aria-live="polite">
        <div className="state-head">
          <span className="eyebrow">Movement state{last ? `, rep ${last.index}` : ''}</span>
          <StateScale state={state} />
        </div>
        <div className="state-label">{state === 'BREAKPOINT' ? 'Breaking point detected' : STATE_LABEL[state]}</div>
        <div className="state-sub">{sub}</div>
        {pattern && (
          <div className="pattern-line" title={pattern.explain}>
            <span className="k">Movement pattern</span>
            <span className="pattern-tag">{pattern.label}</span>
          </div>
        )}
        {s.monitorReps.length > 0 && <HeldLine held={held} holding={holding} best={p.bestHeld} />}
      </div>

      {p.mode === 'live' && (
        <button className="btn danger block" onClick={p.onEndSet} disabled={!s.monitorReps.length}>
          End set and view summary
        </button>
      )}

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
              How different this rep is from your usual form. Your normal range is up to <span className="mono">{fmt(th?.normalUpper)}</span>.
            </div>
          </div>
          <div>
            <Gauge
              label="Trend (smoothed score)"
              value={lastScored?.step?.ewmaLevel ?? th?.mu0 ?? 0}
              max={(th?.breakpointLevel ?? 2) * 1.35}
              ticks={th ? [th.warningLevel, th.breakpointLevel] : []}
              color={lastScored?.step ? STATE_COLOR[lastScored.step.state] : C.sys}
              valueText={fmt(lastScored?.step?.ewmaLevel)}
            />
            <Gauge
              label={mode === 'cusum' || mode === 'combined' ? 'Build-up of change (CUSUM)' : 'Build-up of change (CUSUM, for timing)'}
              value={lastScored?.step?.cusum ?? 0}
              max={s.config.cusumH * 1.4}
              ticks={[s.config.cusumH]}
              color={C.violet}
              valueText={`${fmt(lastScored?.step?.cusum, 1)} / ${s.config.cusumH}`}
            />
          </div>
        </div>
        <div className="trigger-note">{triggerText}</div>
      </div>

      <div className="panel">
        <div className="panel-title">
          <span>{frozen ? `What changed at rep ${s.alarmRep}` : 'What changed'}</span>
          {frozen ? <span className="frozen-tag code">Kept from the alert rep</span> : lastScored && <span className="dim">rep {lastScored.index}</span>}
        </div>
        <Contributors devs={devs} exercise={s.exercise} />
      </div>

      <FocusPanel snap={s} launch={p.launch} />

    </>
  );
}

/** Sport-featured metrics for the latest scored rep (display only; ranking above stays by |z|). */
function FocusPanel({ snap, launch }: { snap: Snapshot; launch: LaunchContext }) {
  const L = useLabels(snap.exercise);
  const last = [...snap.monitorReps].reverse().find((r) => r.drift?.score !== null && r.drift?.score !== undefined);
  return (
    <div className="panel">
      <div className="panel-title">
        <span>{launch.contextName} focus metrics</span>
        {last && <span className="dim">rep {last.index}</span>}
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

function SummaryView(p: Props) {
  const s = p.snap;
  const pattern = s.alarmRep !== null ? sessionPattern(s.exercise, s.monitorReps, s.onsetRep, s.baseline?.reference.sigma0, p.launch.patternLabels) : null;
  return (
    <>
      <div className={`sys-window toned state-card ${STATE_CLASS[s.state]}`}>
        <div className="state-head">
          <span className="eyebrow">Set complete, {s.monitorReps.length} reps</span>
          <StateScale state={s.state} />
        </div>
        <div className="state-label" style={{ fontSize: 32 }}>
          {s.alarmRep !== null ? `Breaking point · rep ${s.alarmRep}` : 'No breaking point'}
        </div>
        {pattern && (
          <div className="pattern-line" title={pattern.explain}>
            <span className="k">Movement pattern</span>
            <span className="pattern-tag">{pattern.label}</span>
          </div>
        )}
        <div className="state-sub">
          {s.alarmRep !== null
            ? `${explainAlertText(explainAlert(s.exercise, s.monitorReps, s.onsetRep, s.alarmRep))} Rest, then run a ${RECOVERY_REPS}-rep recovery check against your usual form.`
            : 'Your form stayed close to your usual form.'}
        </div>
        <HeldLine held={heldReps(s.monitorReps)} holding={false} best={p.bestHeld} />
      </div>
      <div className="col">
        <button className={`btn lg block ${s.alarmRep !== null ? 'primary' : ''}`} onClick={p.onStartRecovery}>
          Run recovery check ({RECOVERY_REPS} reps)
        </button>
        <div className="row">
          <button className="btn grow" onClick={p.onShowSummary}>
            Session summary
          </button>
          <button className="btn grow" onClick={p.onNewSet}>
            New set
          </button>
        </div>
      </div>
      {s.breakpointContributors && (
        <div className="panel">
          <div className="panel-title">
            <span>What changed at rep {s.alarmRep}</span>
            <span className="frozen-tag code">At the alert</span>
          </div>
          <Contributors devs={s.breakpointContributors} exercise={s.exercise} />
        </div>
      )}
    </>
  );
}

function RecoveryView(p: Props) {
  const s = p.snap;
  const r = s.recovery;
  return (
    <>
      <div className="sys-window toned tone-violet panel">
        <div className="panel-title">
          <span>Recovery check</span>
          <span className="meta">Recover</span>
        </div>
        {!r ? (
          <>
            <SyncMeter value={s.recoveryReps.length} total={RECOVERY_REPS} tone="violet" label="Recovery reps vs your usual form" />
            <p className="muted" style={{ fontSize: 13, margin: '12px 0 0' }}>
              After a rest, perform {RECOVERY_REPS} controlled reps.
            </p>
          </>
        ) : (
          <div>
            <div style={{ fontSize: 14, color: C.text2 }}>
              {r.status === 'recovered' ? 'Back to your usual form' : r.status === 'partial' ? 'Partly back to your usual form' : 'Still different from your usual form'}
            </div>
            <div className="metric-big" style={{ marginTop: 4 }}>
              <span className="v" style={{ fontSize: 60, color: r.status === 'recovered' ? C.stable : r.status === 'partial' ? C.drift : C.break }}>
                {(r.percent * 100).toFixed(0)}%
              </span>
              <span className="u">of the change gone</span>
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              Average Form Change Score {fmt(r.meanRecovery)} now, {fmt(r.meanPost)} after the alert. Your normal range is up to {fmt(s.thresholds?.normalUpper)}.
            </div>
            <div style={{ fontSize: 13.5, marginTop: 10 }}>
              {r.status === 'recovered'
                ? 'Your form is back within your normal range.'
                : r.status === 'partial'
                  ? 'Partly recovered. Consider more rest or a lighter session before you test again.'
                  : 'Your form is still different from your usual form. Consider keeping the rest of today light.'}
            </div>
          </div>
        )}
      </div>
      {s.recoveryReps.length > 0 && (
        <div className="panel">
          <div className="panel-title">Recovery reps vs your usual form</div>
          {s.recoveryReps.map((rep) => (
            <div key={rep.index} className="row" style={{ justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
              <span>Rep {rep.index}</span>
              <span className="mono">score {fmt(rep.drift?.score)}</span>
            </div>
          ))}
        </div>
      )}
      {r && (
        <div className="row">
          <button className="btn grow" onClick={p.onShowSummary}>
            Session summary
          </button>
          <button className="btn grow" onClick={p.onNewSet}>
            New set
          </button>
        </div>
      )}
    </>
  );
}

export function SidePanel(p: Props) {
  const s = p.snap;
  const sel = p.selectedRep !== null ? s.monitorReps.find((r) => r.index === p.selectedRep) : null;
  return (
    <>
      {sel && <RepDetail rep={sel} baseline={s.baseline} exercise={s.exercise} onClose={() => p.onSelectRep(null)} />}
      {s.phase === 'idle' && <SetupView {...p} />}
      {s.phase === 'calibrating' && <CalibratingView {...p} />}
      {s.phase === 'baseline' && <BaselineView {...p} />}
      {s.phase === 'monitoring' && <MonitorView {...p} />}
      {s.phase === 'summary' && <SummaryView {...p} />}
      {(s.phase === 'recovery' || s.phase === 'recoveryDone') && <RecoveryView {...p} />}
    </>
  );
}
