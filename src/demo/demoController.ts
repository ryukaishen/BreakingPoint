// Drives the synthetic athlete through the demo story and feeds every frame
// into the real SessionEngine via the shared PosePipeline. Time is a fixed
// 30 Hz simulation clock, so results do not depend on browser frame rate or
// playback speed (speed only changes how many frames are processed per tick).

import type { ExerciseType } from '../biomechanics/catalog';
import type { SessionEngine } from '../session/engine';
import { PosePipeline } from '../session/pipeline';
import { demoPlan, DEMO_CALIBRATION_REPS, DEMO_PRESETS, type DemoPlan } from './demoScript';
import { FPS, SyntheticAthlete } from './syntheticAthlete';

export type DemoStage = 'ready' | 'calibration' | 'baselinePause' | 'monitoring' | 'done' | 'recovery' | 'recoveryDone';

export class DemoController {
  stage: DemoStage = 'ready';
  readonly athlete: SyntheticAthlete;
  readonly pipeline: PosePipeline;
  private plan: DemoPlan;
  private stageT = 0;
  private enqueued = false;
  private idleSince: number | null = null;

  constructor(
    private engine: SessionEngine,
    exercise: ExerciseType,
    aspect = 16 / 9,
    seed = DEMO_PRESETS[exercise].seed,
    effect = DEMO_PRESETS[exercise].effect,
  ) {
    this.athlete = new SyntheticAthlete(seed, aspect);
    this.pipeline = new PosePipeline(engine, aspect);
    this.plan = demoPlan(exercise, seed, effect);
    engine.setCalibrationTarget(DEMO_CALIBRATION_REPS);
  }

  get t(): number {
    return this.athlete.t;
  }

  start() {
    this.engine.startCalibration();
    this.go('calibration');
  }

  startRecovery() {
    if (this.stage !== 'done') return;
    this.engine.startRecovery();
    this.go('recovery');
  }

  private go(stage: DemoStage) {
    this.stage = stage;
    this.stageT = this.athlete.t;
    this.enqueued = false;
    this.idleSince = null;
  }

  /** Process `n` simulation frames. */
  advance(n: number) {
    for (let i = 0; i < n; i++) {
      const { t, pose } = this.athlete.next();
      this.pipeline.push(pose, t);
      this.tick();
    }
  }

  advanceSeconds(s: number) {
    this.advance(Math.round(s * FPS));
  }

  private tick() {
    const t = this.athlete.t;
    const snap = this.engine.getSnapshot();
    const idleFor = () => {
      if (this.athlete.busy) {
        this.idleSince = null;
        return 0;
      }
      if (this.idleSince === null) this.idleSince = t;
      return t - this.idleSince;
    };
    switch (this.stage) {
      case 'calibration':
        if (!this.enqueued && t - this.stageT > 1.2) {
          this.athlete.enqueue(...this.plan.calibration);
          this.enqueued = true;
        }
        if (snap.phase === 'baseline') this.go('baselinePause');
        break;
      case 'baselinePause':
        if (t - this.stageT > 2.0) {
          this.engine.startMonitoring();
          this.go('monitoring');
        }
        break;
      case 'monitoring':
        if (!this.enqueued && t - this.stageT > 0.8) {
          this.athlete.enqueue(...this.plan.monitoring);
          this.enqueued = true;
        }
        if (this.enqueued && idleFor() > 0.6) {
          this.engine.endSet();
          this.go('done');
        }
        break;
      case 'recovery':
        if (!this.enqueued && t - this.stageT > 0.8) {
          this.athlete.enqueue(...this.plan.recovery);
          this.enqueued = true;
        }
        if (snap.phase === 'recoveryDone') this.go('recoveryDone');
        break;
      default:
        break;
    }
  }

  /** Headless: run until the monitored set ends (and optionally the recovery check). */
  runToEnd(withRecovery = false, maxSeconds = 400) {
    if (this.stage === 'ready') this.start();
    const limit = this.athlete.t + maxSeconds;
    while (this.stage !== 'done' && this.athlete.t < limit) this.advance(1);
    if (withRecovery) {
      this.startRecovery();
      while (this.stage !== 'recoveryDone' && this.athlete.t < limit) this.advance(1);
    }
  }
}
