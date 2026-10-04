// SessionEngine: the framework-agnostic heart of BreakingPoint Edge.
// Live camera and Demo mode both push FrameMetrics into the same engine, so the
// demo exercises exactly the same segmentation → features → baseline → drift →
// sequential detection pipeline as a live session.

import { buildBaseline, MIN_CALIBRATION_REPS, type Baseline } from '../baseline/baseline';
import { featureSpecs, type ExerciseType, type RepFeatures } from '../biomechanics/catalog';
import { primaryKneeFlex, qualityLabel, type FrameMetrics, type QualityLabel } from '../biomechanics/frameMetrics';
import { cmjFeatures, squatFeatures } from '../biomechanics/repFeatures';
import type { DetectorConfig } from '../detection/config';
import { driftScore, type DriftResult, type FeatureDeviation } from '../detection/driftScore';
import { SequentialDetector, type DetectorStep, type DriftThresholds, type MovementState } from '../detection/detector';
import { assessRecovery, type RecoveryAssessment } from '../detection/recovery';
import { CmjSegmenter, SquatSegmenter, type RepPhase, type RepWindow } from '../reps/segmenter';
import { buildSummary, type SessionSummary } from './summary';

export type SessionPhase = 'idle' | 'calibrating' | 'baseline' | 'monitoring' | 'summary' | 'recovery' | 'recoveryDone';
export type RepContext = 'calibration' | 'monitoring' | 'recovery';
export type SourceMode = 'live' | 'demo';

export const CALIBRATION_TARGET = 6;
export const CALIBRATION_MAX = 8;
export const RECOVERY_REPS = 3;

export interface RepRecord {
  index: number;
  context: RepContext;
  features: RepFeatures;
  tStart: number;
  tBottom: number;
  tEnd: number;
  quality: number;
  drift: DriftResult | null;
  step: DetectorStep | null;
}

export interface LiveStatus {
  repPhase: RepPhase;
  depth: number;
  kneeFlex: number | null;
  trunkLean: number | null;
  quality: number;
  qualityLabel: QualityLabel;
  present: boolean;
  calibrated: boolean;
}

export interface EngineEvent {
  id: number;
  type: 'rep' | 'breakpoint' | 'baseline' | 'discarded' | 'recovery' | 'info';
  message: string;
}

export interface Snapshot {
  version: number;
  mode: SourceMode;
  phase: SessionPhase;
  exercise: ExerciseType;
  athlete: string;
  config: DetectorConfig;
  calibrationTarget: number;
  calibrationReps: RepRecord[];
  monitorReps: RepRecord[];
  recoveryReps: RepRecord[];
  baseline: Baseline | null;
  thresholds: DriftThresholds | null;
  state: MovementState;
  alarmRep: number | null;
  onsetRep: number | null;
  firstWarnRep: number | null;
  breakpointContributors: FeatureDeviation[] | null;
  recovery: RecoveryAssessment | null;
  summary: SessionSummary | null;
  live: LiveStatus;
  event: EngineEvent | null;
}

const IDLE_LIVE: LiveStatus = {
  repPhase: 'standing', depth: 0, kneeFlex: null, trunkLean: null, quality: 0, qualityLabel: 'No athlete', present: false, calibrated: false,
};

export class SessionEngine {
  private listeners = new Set<() => void>();
  private snap: Snapshot;
  private segmenter: SquatSegmenter | CmjSegmenter;
  private detector: SequentialDetector | null = null;
  private qualityEma = 0;
  private lastLiveEmit = 0;
  private eventId = 0;
  private windowQuality: number[] = [];

  constructor(exercise: ExerciseType, config: DetectorConfig, athlete: string, mode: SourceMode = 'live') {
    this.segmenter = exercise === 'squat' ? new SquatSegmenter() : new CmjSegmenter();
    this.snap = {
      version: 0, mode, phase: 'idle', exercise, athlete, config, calibrationTarget: CALIBRATION_TARGET,
      calibrationReps: [], monitorReps: [], recoveryReps: [], baseline: null, thresholds: null, state: 'STABLE',
      alarmRep: null, onsetRep: null, firstWarnRep: null, breakpointContributors: null, recovery: null, summary: null,
      live: IDLE_LIVE, event: null,
    };
  }

