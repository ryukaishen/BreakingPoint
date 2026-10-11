// The athlete view: readable from about 3 metres. At any moment it answers
// three questions (what state am I in, which rep is this, how am I doing
// against my own record) and gives one instruction.
//
// It has no live region of its own: SessionAnnouncer is the only one, so a
// screen reader hears state changes once instead of every rep.

import { useEffect, useRef, useState } from 'react';
import type { StoredBaseline } from '../../data/types';
import { heldReps } from '../../data/progress';
import type { LaunchContext } from '../../protocols/launch';
import { RECOVERY_REPS, type Snapshot } from '../../session/engine';
import type { Countdown } from '../../session/useHandsFree';
import { Check } from '../Icons';
import { RecordLane } from './RecordLane';

interface Props {
  snap: Snapshot;
  mode: 'demo' | 'live';
  launch: LaunchContext;
  bestHeld: number | null;
  savedBaseline: StoredBaseline | null;
  countdown: Countdown | null;
  handsFree: boolean;
  onStartCalibration: () => void;
  onFinishCalibration: () => void;
  onUseSaved: () => void;
  onStartMonitoring: () => void;
  onEndSet: () => void;
  onStartRecovery: () => void;
  onShowSummary: () => void;
  onNewSet: () => void;
}

type Tone = 'stable' | 'drift' | 'break' | 'neutral' | 'calm';

