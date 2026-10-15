import { useEffect, useRef, useState, type RefObject } from 'react';
import bracketsSvg from '../assets/camera-brackets.svg';
import trainingSpaceSvg from '../assets/training-space.svg';
import { containRect, drawPose, drawStudio, segmentsForFeatures } from '../pose/draw';
import type { LaunchContext } from '../protocols/launch';
import { LiveRunner, type Runner } from '../session/runners';
import type { Snapshot } from '../session/engine';
import type { WorkoutView } from '../session/workoutView';
import type { MovementState } from '../detection/detector';
import { C, ST } from '../ui/theme';
import { TechnicalCorners } from './system/TechnicalCorners';

interface Props {
  snap: Snapshot;
  launch: LaunchContext;
  runner: Runner | null;
  videoRef: RefObject<HTMLVideoElement>;
  /** What the workout screen shows now, from session/workoutView.ts. */
  view: WorkoutView;
  flash: boolean;
  /** Show detector overlays (rep phase, joint angles, depth gauge) for coaches. Off keeps the athlete view quiet. */
  evidence?: boolean;
  onRetryLive: () => void;
  onSwitchToDemo: () => void;
  /**
   * Ends the monitored set through the engine. Live sets only: the demo athlete stops on their own.
   * Offered on the STOP alert and when the camera stops during a set.
   */
  onEndSet?: () => void;
}

/** Pose colour in the monitored set, from the System Threshold palette (same values as the CSS tokens). */
const POSE_STATE_COLOR: Record<MovementState, string> = { STABLE: ST.cyan, DRIFT: ST.amber, BREAKPOINT: ST.stop };

