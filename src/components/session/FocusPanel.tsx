// The athlete view: Figma Make's workout command panel, readable from about 3 metres. At any
// moment it says what state the set is in and gives one instruction, then shows only what that
// state needs (set-up checks, calibration progress, the Form Change Score, what changed most)
// and the real next actions.
//
// It has no live region of its own: SessionAnnouncer is the only one, so a screen reader hears
// state changes once instead of every rep.

import { useEffect, useRef, useState } from 'react';
import type { StoredBaseline } from '../../data/types';
import { heldReps } from '../../data/progress';
import { useLabels } from '../../protocols/labels';
import type { LaunchContext } from '../../protocols/launch';
import { RECOVERY_REPS, type Snapshot } from '../../session/engine';
import type { Countdown } from '../../session/useHandsFree';
import { changedMost, type WorkoutView } from '../../session/workoutView';
import { arrow } from '../../utils/format';
import { Check } from '../Icons';
import { RecordLane } from './RecordLane';

interface Props {
  snap: Snapshot;
  mode: 'demo' | 'live';
  launch: LaunchContext;
  view: WorkoutView;
  bestHeld: number | null;
  savedBaseline: StoredBaseline | null;
  countdown: Countdown | null;
  onStartCalibration: () => void;
  onFinishCalibration: () => void;
  onUseSaved: () => void;
  onStartMonitoring: () => void;
  onEndSet: () => void;
  /** Opens the post-workout system's Recovery section (where the recovery check starts). */
  onOpenRecovery: () => void;
  onShowSummary: () => void;
  onNewSet: () => void;
  /** True while the post-workout system covers the workout: the Enter shortcut is off. */
  inactive?: boolean;
}

