import { computeFrameMetrics, type FrameMetrics } from '../biomechanics/frameMetrics';
import type { Pose } from '../pose/landmarks';
import { PoseSmoother } from '../pose/smoothing';
import type { SessionEngine } from './engine';

/** Shared frame path for live camera and demo: smooth → kinematics → engine. */
export class PosePipeline {
  private smoother = new PoseSmoother();
  lastPose: Pose | null = null;
  lastMetrics: FrameMetrics | null = null;

  constructor(
    private engine: SessionEngine,
    private aspect: number,
  ) {}

  setAspect(aspect: number) {
    this.aspect = aspect;
  }

  push(pose: Pose | null, t: number): FrameMetrics {
    const smoothed = pose ? this.smoother.smooth(pose, t) : null;
    if (!pose) this.smoother.reset();
    const m = computeFrameMetrics(smoothed, t, this.aspect);
    this.lastPose = smoothed;
    this.lastMetrics = m;
    this.engine.pushFrame(m);
    return m;
  }
}
