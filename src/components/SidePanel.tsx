import type { Baseline } from '../baseline/baseline';
import { featureSpecs, formatFeatureValue, formatWithUnit, type ExerciseType } from '../biomechanics/catalog';
import type { FeatureDeviation } from '../detection/driftScore';
import { useLabels } from '../protocols/labels';
import type { LaunchContext } from '../protocols/launch';
import { sessionPattern } from '../protocols/patterns';
import type { RepRecord, Snapshot } from '../session/engine';
import { RECOVERY_REPS } from '../session/engine';
import { arrow, fmt, fmtSigma, pct, STATE_CLASS, STATE_COLOR, STATE_LABEL } from '../utils/format';
import { Check, Close } from './Icons';

interface Props {
  snap: Snapshot;
  mode: 'demo' | 'live';
  launch: LaunchContext;
  selectedRep: number | null;
  onSelectRep: (r: number | null) => void;
  savedBaseline: Baseline | null;
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
function zColor(z: number) {
  const a = Math.abs(z);
  return a >= 2 ? '#ff4d5e' : a >= 1 ? '#ffb020' : '#7f8b9d';
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
          <th>Feature</th>
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
                <td colSpan={2} className="num excluded">excluded (low confidence)</td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Ring({ value, total, label }: { value: number; total: number; label: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, value / total);
  return (
    <div className="ring">
      <svg width="120" height="120">
        <circle cx="60" cy="60" r={r} stroke="#1b2330" strokeWidth="9" fill="none" />
        <circle cx="60" cy="60" r={r} stroke="#59d0ff" strokeWidth="9" fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - f)} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.4s' }} />
      </svg>
      <div className="c">
        <div>
          <b>{value}</b>
          <span>
            / {total} {label}
          </span>
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
        <div className="f" style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%`, background: color }} />
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
      <div className="row" style={{ gap: 18, marginBottom: 8, fontSize: 12.5 }}>
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
        <span>Feature</span>
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
            <span className="num" style={{ color: d?.used ? zColor(d.zClipped ?? 0) : '#556072' }}>
              {d?.used ? fmtSigma(d.zClipped) : d?.reason === 'low-quality' ? 'low conf.' : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- views
function SetupView(p: Props) {
  const l = p.snap.live;
  const items = [
    { ok: l.present, text: 'Athlete detected in frame' },
    { ok: l.quality >= 0.65, text: 'Whole body visible — head to feet, nothing cropped' },
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
              <b>{p.launch.title}</b> · {p.launch.protocol.camera}.
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
        <div className="panel-title">Step 1 · Learn your baseline</div>
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          Perform 5–8 controlled {p.launch.primitive.name.toLowerCase()} reps at your normal tempo while fresh. BreakingPoint learns how <b>you</b> move — not an
          "ideal" form.
        </p>
        <div className="col">
          <button className="btn primary lg block" onClick={p.onStartCalibration}>
            Start calibration
          </button>
          {p.savedBaseline && (
            <button className="btn block" onClick={p.onUseSaved}>
              Use saved baseline · {p.savedBaseline.nReps} reps · {new Date(p.savedBaseline.createdAt).toLocaleDateString()}
            </button>
          )}
          {l.quality < 0.65 && <span className="muted" style={{ fontSize: 12 }}>Capture quality is low — reps may not be scored reliably.</span>}
        </div>
      </div>
    </>
  );
}

function CalibratingView(p: Props) {
  const s = p.snap;
  return (
    <div className="panel">
      <div className="panel-title">Step 1 · Calibration</div>
      <div className="row" style={{ gap: 18, alignItems: 'center' }}>
        <Ring value={s.calibrationReps.length} total={s.calibrationTarget} label="reps" />
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Learning {s.athlete}'s baseline…</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Perform controlled reps at your normal tempo. Each rep becomes one sample of <b>your</b> movement distribution.
          </div>
        </div>
      </div>
      <div className="rep-chips" style={{ marginTop: 14 }}>
        {s.calibrationReps.map((r) => (
          <span className="rep-chip" key={r.index}>
            #{r.index} · {s.exercise === 'cmj' ? `jump ${((r.features.values.jumpHeight ?? 0) * 100).toFixed(0)}%` : `depth ${((r.features.values.depth ?? 0) * 100).toFixed(0)}%`} · {(r.tEnd - r.tStart).toFixed(1)}s
          </span>
        ))}
        {!s.calibrationReps.length && <span className="muted" style={{ fontSize: 12.5 }}>Waiting for the first rep…</span>}
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
      <div className="panel" style={{ borderColor: 'rgba(46,229,157,0.35)' }}>
        <div className="row">
          <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(46,229,157,0.15)', color: '#2ee59d' }}>
            <Check size={20} />
          </span>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Baseline established.</div>
            <div className="muted" style={{ fontSize: 12.5 }}>
              {s.baseline.nReps} fresh reps · in-control drift {fmt(s.baseline.reference.mu0)} ± {fmt(s.baseline.reference.sigma0)} (leave-one-out)
            </div>
          </div>
        </div>
        {p.mode === 'live' && (
          <button className="btn go lg block" style={{ marginTop: 14 }} onClick={p.onStartMonitoring}>
            Start monitored set
          </button>
        )}
        {p.mode === 'demo' && <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Starting the monitored set…</div>}
      </div>
      <div className="panel">
        <div className="panel-title">
          <span>Your baseline</span>
          <span className="dim" style={{ letterSpacing: '0.04em', textTransform: 'none' }}>not "ideal human form"</span>
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
      ? `Persistent drift since rep ${s.onsetRep}. Detected at rep ${s.alarmRep}.`
      : state === 'DRIFT'
        ? 'Your mechanics are starting to shift away from your baseline.'
        : s.monitorReps.length
          ? 'Movement matches your personal baseline.'
          : `Perform your set — every rep is compared with ${s.athlete}'s baseline.`;
  const frozen = s.breakpointContributors;
  const devs = frozen ?? lastScored?.drift?.ranked ?? [];
  const mode = s.config.mode;
  const pattern = state !== 'STABLE' ? sessionPattern(s.exercise, s.monitorReps, s.onsetRep ?? s.firstWarnRep, s.baseline?.reference.sigma0, p.launch.patternLabels) : null;
  const triggerText =
    mode === 'ewma'
      ? `Triggers when smoothed drift (EWMA) crosses ${fmt(th?.breakpointLevel)}` +
        (s.config.minimumPersistentReps > 0 ? ` after ≥${s.config.minimumPersistentReps} elevated reps` : ' — one odd rep moves it at most halfway')
      : mode === 'cusum'
        ? `Triggers when CUSUM evidence exceeds h = ${s.config.cusumH}`
        : mode === 'combined'
          ? 'Triggers when EWMA and CUSUM both confirm persistent drift'
          : `Triggers after ${Math.max(1, s.config.minimumPersistentReps)} consecutive reps above the line`;
  return (
    <>
      <div className={`state-card ${STATE_CLASS[state]}`}>
        <div className="lights">
          <i className={`g ${state === 'STABLE' ? 'on' : ''}`} />
          <i className={`y ${state === 'DRIFT' ? 'on' : ''}`} />
          <i className={`r ${state === 'BREAKPOINT' ? 'on' : ''}`} />
        </div>
        <div className="eyebrow">Movement state {last ? `· rep ${last.index}` : ''}</div>
        <div className="state-label">{state === 'BREAKPOINT' ? 'BREAKING POINT DETECTED' : STATE_LABEL[state]}</div>
        <div className="state-sub">{sub}</div>
        {pattern && (
          <div className="pattern-line" title={pattern.explain}>
            <span className="k">Movement pattern</span>
            <span className="pattern-tag">{pattern.label}</span>
          </div>
        )}
      </div>

      <div className="panel">
        <div className="metrics-row">
          <div>
            <div className="panel-title" style={{ marginBottom: 6 }}>Movement drift score</div>
            <div className="metric-big">
              <span className="v" style={{ color: lastScored?.step ? STATE_COLOR[lastScored.step.state] : '#e9eef6' }}>{fmt(lastScored?.drift?.score)}</span>
              <span className="u">σ RMS</span>
            </div>
            <div className="metric-cap">
              vs your baseline · your normal ≤ <span className="mono">{fmt(th?.normalUpper)}</span>
            </div>
          </div>
          <div>
            <Gauge
              label="Smoothed drift (EWMA)"
              value={lastScored?.step?.ewmaLevel ?? th?.mu0 ?? 0}
              max={(th?.breakpointLevel ?? 2) * 1.35}
              ticks={th ? [th.warningLevel, th.breakpointLevel] : []}
              color={lastScored?.step ? STATE_COLOR[lastScored.step.state] : '#59d0ff'}
              valueText={fmt(lastScored?.step?.ewmaLevel)}
            />
            <Gauge
              label={mode === 'cusum' || mode === 'combined' ? 'Persistence evidence (CUSUM)' : 'CUSUM (onset tracking)'}
              value={lastScored?.step?.cusum ?? 0}
              max={s.config.cusumH * 1.4}
              ticks={[s.config.cusumH]}
              color="#a594ff"
              valueText={`${fmt(lastScored?.step?.cusum, 1)} / ${s.config.cusumH}`}
            />
          </div>
        </div>
        <div className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>{triggerText}</div>
      </div>

      <div className="panel">
        <div className="panel-title">
          <span>{frozen ? `Why rep ${s.alarmRep} was flagged` : 'What changed'}</span>
          {frozen ? <span className="frozen-tag">FROZEN AT BREAKING POINT</span> : lastScored && <span className="dim">rep {lastScored.index}</span>}
        </div>
        <Contributors devs={devs} exercise={s.exercise} />
      </div>

      <FocusPanel snap={s} launch={p.launch} />

      {p.mode === 'live' && (
        <button className="btn danger block" onClick={p.onEndSet} disabled={!s.monitorReps.length}>
          End set & view summary
        </button>
      )}
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
              <span className="fz mono" style={{ color: z === null ? '#556072' : zColor(z) }}>
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
      <div className={`state-card ${STATE_CLASS[s.state]}`}>
        <div className="eyebrow">Set complete · {s.monitorReps.length} reps</div>
        <div className="state-label" style={{ fontSize: 30 }}>
          {s.alarmRep !== null ? `BREAKING POINT · REP ${s.alarmRep}` : 'NO BREAKING POINT'}
        </div>
        {pattern && (
          <div className="pattern-line" title={pattern.explain}>
            <span className="k">Movement pattern</span>
            <span className="pattern-tag">{pattern.label}</span>
          </div>
        )}
        <div className="state-sub">
          {s.alarmRep !== null ? 'Take a recovery period, then run a 3-rep recovery check against your original baseline.' : 'Movement stayed within your personal baseline.'}
        </div>
      </div>
      {s.breakpointContributors && (
        <div className="panel">
          <div className="panel-title">
            <span>Why rep {s.alarmRep} was flagged</span>
            <span className="frozen-tag">FROZEN</span>
          </div>
          <Contributors devs={s.breakpointContributors} exercise={s.exercise} />
        </div>
      )}
      <div className="col">
        <button className="btn primary lg block" onClick={p.onStartRecovery}>
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
    </>
  );
}

function RecoveryView(p: Props) {
  const s = p.snap;
  const r = s.recovery;
  return (
    <>
      <div className="panel" style={{ borderColor: 'rgba(165,148,255,0.4)' }}>
        <div className="panel-title">Step 4 · Recovery check</div>
        {!r ? (
          <div className="row" style={{ gap: 18 }}>
            <Ring value={s.recoveryReps.length} total={RECOVERY_REPS} label="reps" />
            <div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>Reassessing against your original baseline…</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>After a rest, perform {RECOVERY_REPS} controlled reps.</div>
            </div>
          </div>
        ) : (
          <div>
            <div className="eyebrow" style={{ color: '#a594ff' }}>Recovery check</div>
            <div style={{ fontSize: 15, color: '#b9c3d1', marginTop: 8 }}>{r.status === 'persistent' ? 'Persistent drift remains' : 'Movement has returned'}</div>
            <div className="metric-big" style={{ marginTop: 4 }}>
              <span className="v" style={{ fontSize: 56, color: r.status === 'recovered' ? '#2ee59d' : r.status === 'partial' ? '#ffb020' : '#ff4d5e' }}>
                {(r.percent * 100).toFixed(0)}%
              </span>
              <span className="u">toward baseline</span>
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              Mean drift {fmt(r.meanRecovery)} now vs {fmt(r.meanPost)} after the breaking point (your normal ≤ {fmt(s.thresholds?.normalUpper)}).
            </div>
            <div style={{ fontSize: 13, marginTop: 10 }}>
              {r.status === 'recovered'
                ? 'Mechanics are back within your normal range.'
                : r.status === 'partial'
                  ? 'Partially recovered — consider more rest or a lighter session before reassessing.'
                  : 'Persistent drift remains — consider ending intense work for today.'}
            </div>
          </div>
        )}
      </div>
      {s.recoveryReps.length > 0 && (
        <div className="panel">
          <div className="panel-title">Recovery reps vs baseline</div>
          {s.recoveryReps.map((rep) => (
            <div key={rep.index} className="row" style={{ justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
              <span>Rep {rep.index}</span>
              <span className="mono">drift {fmt(rep.drift?.score)}</span>
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