const PHASE_TEXT: Record<string, string> = {
  standing: 'Standing', descending: 'Descending', bottom: 'Bottom', ascending: 'Ascending', dip: 'Countermovement',
  propulsion: 'Propulsion', flight: 'Flight', landing: 'Landing', lost: 'Tracking lost',
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * The camera of Figma Make's live workout: the real video and pose overlay under Make's HUD (feed
 * label, capture quality, current state and Form Change Score, rep count), with the camera messages,
 * the baseline lock and the STOP alert over it. Every label comes from the session; the demo shows the
 * synthetic athlete on Make's training-space floor, the live camera shows only the athlete.
 */
export function CameraStage(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const snapRef = useRef(p.snap);
  snapRef.current = p.snap;
  const [, force] = useState(0);

  // Imperative draw loop: reads the latest smoothed pose; React is not involved per frame.
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const c = canvasRef.current;
      const wrap = wrapRef.current;
      if (c && wrap) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = wrap.clientWidth;
        const h = wrap.clientHeight;
        if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
          c.width = Math.round(w * dpr);
          c.height = Math.round(h * dpr);
        }
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const aspect = p.runner?.aspect ?? 16 / 9;
          const rect = containRect(w, h, aspect);
          if (p.runner?.kind === 'demo') drawStudio(ctx, rect, w, h);
          else ctx.clearRect(0, 0, w, h);
          const pose = p.runner?.pipeline.lastPose;
          const s = snapRef.current;
          if (pose) {
            const inMonitor = s.phase === 'monitoring';
            const color = inMonitor ? POSE_STATE_COLOR[s.state] : s.phase === 'recovery' || s.phase === 'recoveryDone' ? ST.violetHi : ST.cyan;
            const top = inMonitor && s.state === 'BREAKPOINT' && s.breakpointContributors ? s.breakpointContributors.slice(0, 2).map((d) => d.key) : [];
            drawPose(ctx, pose, rect, {
              mirror: p.runner?.kind === 'live',
              color,
              highlight: segmentsForFeatures(top),
              highlightColor: ST.stop,
            });
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [p.runner]);

  // The fps readout refreshes once a second.
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const s = p.snap;
  const v = p.view;
  const live = s.live;
  const isDemo = p.runner?.kind === 'demo';
  const baseDepth = s.baseline?.features[s.exercise === 'cmj' ? 'countermovementDepth' : 'depth'];
  const gaugeMax = s.exercise === 'squat' ? 0.75 : s.exercise === 'lunge' ? 0.6 : 0.45;
  const phaseText = p.launch.primitive.phaseLabels[live.repPhase] ?? PHASE_TEXT[live.repPhase] ?? live.repPhase;
  const depthNow = Math.max(0, Math.min(gaugeMax, live.depth));
  const overlays = p.evidence !== false && !v.cameraMessage;
  const stopped = v.state === 'stop';
  const pending = v.state === 'permission-pending' || v.state === 'starting';
  const fpsText =
    p.runner instanceof LiveRunner
      ? p.runner.pose.status === 'ready'
        ? `${p.runner.fps.toFixed(0)} fps, on-device pose model (${p.runner.pose.delegate})`
        : 'loading on-device pose model…'
      : '';

  return (
    <div className={`stage workout-camera ${p.flash ? 'flash' : ''} ${stopped ? 'breakpoint' : ''}`} ref={wrapRef}>
      <div className="workout-camera-grid" aria-hidden="true" />
      <video ref={p.videoRef} muted playsInline style={{ display: p.runner?.kind === 'live' ? 'block' : 'none' }} />
      {isDemo && <img className="workout-perspective" src={trainingSpaceSvg} alt="" aria-hidden="true" />}
      <canvas ref={canvasRef} />
      <div className="workout-scan" aria-hidden="true">
        <i />
      </div>
      <img className="workout-brackets" src={bracketsSvg} alt="" aria-hidden="true" />

      <div className="workout-feed-label">
        <span>{isDemo ? 'Demo dataset / synthetic athlete' : 'Live camera / on this device'}</span>
        {isDemo ? (
          <small>
            {s.athlete} / {p.launch.session}
          </small>
        ) : (
          <>
            {fpsText && <small className="privacy-note mono">{fpsText}</small>}
            <small>Video never leaves this device</small>
          </>
        )}
      </div>

      <div className="workout-quality-hud" title="Capture quality from landmark confidence and framing. Poor-quality reps are not scored.">
        <span>Capture quality</span>
        <strong className={`q-${v.quality.label.toLowerCase().replace(/\s+/g, '-')}`}>{v.quality.label}</strong>
        <small>{v.quality.detail}</small>
      </div>

      {overlays && (
        <div className="workout-evidence">
          <div className="phase-pill">
            <span className="qdot" style={{ background: live.repPhase === 'standing' ? C.muted : C.sys }} />
            {phaseText}
          </div>
          {live.kneeFlex !== null && (
            <div className="chip">
              <span className="k">Knee</span>
              <span className="mono">{live.kneeFlex.toFixed(0)}°</span>
              <span className="k">Trunk</span>
              <span className="mono">{live.trunkLean !== null ? `${live.trunkLean.toFixed(0)}°` : '—'}</span>
            </div>
          )}
          <div className="depth-gauge" title="Live hip drop compared with your usual depth">
            <div className="lbl">Depth</div>
            <div className="track">
              {baseDepth && (
                <div
                  className="band"
                  style={{
                    top: `${(Math.max(0, baseDepth.center - baseDepth.scale) / gaugeMax) * 100}%`,
                    height: `${((2 * baseDepth.scale) / gaugeMax) * 100}%`,
                  }}
                />
              )}
              <div className="fill" style={{ transform: `scaleY(${depthNow / gaugeMax})` }} />
            </div>
            {baseDepth && (
              <div className="lbl" style={{ color: C.stable }}>
                Your
                <br />
                range
              </div>
            )}
          </div>
        </div>
      )}

      {!v.cameraMessage && (
        <div className="workout-state-hud">
          <span>Current state</span>
          <strong className="stage-state">{v.plate}</strong>
          {v.score && (
            <small>
              Form Change Score {v.score.value !== null ? v.score.value.toFixed(2) : '—'} / rep {pad2(s.monitorReps.length)}
            </small>
          )}
        </div>
      )}

      {v.rep && (
        <div className="workout-rep-hud">
          <strong>{pad2(v.rep.value)}</strong>
          <span>{v.rep.label}</span>
        </div>
      )}

      {v.state === 'baseline' && (
        <div className="workout-baseline-lock">
          <TechnicalCorners />
          <span>Personal baseline / {s.calibrationReps.length ? `${s.calibrationReps.length} fresh reps` : 'saved'}</span>
          <strong>Baseline locked</strong>
          <p>Your usual form is set for this athlete and movement.</p>
        </div>
      )}

      {stopped && (
        <div className="workout-stop-alert">
          <span aria-hidden="true">!</span>
          <div>
            <small>Breaking point / rep {s.alarmRep}</small>
            <strong>Stop</strong>
            <p>End the set and rest.</p>
          </div>
          {p.onEndSet && (
            <button type="button" className="threshold-action stage-end" onClick={p.onEndSet}>
              End set
            </button>
          )}
        </div>
      )}

      {v.cameraMessage && (
        <div className="stage-center">
          <div className="workout-center-message">
            <span className="workout-center-symbol" aria-hidden="true">
              {pending ? '…' : '×'}
            </span>
            <strong>{v.plate}</strong>
            <p>{v.instruction}</p>
            {!pending && (
              <div>
                <button type="button" className="threshold-action" onClick={p.onRetryLive}>
                  Try again
                </button>
                {v.state === 'camera-failure' && s.phase === 'monitoring' && p.onEndSet ? (
                  <button type="button" className="threshold-action" onClick={p.onEndSet}>
                    End set
                  </button>
                ) : (
                  <button type="button" className="threshold-action" onClick={p.onSwitchToDemo}>
                    Run demo dataset
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
