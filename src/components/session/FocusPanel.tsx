// The athlete view: readable from about 3 metres. At any moment it answers
// three questions — what state am I in, which rep is this, how am I doing
// against my own record — and gives one instruction.

import { useEffect, useRef, useState } from 'react';
import type { StoredBaseline } from '../../data/types';
import { heldReps } from '../../data/progress';
import type { LaunchContext } from '../../protocols/launch';
import { RECOVERY_REPS, type Snapshot } from '../../session/engine';
import type { Countdown } from '../../session/useHandsFree';
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
  onOpenDebrief: () => void;
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
  primary?: { label: string; run: () => void; tone?: 'stop' };
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
          instruction: !s.live.present
            ? 'Step into the frame, side-on to the camera.'
            : !inFrame
              ? 'Move back until your whole body is visible, head to feet.'
              : p.handsFree
                ? 'Stand still. Calibration starts automatically.'
                : 'Ready when you are.',
          big: null,
          bigLabel: '',
          primary: { label: 'Start calibration', run: p.onStartCalibration },
          secondary: p.savedBaseline
            ? [{ label: `Use saved baseline (${new Date(p.savedBaseline.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })})`, run: p.onUseSaved }]
            : undefined,
        };
      }
      case 'calibrating':
        return {
          plate: 'Calibrate',
          tone: 'calm',
          instruction: `Controlled reps at your normal tempo. Each one teaches BreakingPoint how you move when fresh.`,
          big: String(s.calibrationReps.length),
          bigLabel: `of ${s.calibrationTarget} fresh reps`,
          secondary: live && s.calibrationReps.length >= 5 ? [{ label: 'Finish calibration', run: p.onFinishCalibration }] : undefined,
        };
      case 'baseline':
        return {
          plate: 'Baseline locked',
          tone: 'calm',
          instruction: live ? 'Get ready. Perform your set at your normal tempo.' : 'The monitored set starts next.',
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
            instruction: `Breaking point at rep ${s.alarmRep}. End the set and rest.`,
            big: String(n),
            bigLabel: n === 1 ? 'rep' : 'reps',
            primary: { label: 'End set', run: p.onEndSet, tone: 'stop' },
          };
        if (s.state === 'DRIFT')
          return {
            plate: 'Drift',
            tone: 'drift',
            instruction: 'Your movement is changing. Be ready to stop.',
            big: String(n),
            bigLabel: n === 1 ? 'rep' : 'reps',
            primary: live ? { label: 'End set', run: p.onEndSet } : undefined,
          };
        return {
          plate: 'Stable',
          tone: 'stable',
          instruction: n ? 'Movement matches your baseline.' : 'Start your set.',
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
            instruction: 'Set saved. Rest until you feel ready, then check your recovery against your original baseline.',
            big: mmss(now - (restStart.current ?? now)),
            bigLabel: 'resting',
            primary: { label: `Start recovery check (${RECOVERY_REPS} reps)`, run: p.onStartRecovery },
            secondary: [{ label: 'Skip to debrief', run: p.onOpenDebrief }],
          };
        return {
          plate: 'Set complete',
          tone: 'stable',
          instruction: `No breaking point. You held your baseline for ${held} rep${held === 1 ? '' : 's'}.`,
          big: String(s.monitorReps.length),
          bigLabel: 'reps',
          primary: { label: 'View debrief', run: p.onOpenDebrief },
          secondary: [{ label: 'New set', run: p.onNewSet }],
        };
      case 'recovery':
        return {
          plate: 'Recovery check',
          tone: 'calm',
          instruction: `${RECOVERY_REPS} controlled reps, compared with your original baseline.`,
          big: String(s.recoveryReps.length),
          bigLabel: `of ${RECOVERY_REPS} reps`,
        };
      case 'recoveryDone': {
        const r = s.recovery;
        const status = r?.status ?? 'persistent';
        return {
          plate: status === 'recovered' ? 'Back to baseline' : status === 'partial' ? 'Partly recovered' : 'Drift persists',
          tone: status === 'recovered' ? 'stable' : status === 'partial' ? 'drift' : 'break',
          instruction:
            status === 'recovered'
              ? 'Your movement is back within your normal range.'
              : status === 'partial'
                ? 'Consider more rest or a lighter session before reassessing.'
                : 'Consider ending intense work for today.',
          big: r ? `${Math.round(r.percent * 100)}%` : '—',
          bigLabel: 'returned toward baseline',
          primary: { label: 'View debrief', run: p.onOpenDebrief },
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
      if (e.key !== 'Enter' || (el && el !== document.body)) return;
      primaryRef.current?.run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <section className={`focus tone-${view.tone}`} aria-label="Athlete view">
      <div className="focus-state" role="status" aria-live="assertive" aria-atomic="true">
        <span className="plate">{view.plate}</span>
        <p className="focus-instruction">{view.instruction}</p>
      </div>

      <div className="focus-big" aria-live="off">
        {counting ? (
          <>
            <span className="focus-count-label">{counting.label}</span>
            <span className="focus-num">{counting.seconds}</span>
          </>
        ) : view.big !== null ? (
          <>
            <span className="focus-num">{view.big}</span>
            <span className="focus-num-label">{view.bigLabel}</span>
          </>
        ) : null}
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

      {showLane && <RecordLane held={held} best={p.bestHeld} frozen={s.alarmRep !== null} />}

      {(view.primary || view.secondary) && (
        <div className="focus-actions">
          {view.primary && (
            <button className={`btn lg ${view.primary.tone === 'stop' ? 'stop' : 'primary'}`} onClick={view.primary.run}>
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
