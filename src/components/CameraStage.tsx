import { useEffect, useRef, useState, type RefObject } from 'react';
import { containRect, drawPose, drawStudio, segmentsForFeatures } from '../pose/draw';
import type { LaunchContext } from '../protocols/launch';
import { LiveRunner, type Runner } from '../session/runners';
import type { Snapshot } from '../session/engine';
import { STATE_COLOR } from '../utils/format';
import { Lock, Pause, Play, Skip } from './Icons';

interface Props {
  snap: Snapshot;
  launch: LaunchContext;
  runner: Runner | null;
  videoRef: RefObject<HTMLVideoElement>;
  liveStatus: string;
  liveError: string | null;
  flash: boolean;
  demoSpeed: number;
  demoPaused: boolean;
  onDemoSpeed: (s: number) => void;
  onDemoPause: () => void;
  onDemoSkip: () => void;
  onRetryLive: () => void;
  onSwitchToDemo: () => void;
}

const PHASE_TEXT: Record<string, string> = {
  standing: 'Standing', descending: 'Descending', bottom: 'Bottom', ascending: 'Ascending', dip: 'Countermovement',
  propulsion: 'Propulsion', flight: 'Flight', landing: 'Landing', lost: 'Tracking lost',
};

const QUALITY_COLOR: Record<string, string> = { Excellent: '#2ee59d', Good: '#59d0ff', Poor: '#ffb020', 'No athlete': '#ff4d5e' };

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
            const inMonitor = s.phase === 'monitoring' || s.phase === 'summary';
            const color = inMonitor ? STATE_COLOR[s.state] : s.phase === 'recovery' || s.phase === 'recoveryDone' ? '#a594ff' : '#59d0ff';
            const top = s.state === 'BREAKPOINT' && s.breakpointContributors ? s.breakpointContributors.slice(0, 2).map((d) => d.key) : [];
            drawPose(ctx, pose, rect, {
              mirror: p.runner?.kind === 'live',
              color,
              highlight: segmentsForFeatures(top),
              highlightColor: '#ff4d5e',
            });
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [p.runner]);

  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const s = p.snap;
  const live = s.live;
  const repCount =
    s.phase === 'calibrating' || (s.phase === 'baseline' && s.calibrationReps.length)
      ? s.calibrationReps.length
      : s.phase === 'recovery' || s.phase === 'recoveryDone'
        ? s.recoveryReps.length
        : s.monitorReps.length;
  const ctxLabel =
    s.phase === 'calibrating' ? `CALIBRATION · ${repCount}/${s.calibrationTarget}` : s.phase === 'recovery' || s.phase === 'recoveryDone' ? 'RECOVERY CHECK' : s.phase === 'monitoring' || s.phase === 'summary' ? 'MONITORED SET' : 'READY';
  const isDemo = p.runner?.kind === 'demo';
  const baseDepth = s.baseline?.features[s.exercise === 'cmj' ? 'countermovementDepth' : 'depth'];
  const gaugeMax = s.exercise === 'squat' ? 0.75 : s.exercise === 'lunge' ? 0.6 : 0.45;
  const phaseText = p.launch.primitive.phaseLabels[live.repPhase] ?? PHASE_TEXT[live.repPhase] ?? live.repPhase;
  const depthNow = Math.max(0, Math.min(gaugeMax, live.depth));

  return (
    <div className={`stage ${p.flash ? 'flash' : ''} ${s.state === 'BREAKPOINT' && s.phase === 'monitoring' ? 'breakpoint' : ''}`} ref={wrapRef}>
      <video ref={p.videoRef} muted playsInline style={{ display: p.runner?.kind === 'live' ? 'block' : 'none' }} />
      <canvas ref={canvasRef} />

      <div className="ov ov-tl">
        <div className="rep-counter">
          <span className="lbl">REP</span>
          <span className="val mono" style={{ color: s.phase === 'monitoring' && s.monitorReps.length ? STATE_COLOR[s.state] : '#e9eef6' }}>{repCount}</span>
          <span className="ctx">{ctxLabel}</span>
        </div>
        <div className="phase-pill">
          <span className="qdot" style={{ background: live.repPhase === 'standing' ? '#7f8b9d' : '#59d0ff' }} />
          {phaseText}
        </div>
      </div>

      {isDemo && (
        <div className="ov ov-tc">
          <span className="demo-watermark" title="Synthetic landmarks go through exactly the same pipeline as camera frames">
            Demo dataset · synthetic athlete
          </span>
        </div>
      )}

      <div className="ov ov-tr">
        <div className="chip" title="Capture quality from landmark confidence and framing. Poor-quality reps are not scored.">
          <span className="k">Capture quality</span>
          <span className="qdot" style={{ background: QUALITY_COLOR[live.qualityLabel] }} />
          <span>{live.qualityLabel}</span>
        </div>
        {live.kneeFlex !== null && (
          <div className="chip">
            <span className="k">Knee</span>
            <span className="mono">{live.kneeFlex.toFixed(0)}°</span>
            <span className="k">Trunk</span>
            <span className="mono">{live.trunkLean !== null ? `${live.trunkLean.toFixed(0)}°` : '—'}</span>
          </div>
        )}
        <div className="depth-gauge" title="Live hip drop vs your baseline depth range">
          <div className="lbl">DEPTH</div>
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
            <div className="fill" style={{ height: `${(depthNow / gaugeMax) * 100}%` }} />
          </div>
          {baseDepth && <div className="lbl" style={{ color: '#2ee59d' }}>YOUR<br />RANGE</div>}
        </div>
      </div>

      <div className="ov ov-bl">
        {isDemo && (
          <div className="athlete-card">
            <div className="ac-name">{s.athlete.toUpperCase()}</div>
            <div className="ac-row">
              <span>Sport</span>
              <b>{p.launch.contextName}</b>
            </div>
            <div className="ac-row">
              <span>Protocol</span>
              <b>{p.launch.title}</b>
            </div>
            <div className="ac-row">
              <span>Session</span>
              <b>{p.launch.session}</b>
            </div>
          </div>
        )}
        {isDemo ? (
          <div className="speed-ctl">
            <button className="btn sm" onClick={p.onDemoPause} title="Pause / resume (Space)">
              {p.demoPaused ? <Play size={13} /> : <Pause size={13} />}
            </button>
            <div className="seg">
              {[1, 2, 4].map((v) => (
                <button key={v} className={p.demoSpeed === v ? 'active' : ''} onClick={() => p.onDemoSpeed(v)}>
                  {v}×
                </button>
              ))}
            </div>
            <button className="btn sm" onClick={p.onDemoSkip} title="Skip to the end of this stage">
              <Skip size={13} /> Skip
            </button>
          </div>
        ) : (
          <span className="privacy-note mono" style={{ fontSize: 11 }}>
            {p.runner instanceof LiveRunner
              ? p.runner.pose.status === 'ready'
                ? `${p.runner.fps.toFixed(0)} fps · on-device pose model (${p.runner.pose.delegate})`
                : 'loading on-device pose model…'
              : ''}
          </span>
        )}
      </div>

      <div className="ov ov-br">
        <span className="privacy-note">
          <Lock size={13} /> Video never leaves your device
        </span>
      </div>

      {p.runner?.kind === 'live' && (p.liveStatus || p.liveError) && (
        <div className="stage-center">
          <div className="box">
            {p.liveError ? (
              <>
                <h3>Camera unavailable</h3>
                <p>{p.liveError}</p>
                <div className="row" style={{ justifyContent: 'center' }}>
                  <button className="btn" onClick={p.onRetryLive}>Try again</button>
                  <button className="btn primary" onClick={p.onSwitchToDemo}>Run demo dataset</button>
                </div>
              </>
            ) : (
              <>
                <h3>{p.liveStatus}</h3>
                <p>The pose model runs entirely in your browser.</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