interface View {
  plate: string;
  tone: Tone;
  instruction: string;
  /** The big number, with what it counts. */
  big: string | null;
  bigLabel: string;
  primary?: { label: string; run: () => void };
  secondary?: { label: string; run: () => void }[];
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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Live camera setup: what the athlete has to get right before calibration. */
function SetupChecklist({ snap, launch }: { snap: Snapshot; launch: LaunchContext }) {
  const l = snap.live;
  const items = [
    { ok: l.present, text: 'Athlete in frame' },
    { ok: l.quality >= 0.65, text: 'Whole body visible, head to feet' },
    { ok: l.present && l.calibrated, text: 'Standing still for a moment' },
  ];
  return (
    <div className="focus-setup">
      <p className="focus-setup-how">
        {launch.protocol.camera}. Camera at hip height, about 2.5 to 3.5 m away, in even light.
      </p>
      <ul className="focus-checks">
        {items.map((it) => (
          <li key={it.text} className={it.ok ? 'ok' : ''}>
            <span className="ic" aria-hidden>
              {it.ok ? <Check size={12} /> : null}
            </span>
            {it.text}
            <span className="visually-hidden">{it.ok ? ' (done)' : ' (not yet)'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FocusPanel(p: Props) {
  const s = p.snap;
  const restStart = useRef<number | null>(null);
  if (s.phase === 'summary' && restStart.current === null) restStart.current = Date.now();
  if (s.phase !== 'summary' && s.phase !== 'recovery' && s.phase !== 'recoveryDone') restStart.current = null;
  const now = useNow(s.phase === 'summary');
  const held = heldReps(s.monitorReps);
  const live = p.mode === 'live';

  const view = ((): View => {
    switch (s.phase) {
      case 'idle': {
        const inFrame = s.live.present && s.live.quality >= 0.65;
        return {
          plate: 'Set up',
          tone: 'neutral',
          instruction: !live
            ? 'Starting the demo with a synthetic athlete.'
            : !s.live.present
              ? 'Step into the frame, side-on to the camera.'
              : !inFrame
                ? 'Move back until your whole body is visible, head to feet.'
                : p.handsFree
                  ? 'Stand still. Calibration starts automatically.'
                  : 'Ready when you are.',
          big: null,
          bigLabel: '',
          primary: live ? { label: 'Start calibration', run: p.onStartCalibration } : undefined,
          secondary:
            live && p.savedBaseline
              ? [{ label: `Use saved baseline (${new Date(p.savedBaseline.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`, run: p.onUseSaved }]
              : undefined,
        };
      }
      case 'calibrating':
        return {
          plate: 'Calibrate',
          tone: 'calm',
          instruction: 'Controlled reps at your normal tempo. Each one teaches BreakingPoint how you move when fresh.',
          big: String(s.calibrationReps.length),
          bigLabel: `of ${s.calibrationTarget} fresh reps`,
          secondary: live && s.calibrationReps.length >= 5 ? [{ label: 'Finish calibration', run: p.onFinishCalibration }] : undefined,
        };
      case 'baseline':
        return {
          plate: 'Baseline locked',
          tone: 'calm',
          instruction: live ? 'Get ready. Do your set at your normal tempo.' : 'The monitored set starts next.',
          big: null,
          bigLabel: '',
          primary: live ? { label: 'Start the set now', run: p.onStartMonitoring } : undefined,
        };
      case 'monitoring': {
        const n = s.monitorReps.length;
        if (s.alarmRep !== null)
          return {
            plate: 'Stop',
            tone: 'break',
            instruction: `The alert triggered at rep ${s.alarmRep}. End the set and rest.`,
            big: String(n),
            bigLabel: n === 1 ? 'rep' : 'reps',
            // The demo athlete stops on their own; a live athlete ends the set here (or hands-free does).
            primary: live ? { label: 'End set', run: p.onEndSet } : undefined,
          };
        if (s.state === 'DRIFT')
          return {
            plate: 'Form changing',
            tone: 'drift',
            instruction: 'Your form is starting to change. Be ready to stop.',
            big: String(n),
            bigLabel: n === 1 ? 'rep' : 'reps',
            primary: live ? { label: 'End set', run: p.onEndSet } : undefined,
          };
        return {
          plate: 'Stable',
          tone: 'stable',
          instruction: n ? 'Your reps match your usual form.' : 'Start your set.',
          big: String(n),
          bigLabel: n === 1 ? 'rep' : 'reps',
          primary: live && n ? { label: 'End set', run: p.onEndSet } : undefined,
        };
      }
      case 'summary':
        if (s.alarmRep !== null)
          return {
            plate: 'Rest',
            tone: 'calm',
            instruction: 'Set saved. Rest until you feel ready, then check your recovery against your usual form.',
            big: mmss(now - (restStart.current ?? now)),
            bigLabel: 'resting',
            primary: { label: `Start recovery check (${RECOVERY_REPS} reps)`, run: p.onStartRecovery },
            secondary: [{ label: 'Session summary', run: p.onShowSummary }],
          };
        return {
          plate: 'Set complete',
          tone: 'stable',
          instruction: `No alert. You held your usual form for ${plural(held, 'rep')}.`,
          big: String(s.monitorReps.length),
          bigLabel: 'reps',
          primary: { label: 'Session summary', run: p.onShowSummary },
          secondary: [{ label: 'New set', run: p.onNewSet }],
        };
      case 'recovery':
        return {
          plate: 'Recovery check',
          tone: 'calm',
          instruction: `${RECOVERY_REPS} controlled reps, compared with your usual form.`,
          big: String(s.recoveryReps.length),
          bigLabel: `of ${RECOVERY_REPS} reps`,
        };
      case 'recoveryDone': {
        const r = s.recovery;
        const status = r?.status ?? 'persistent';
        return {
          plate: status === 'recovered' ? 'Back to your usual form' : status === 'partial' ? 'Partly back' : 'Still different',
          tone: status === 'recovered' ? 'stable' : status === 'partial' ? 'drift' : 'break',
          instruction:
            status === 'recovered'
              ? 'Your form is back within your normal range.'
              : status === 'partial'
                ? 'Consider more rest or a lighter session before you test again.'
                : 'Your form is still different from your usual form. Consider keeping the rest of today light.',
          big: r ? `${Math.round(r.percent * 100)}%` : '—',
          bigLabel: 'of the change gone',
          primary: { label: 'Session summary', run: p.onShowSummary },
          secondary: [{ label: 'New set', run: p.onNewSet }],
        };
      }
    }
  })();

  const counting = p.countdown;
  const showLane = s.phase === 'monitoring';

  // Enter runs the primary action when nothing else has focus (handy when walking back to the laptop).
  const primaryRef = useRef(view.primary);
  primaryRef.current = view.primary;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== 'Enter' || e.repeat || (el && el !== document.body)) return;
      primaryRef.current?.run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <section className={`focus tone-${view.tone}`} aria-label="Athlete view">
      <div className="focus-state">
        <span className="plate">{view.plate}</span>
        <p className="focus-instruction">{view.instruction}</p>
      </div>

      {live && s.phase === 'idle' && <SetupChecklist snap={s} launch={p.launch} />}

      {(counting || view.big !== null) && (
        <div className="focus-big">
          {counting ? (
            <>
              <span className="focus-num-label">{counting.label}</span>
              <span className="num-hero focus-num">{counting.seconds}</span>
            </>
          ) : (
            <>
              <span className="num-hero focus-num">{view.big}</span>
              <span className="focus-num-label">{view.bigLabel}</span>
            </>
          )}
          {s.phase === 'calibrating' && (
            <div className="focus-cells" aria-hidden>
              {Array.from({ length: Math.max(s.calibrationTarget, s.calibrationReps.length) }, (_, i) => (
                <i key={i} className={i < s.calibrationReps.length ? 'on' : ''} />
              ))}
            </div>
          )}
          {s.phase === 'recovery' && (
            <div className="focus-cells" aria-hidden>
              {Array.from({ length: RECOVERY_REPS }, (_, i) => (
                <i key={i} className={i < s.recoveryReps.length ? 'on' : ''} />
              ))}
            </div>
          )}
        </div>
      )}

      {showLane && <RecordLane held={held} best={p.bestHeld} frozen={s.alarmRep !== null} />}

      {(view.primary || view.secondary) && (
        <div className="focus-actions">
          {view.primary && (
            <button className="btn lg primary" onClick={view.primary.run}>
              {view.primary.label}
              <span className="kbd" aria-hidden>
                Enter
              </span>
            </button>
          )}
          {view.secondary?.map((b) => (
            <button key={b.label} className="btn lg" onClick={b.run}>
              {b.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
