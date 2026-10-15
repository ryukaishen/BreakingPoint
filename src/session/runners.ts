// Frame sources. Both feed the same PosePipeline → SessionEngine.

import type { ExerciseType } from '../biomechanics/catalog';
import { DemoController } from '../demo/demoController';
import { FPS } from '../demo/syntheticAthlete';
import { PoseEngine } from '../pose/poseEngine';
import type { SessionEngine } from './engine';
import { PosePipeline } from './pipeline';

export interface Runner {
  kind: 'live' | 'demo';
  pipeline: PosePipeline;
  aspect: number;
  stop(): void;
}

export class DemoRunner implements Runner {
  kind = 'demo' as const;
  aspect = 16 / 9;
  readonly demo: DemoController;
  speed = 2;
  paused = false;
  private timer = 0;
  private last = 0;
  private acc = 0;

  constructor(engine: SessionEngine, exercise: ExerciseType) {
    this.demo = new DemoController(engine, exercise, this.aspect);
    // In the app the synthetic athlete follows the product's instruction and stops after the warning.
    this.demo.stopAfterWarning = 1;
  }

  get pipeline(): PosePipeline {
    return this.demo.pipeline;
  }

  // The simulation clock runs on a timer (not requestAnimationFrame) so playback
  // keeps going in throttled/background tabs; drawing still uses rAF.
  start() {
    this.demo.start();
    this.last = performance.now();
    this.timer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(1, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      if (this.paused) return;
      this.acc += dt * this.speed * FPS;
      const n = Math.floor(this.acc);
      this.acc -= n;
      if (n > 0) this.demo.advance(n);
    }, 1000 / FPS);
  }

  /** Jump ahead to the end of the current stage (useful when presenting). */
  skipToEnd() {
    if (this.demo.stage === 'recovery') {
      while (this.demo.stage === 'recovery') this.demo.advance(1);
    } else this.demo.runToEnd(false);
  }

  stop() {
    window.clearInterval(this.timer);
  }
}

/** Why a live session could not start, in terms the athlete can act on. */
export type CameraProblem = 'denied' | 'missing' | 'busy' | 'insecure' | 'model' | 'other';

export class CameraError extends Error {
  constructor(
    readonly problem: CameraProblem,
    message: string,
  ) {
    super(message);
    this.name = 'CameraError';
  }

  /** Map a getUserMedia failure (a DOMException name) to a problem the UI can explain. */
  static from(e: unknown): CameraError {
    const name = (e as { name?: string } | null)?.name ?? '';
    const msg = e instanceof Error ? e.message : String(e);
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') return new CameraError('denied', msg);
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return new CameraError('missing', msg);
    if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return new CameraError('busy', msg);
    return new CameraError('other', msg);
  }
}

/** The message shown when a live session cannot start. */
export function cameraErrorText(e: unknown): string {
  const problem = e instanceof CameraError ? e.problem : 'other';
  switch (problem) {
    case 'denied':
      return 'Camera permission was denied. Allow camera access for this site in your browser settings, then try again. You can also run a demo.';
    case 'missing':
      return 'No camera was found. Connect a camera and try again, or run a demo.';
    case 'busy':
      return 'The camera is being used by another app or tab. Close it, then try again.';
    case 'insecure':
      return 'Camera access needs a secure page. Open BreakingPoint over https (or on localhost) to use your camera.';
    case 'model':
      return 'The camera works, but the pose model could not load. Check your connection and try again.';
    default:
      return `Could not start the camera (${e instanceof Error ? e.message : String(e)}).`;
  }
}

export class LiveRunner implements Runner {
  kind = 'live' as const;
  aspect = 16 / 9;
  readonly pipeline: PosePipeline;
  readonly pose = new PoseEngine();
  private stream: MediaStream | null = null;
  private raf = 0;
  private stopped = false;
  /** The camera ended on its own: the pose loop stops, the session stays open. */
  private ended = false;
  fps = 0;
  private frames = 0;
  private fpsT = 0;

  constructor(
    engine: SessionEngine,
    readonly video: HTMLVideoElement,
  ) {
    this.pipeline = new PosePipeline(engine, this.aspect);
  }

  /**
   * Starts the camera and the pose loop. `onEnded` fires if the camera stops on its own during the
   * session (unplugged, taken by another app, permission revoked); stop() never triggers it.
   */
  async start(onStatus?: (s: string) => void, onEnded?: () => void) {
    // Browsers expose the camera only to secure pages (https or localhost).
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new CameraError('insecure', 'Camera access needs a secure (https) page.');
    }
    onStatus?.('Requesting camera…');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
    } catch (e) {
      throw CameraError.from(e);
    }
    // The session may have been left while the permission prompt was open: release the camera at once.
    if (this.stopped) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    for (const track of stream.getVideoTracks()) {
      track.addEventListener('ended', () => {
        if (this.stopped || this.ended) return;
        this.ended = true;
        cancelAnimationFrame(this.raf);
        onEnded?.();
      });
    }
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
    this.aspect = this.video.videoWidth / Math.max(1, this.video.videoHeight) || 16 / 9;
    this.pipeline.setAspect(this.aspect);
    onStatus?.('Loading pose model (runs locally)…');
    try {
      await this.pose.init();
    } catch (e) {
      throw new CameraError('model', e instanceof Error ? e.message : String(e));
    }
    if (this.stopped) {
      this.pose.close();
      return;
    }
    onStatus?.('');
    this.fpsT = performance.now();
    const loop = () => {
      if (this.stopped || this.ended) return;
      const now = performance.now();
      const pose = this.pose.detect(this.video, now);
      this.pipeline.push(pose, now / 1000);
      this.frames++;
      if (now - this.fpsT > 1000) {
        this.fps = (this.frames * 1000) / (now - this.fpsT);
        this.frames = 0;
        this.fpsT = now;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.pose.close();
  }
}