  // ---------------------------------------------------------------- store API
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): Snapshot => this.snap;

  private set(patch: Partial<Snapshot>): void {
    this.snap = { ...this.snap, ...patch, version: this.snap.version + 1 };
    this.listeners.forEach((l) => l());
  }

  private event(type: EngineEvent['type'], message: string): EngineEvent {
    return { id: ++this.eventId, type, message };
  }

  // ---------------------------------------------------------------- controls
  setAthlete(name: string) {
    this.set({ athlete: name, baseline: this.snap.baseline ? { ...this.snap.baseline, athlete: name } : null });
  }

  /** Thresholds may only change before a monitored set starts — never under already-scored reps. */
  setConfig(config: DetectorConfig) {
    const p = this.snap.phase;
    if (p !== 'idle' && p !== 'calibrating' && p !== 'baseline') return;
    this.set({ config });
    if (this.snap.baseline) this.resetDetector();
  }

  setCalibrationTarget(n: number) {
    this.set({ calibrationTarget: Math.max(MIN_CALIBRATION_REPS + 1, Math.min(CALIBRATION_MAX, n)) });
  }

  startCalibration() {
    this.segmenter.reset();
    this.detector = null;
    this.set({
      phase: 'calibrating', calibrationReps: [], monitorReps: [], recoveryReps: [], baseline: null, thresholds: null, state: 'STABLE',
      alarmRep: null, onsetRep: null, firstWarnRep: null, breakpointContributors: null, recovery: null, summary: null,
      event: this.event('info', `Learning ${this.snap.athlete}'s baseline…`),
    });
  }

  canFinishCalibration(): boolean {
    return this.snap.calibrationReps.length >= MIN_CALIBRATION_REPS + 1;
  }

  finishCalibration() {
    const reps = this.snap.calibrationReps;
    if (reps.length < MIN_CALIBRATION_REPS) return;
    const baseline = buildBaseline(reps.map((r) => r.features), this.snap.exercise, this.snap.config, this.snap.athlete);
    this.set({ phase: 'baseline', baseline, event: this.event('baseline', 'Baseline established.') });
    this.resetDetector();
  }

  /** Use a previously saved baseline (skip calibration). */
  useBaseline(baseline: Baseline) {
    this.set({ phase: 'baseline', baseline, calibrationReps: [], event: this.event('baseline', 'Saved baseline loaded.') });
    this.resetDetector();
  }

  private resetDetector() {
    const b = this.snap.baseline;
    if (!b) return;
    this.detector = new SequentialDetector(this.snap.config, b.reference.mu0, b.reference.sigma0);
    this.set({ thresholds: this.detector.thresholds() });
  }

  startMonitoring() {
    if (!this.snap.baseline) return;
    this.segmenter.reset();
    this.resetDetector();
    this.set({
      phase: 'monitoring', monitorReps: [], recoveryReps: [], state: 'STABLE', alarmRep: null, onsetRep: null, firstWarnRep: null,
      breakpointContributors: null, recovery: null, summary: null, event: this.event('info', 'Monitoring started — perform your set.'),
    });
  }

  endSet() {
    if (this.snap.phase !== 'monitoring') return;
    const summary = buildSummary(this.snap.monitorReps, this.snap.exercise, this.snap.athlete, this.snap.alarmRep, this.snap.onsetRep);
    this.set({ phase: 'summary', summary });
  }

  startRecovery() {
    if (!this.snap.baseline) return;
    this.segmenter.reset();
    this.set({ phase: 'recovery', recoveryReps: [], recovery: null, event: this.event('info', `Recovery check — perform ${RECOVERY_REPS} reps.`) });
  }

  resetBaseline() {
    this.detector = null;
    this.segmenter.recalibrate();
    this.set({
      phase: 'idle', calibrationReps: [], monitorReps: [], recoveryReps: [], baseline: null, thresholds: null, state: 'STABLE',
      alarmRep: null, onsetRep: null, firstWarnRep: null, breakpointContributors: null, recovery: null, summary: null,
      event: this.event('info', 'Baseline cleared.'),
    });
  }

  // ---------------------------------------------------------------- frames
  pushFrame(m: FrameMetrics) {
    this.qualityEma = m.present ? 0.85 * this.qualityEma + 0.15 * m.quality : 0.8 * this.qualityEma;
    this.windowQuality.push(m.quality);
    if (this.windowQuality.length > 600) this.windowQuality.shift();
    const win = this.segmenter.push(m);
    if (win) this.onRep(win);
    if (m.t - this.lastLiveEmit > 0.08 || win) {
      this.lastLiveEmit = m.t;
      const seg = this.segmenter.live;
      this.set({
        live: {
          repPhase: seg.phase, depth: seg.depth, kneeFlex: primaryKneeFlex(m), trunkLean: m.trunkLean, quality: this.qualityEma,
          qualityLabel: qualityLabel(this.qualityEma, m.present), present: m.present, calibrated: seg.calibrated,
        },
      });
    }
  }

  private onRep(win: RepWindow) {
    const phase = this.snap.phase;
    if (phase !== 'calibrating' && phase !== 'monitoring' && phase !== 'recovery') return;
    const features = this.snap.exercise === 'squat' ? squatFeatures(win) : cmjFeatures(win);
    const quality = win.frames.reduce((s, f) => s + f.quality, 0) / Math.max(1, win.frames.length);
    const base = { features, tStart: win.tStart, tBottom: win.tBottom, tEnd: win.tEnd, quality };

    if (phase === 'calibrating') {
      const reps = [...this.snap.calibrationReps, { ...base, index: this.snap.calibrationReps.length + 1, context: 'calibration' as const, drift: null, step: null }];
      this.set({ calibrationReps: reps, event: this.event('rep', `Calibration rep ${reps.length} captured`) });
      if (reps.length >= this.snap.calibrationTarget) this.finishCalibration();
      return;
    }

    const b = this.snap.baseline;
    if (!b) return;
    const drift = driftScore(features, b.features, featureSpecs(this.snap.exercise), this.snap.config);

    if (phase === 'recovery') {
      const reps = [...this.snap.recoveryReps, { ...base, index: this.snap.recoveryReps.length + 1, context: 'recovery' as const, drift, step: null }];
      let recovery: RecoveryAssessment | null = null;
      if (reps.length >= RECOVERY_REPS) {
        const post = this.snap.monitorReps
          .filter((r) => this.snap.alarmRep !== null && r.index >= this.snap.alarmRep && r.drift?.score != null)
          .map((r) => r.drift!.score as number);
        const rec = reps.filter((r) => r.drift?.score != null).map((r) => r.drift!.score as number);
        recovery = assessRecovery(rec, post, b.reference.mu0, b.reference.sigma0, this.snap.config.warningThreshold);
      }
      this.set({
        recoveryReps: reps, recovery, phase: recovery ? 'recoveryDone' : 'recovery',
        event: this.event(recovery ? 'recovery' : 'rep', recovery ? 'Recovery check complete' : `Recovery rep ${reps.length}`),
      });
      return;
    }

    // monitoring
    if (!this.detector) this.resetDetector();
    const index = this.snap.monitorReps.length + 1;
    const step = this.detector!.update(index, drift.score);
    const rec: RepRecord = { ...base, index, context: 'monitoring', drift, step };
    const patch: Partial<Snapshot> = {
      monitorReps: [...this.snap.monitorReps, rec],
      state: this.detector!.state,
      firstWarnRep: this.detector!.firstWarnRep,
      event: drift.score === null ? this.event('discarded', `Rep ${index}: capture too poor to score`) : this.event('rep', `Rep ${index}`),
    };
    if (step.alarm) {
      patch.alarmRep = this.detector!.alarmRep;
      patch.onsetRep = this.detector!.onsetRep;
      patch.breakpointContributors = drift.ranked.slice(0, 4);
      patch.event = this.event('breakpoint', `BREAKING POINT detected at rep ${index}`);
    }
    this.set(patch);
  }
}
