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

export class LiveRunner implements Runner {
  kind = 'live' as const;
  aspect = 16 / 9;
  readonly pipeline: PosePipeline;
  readonly pose = new PoseEngine();
  private stream: MediaStream | null = null;
  private raf = 0;
  private stopped = false;
  fps = 0;
  private frames = 0;
  private fpsT = 0;

  constructor(
    engine: SessionEngine,
    readonly video: HTMLVideoElement,
  ) {
    this.pipeline = new PosePipeline(engine, this.aspect);
  }

  async start(onStatus?: (s: string) => void) {
    onStatus?.('Requesting camera…');
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
    this.aspect = this.video.videoWidth / Math.max(1, this.video.videoHeight) || 16 / 9;
    this.pipeline.setAspect(this.aspect);
    onStatus?.('Loading pose model (runs locally)…');
    await this.pose.init();
    onStatus?.('');
    this.fpsT = performance.now();
    const loop = () => {
      if (this.stopped) return;
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