interface Action {
  label: string;
  run: () => void;
  kind?: 'end' | 'stop';
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Live camera set-up: what the athlete has to get right before calibration (Make's checklist). */
function SetupChecklist({ snap, launch, inView }: { snap: Snapshot; launch: LaunchContext; inView: boolean }) {
  const l = snap.live;
  const items = [
    { ok: inView, text: 'Athlete in frame' },
    { ok: inView && l.quality >= 0.65, text: 'Whole body visible, head to feet' },
    { ok: inView && l.calibrated, text: 'Standing still for a moment' },
  ];
  return (
    <div className="workout-setup">
      <p className="workout-setup-how">{launch.protocol.camera}. Camera at hip height, about 2.5 to 3.5 m away, in even light.</p>
      <ul className="workout-checklist">
        {items.map((it) => (
          <li key={it.text} className={it.ok ? 'is-ready' : ''}>
            <i aria-hidden="true">{it.ok ? <Check size={12} /> : null}</i>
            <span>
              {it.text}
              <span className="visually-hidden">{it.ok ? ' (done)' : ' (not yet)'}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FocusPanel(p: Props) {
  const s = p.snap;
  const v = p.view;
  const live = p.mode === 'live';
  const labels = useLabels(s.exercise);
  const restStart = useRef<number | null>(null);
  if (s.phase === 'summary' && restStart.current === null) restStart.current = Date.now();
  if (s.phase !== 'summary' && s.phase !== 'recovery' && s.phase !== 'recoveryDone') restStart.current = null;
  const now = useNow(s.phase === 'summary');
  const n = s.monitorReps.length;

  const actions = ((): { primary?: Action; secondary?: Action[] } => {
    switch (s.phase) {
      case 'idle':
        return live
          ? {
              primary: { label: 'Start calibration', run: p.onStartCalibration },
              secondary: p.savedBaseline
                ? [{ label: `Use saved baseline (${new Date(p.savedBaseline.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`, run: p.onUseSaved }]
                : undefined,
            }
          : {};
      case 'calibrating':
        return live && s.calibrationReps.length >= v.calibration!.required ? { secondary: [{ label: 'Finish calibration', run: p.onFinishCalibration }] } : {};
      case 'baseline':
        if (!live) return {};
        return v.state === 'calibration-issue'
          ? { primary: { label: 'Calibrate again', run: p.onStartCalibration }, secondary: [{ label: 'Start the set now', run: p.onStartMonitoring }] }
          : { primary: { label: 'Start the set now', run: p.onStartMonitoring } };
      case 'monitoring':
        // The demo athlete stops on their own; a live athlete ends the set here (or hands-free does).
        if (!live) return {};
        if (s.alarmRep !== null) return { primary: { label: 'End set', run: p.onEndSet, kind: 'stop' } };
        return s.state === 'DRIFT' || n ? { primary: { label: 'End set', run: p.onEndSet, kind: 'end' } } : {};
      case 'summary':
        return s.alarmRep !== null
          ? { primary: { label: 'Continue to recovery', run: p.onOpenRecovery }, secondary: [{ label: 'Session summary', run: p.onShowSummary }] }
          : { primary: { label: 'Session summary', run: p.onShowSummary }, secondary: [{ label: 'New set', run: p.onNewSet }] };
      case 'recovery':
        return { secondary: [{ label: 'Recovery status', run: p.onOpenRecovery }] };
      case 'recoveryDone':
        return { primary: { label: 'Session summary', run: p.onShowSummary }, secondary: [{ label: 'New set', run: p.onNewSet }] };
    }
  })();

  // Enter runs the primary action when nothing else has focus (handy when walking back to the laptop).
  const primaryRef = useRef(actions.primary);
  primaryRef.current = p.inactive ? undefined : actions.primary;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== 'Enter' || e.repeat || (el && el !== document.body)) return;
      primaryRef.current?.run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const counting = p.countdown;
  const changed = v.state === 'warning' || v.state === 'sustained' || v.state === 'stop' ? changedMost(s) : [];
  const big =
    s.phase === 'summary' && s.alarmRep !== null
      ? { value: mmss(now - (restStart.current ?? now)), label: 'resting' }
      : s.phase === 'summary'
        ? { value: String(n), label: n === 1 ? 'rep' : 'reps' }
        : s.phase === 'recovery'
          ? { value: String(s.recoveryReps.length), label: `of ${RECOVERY_REPS} reps` }
          : s.phase === 'recoveryDone'
            ? { value: s.recovery ? `${Math.round(s.recovery.percent * 100)}%` : '—', label: 'of the change gone' }
            : null;

  return (
    <section className={`focus workout-focus is-${v.state}`} aria-label="Athlete view">
      <div className="workout-command-state focus-state">
        <span className="threshold-code">{v.code}</span>
        <strong className="plate">{v.plate}</strong>
        <p className="focus-instruction">{v.instruction}</p>
      </div>

      {counting && (
        <div className="workout-countdown">
          <span>{counting.label}</span>
          <strong className="st-numeral">{counting.seconds}</strong>
        </div>
      )}

      {live && s.phase === 'idle' && !v.cameraMessage && <SetupChecklist snap={s} launch={p.launch} inView={v.athleteInView} />}

      {v.calibration && (
        <div className="workout-calibration-progress">
          <span>Calibration progress</span>
          <div aria-hidden="true">
            {Array.from({ length: Math.max(v.calibration.target, v.calibration.done) }, (_, i) => (
              <i key={i} className={i < v.calibration!.done ? 'is-complete' : i < v.calibration!.required ? 'is-required' : ''} />
            ))}
          </div>
          <small>
            {v.calibration.done} of {v.calibration.target} fresh reps{live ? ` / you can finish after ${v.calibration.required}` : ''}
          </small>
        </div>
      )}

      {v.issues.length > 0 && (
        <ul className="workout-issues">
          {v.issues.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {v.score && (
        <div className="workout-score-panel">
          <div>
            <span>Form Change Score</span>
            <strong>{v.score.value !== null ? v.score.value.toFixed(2) : '—'}</strong>
          </div>
          <div className="workout-score-track" aria-hidden="true">
            {v.score.position !== null && <i style={{ left: `${v.score.position}%` }} />}
            <span>Usual</span>
            <span>Warning</span>
            <span>Alert</span>
          </div>
          <p>
            {live
              ? 'How far the last rep was from your usual form. The alert needs the change to last across several reps.'
              : 'Demo: how far each rep of the synthetic athlete is from its own baseline.'}
          </p>
        </div>
      )}

      {s.phase === 'monitoring' && <RecordLane held={heldReps(s.monitorReps)} best={p.bestHeld} frozen={s.alarmRep !== null} />}

      {changed.length > 0 && (
        <div className="workout-change-list">
          <span>{live ? 'Changed most' : 'Changed most / demo'}</span>
          {changed.map((d) => (
            <strong key={d.key}>
              {labels.short(d.key)} <span aria-hidden="true">{arrow(d.zClipped ?? 0)}</span>
              <span className="visually-hidden">{(d.zClipped ?? 0) > 0 ? ` (${labels.up(d.key)})` : ` (${labels.down(d.key)})`}</span>
            </strong>
          ))}
        </div>
      )}

      {big && (
        <div className="focus-big">
          <span className="st-numeral focus-num">{big.value}</span>
          <span className="focus-num-label">{big.label}</span>
          {s.phase === 'recovery' && (
            <div className="focus-cells" aria-hidden="true">
              {Array.from({ length: RECOVERY_REPS }, (_, i) => (
                <i key={i} className={i < s.recoveryReps.length ? 'on' : ''} />
              ))}
            </div>
          )}
        </div>
      )}

      {(actions.primary || actions.secondary) && (
        <div className="focus-actions workout-command-actions">
          {actions.primary && (
            <button
              className={`btn lg primary ${actions.primary.kind === 'stop' ? 'workout-end-action is-stop' : actions.primary.kind === 'end' ? 'workout-end-action' : 'workout-primary'}`}
              onClick={actions.primary.run}
            >
              {actions.primary.label}
              <span className="kbd" aria-hidden>
                Enter
              </span>
            </button>
          )}
          {actions.secondary?.map((b) => (
            <button key={b.label} className="btn lg" onClick={b.run}>
              {b.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
