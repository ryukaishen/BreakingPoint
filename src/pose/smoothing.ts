// Landmark smoothing with the One Euro filter (Casiez et al., CHI 2012):
// an adaptive low-pass filter that removes jitter when a joint is still and
// keeps lag low when it moves fast — the standard choice for pose tracking.

import type { Pose } from './landmarks';

class LowPass {
  private y: number | null = null;
  filter(x: number, alpha: number): number {
    this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y;
    return this.y;
  }
  last(): number | null {
    return this.y;
  }
  reset() {
    this.y = null;
  }
}

const alphaFor = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuroFilter {
  private x = new LowPass();
  private dx = new LowPass();
  private tPrev: number | null = null;

  constructor(
    private minCutoff = 1.2,
    private beta = 0.05,
    private dCutoff = 1.0,
  ) {}

  filter(value: number, t: number): number {
    if (this.tPrev === null) {
      this.tPrev = t;
      this.dx.filter(0, 1);
      return this.x.filter(value, 1);
    }
    const dt = Math.max(1e-3, t - this.tPrev);
    this.tPrev = t;
    const prev = this.x.last() ?? value;
    const dValue = (value - prev) / dt;
    const edx = this.dx.filter(dValue, alphaFor(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, alphaFor(cutoff, dt));
  }

  reset() {
    this.x.reset();
    this.dx.reset();
    this.tPrev = null;
  }
}

/** Smooths all landmarks of a pose stream; visibility gets a simple EMA. */
export class PoseSmoother {
  private fx: OneEuroFilter[] = [];
  private fy: OneEuroFilter[] = [];
  private vis: number[] = [];
  private lastT: number | null = null;

  constructor(
    private minCutoff = 1.2,
    private beta = 0.05,
  ) {}

  smooth(pose: Pose, t: number): Pose {
    // Reset after a tracking gap so stale state does not drag the new pose.
    if (this.lastT !== null && t - this.lastT > 0.5) this.reset();
    this.lastT = t;
    return pose.map((p, i) => {
      if (!this.fx[i]) {
        this.fx[i] = new OneEuroFilter(this.minCutoff, this.beta);
        this.fy[i] = new OneEuroFilter(this.minCutoff, this.beta);
        this.vis[i] = p.visibility;
      }
      this.vis[i] = 0.7 * this.vis[i] + 0.3 * p.visibility;
      return { x: this.fx[i].filter(p.x, t), y: this.fy[i].filter(p.y, t), z: p.z, visibility: this.vis[i] };
    });
  }

  reset() {
    this.fx = [];
    this.fy = [];
    this.vis = [];
    this.lastT = null;
  }
}
