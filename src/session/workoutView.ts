// The live workout screen (Figma Make's M4 "WorkoutExperience") reads everything it shows from
// here. It is a projection of the real session: the engine snapshot, the camera's state and the
// calibration quality. Nothing here starts, advances or times anything; the engine, the camera
// runner and hands-free (useHandsFree) own every transition.

import { MIN_CALIBRATION_REPS } from '../baseline/baseline';
import { heldReps } from '../data/progress';
import type { CalibrationQuality } from '../data/types';
import type { DriftThresholds } from '../detection/detector';
import type { FeatureDeviation } from '../detection/driftScore';
import { RECOVERY_REPS, type RepRecord, type Snapshot } from './engine';
import type { CameraProblem } from './runners';

export type WorkoutState =
  | 'prepare'
  | 'permission-pending'
  | 'starting'
  | 'permission-denied'
  | 'camera-unavailable'
  | 'pose-ready'
  | 'calibrating'
  | 'calibration-issue'
  | 'baseline'
  | 'stable'
  | 'warning'
  | 'sustained'
  | 'stop'
  | 'tracking-lost'
  | 'camera-failure'
  | 'complete'
  | 'rest'
  | 'recovery'
  | 'recovery-done';

/** The live camera as the app knows it. `stopped`: the camera ended during the session. */
export interface CameraState {
  /** Progress while the camera starts ("Requesting camera…", "Loading pose model…"); empty once running. */
  status: string;
  /** 'stopped': the camera ended on its own. 'tracking': pose tracking failed while running and the camera was turned off. */
  error: { problem: CameraProblem | 'stopped' | 'tracking'; text: string } | null;
}

export const CAMERA_OK: CameraState = { status: '', error: null };
/** The runner's progress text while it waits for the browser's permission prompt. */
export const REQUESTING_CAMERA = 'Requesting camera…';

export interface WorkoutInputs {
  mode: 'demo' | 'live';
  camera: CameraState;
  /** The athlete has been out of view for a moment (debounced by the screen, live sessions only). */
  trackingLost: boolean;
  /** Quality of the baseline just calibrated in this session; null when there is none to judge. */
  calibration: CalibrationQuality | null;
  handsFree: boolean;
  /**
   * The athlete has stayed in view for a moment (debounced by the screen, live sessions only). The pose
   * model can return a stray low-confidence pose from an empty room for a frame or two; until presence
   * holds, the screen still reads No athlete. Omitted, the frame's own presence is used.
   */
  athleteInView?: boolean;
}

const MONITORING: readonly WorkoutState[] = ['stable', 'warning', 'sustained', 'stop'];
/** Consecutive reps above the warning level before "form changing" reads as a continuing change. */
export const CONTINUING_REPS = 2;

/** True when the athlete is framed for calibration: the same test the set-up checklist and hands-free use. */
export function poseReady(s: Snapshot): boolean {
  return s.live.present && s.live.quality >= 0.65 && s.live.calibrated;
}

/** The detector's last scored step in the monitored set (unscored reps leave its state unchanged). */
export function lastScored(s: Snapshot): RepRecord | null {
  for (let i = s.monitorReps.length - 1; i >= 0; i--) if (s.monitorReps[i].step?.scored) return s.monitorReps[i];
  return null;
}

/** Consecutive reps above the warning level, from the detector's persistence counter. */
export function continuingReps(s: Snapshot): number {
  return lastScored(s)?.step?.runLength ?? 0;
}

export function workoutState(s: Snapshot, o: WorkoutInputs): WorkoutState {
  const live = o.mode === 'live';
  if (live && o.camera.error) {
    if (o.camera.error.problem === 'stopped' || o.camera.error.problem === 'tracking') return 'camera-failure';
    return o.camera.error.problem === 'denied' ? 'permission-denied' : 'camera-unavailable';
  }
  if (live && o.camera.status) return o.camera.status === REQUESTING_CAMERA ? 'permission-pending' : 'starting';
  switch (s.phase) {
    case 'idle':
      return live && poseReady(s) && o.athleteInView !== false ? 'pose-ready' : 'prepare';
    case 'calibrating':
      return live && o.trackingLost ? 'tracking-lost' : 'calibrating';
    case 'baseline':
      return o.calibration && !o.calibration.ok ? 'calibration-issue' : 'baseline';
    case 'monitoring':
      if (s.alarmRep !== null) return 'stop';
      if (live && o.trackingLost) return 'tracking-lost';
      if (s.state === 'DRIFT') return continuingReps(s) >= CONTINUING_REPS ? 'sustained' : 'warning';
      return 'stable';
    case 'summary':
      return s.alarmRep !== null ? 'rest' : 'complete';
    case 'recovery':
      return 'recovery';
    case 'recoveryDone':
      return 'recovery-done';
  }
}

/**
 * Where a Form Change Score sits on the workout track (0 to 100): the warning level at 33% and the
 * alert level at 75%, as in Make. The levels are this athlete's own, from the baseline.
 */
export function scorePosition(score: number, t: Pick<DriftThresholds, 'warningLevel' | 'breakpointLevel'>): number {
  const warn = t.warningLevel;
  const bp = Math.max(t.breakpointLevel, warn + 1e-9);
  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  const pos = score <= warn ? 33 * clamp01(score / warn) : score <= bp ? 33 + 42 * ((score - warn) / (bp - warn)) : 75 + 25 * clamp01((score - bp) / (bp - warn));
  return Math.min(98, Math.max(2, pos));
}

/** The measurements that changed most: the alert's contributors, else the last scored rep's ranking. */
export function changedMost(s: Snapshot, n = 3): FeatureDeviation[] {
  const ranked = s.alarmRep !== null && s.breakpointContributors ? s.breakpointContributors : (lastScored(s)?.drift?.ranked ?? []);
  return ranked.filter((d) => d.used && d.zClipped !== null).slice(0, n);
}

export interface WorkoutView {
  state: WorkoutState;
  /** The system code line over the instruction. */
  code: string;
  plate: string;
  instruction: string;
  quality: { label: string; detail: string };
  /** The big count on the camera, with what it counts; null when nothing is counted yet. */
  rep: { value: number; label: string } | null;
  /** The latest Form Change Score in the monitored set and where it sits on the track. */
  score: { value: number | null; position: number | null } | null;
  calibration: { done: number; target: number; required: number } | null;
  /** Why a fresh calibration may not be reliable (calibration-issue only). */
  issues: string[];
  /** True while the camera owns the screen: starting, refused, missing or stopped. */
  cameraMessage: boolean;
  /** The athlete is in view (and has stayed in view, live): what the set-up checklist ticks. */
  athleteInView: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function workoutView(s: Snapshot, o: WorkoutInputs): WorkoutView {
  const state = workoutState(s, o);
  const live = o.mode === 'live';
  const athleteInView = s.live.present && (o.athleteInView ?? true);
  const inFrame = athleteInView && s.live.quality >= 0.65;
  const n = s.monitorReps.length;

  const copy = ((): { plate: string; instruction: string } => {
    switch (state) {
      case 'prepare':
        return live
          ? {
              plate: 'Camera setup',
              instruction: !athleteInView
                ? 'Step into the frame, side-on to the camera.'
                : !inFrame
                  ? 'Move back until your whole body is visible, head to feet.'
                  : 'Hold still for a moment.',
            }
          : { plate: 'Demo starting', instruction: 'Starting the demo with a synthetic athlete.' };
      case 'permission-pending':
        return { plate: 'Camera permission', instruction: 'Allow camera access. Pose tracking runs entirely in this browser.' };
      case 'starting':
        return { plate: 'Starting tracking', instruction: 'Loading the pose model. It runs in this browser and the video stays on this device.' };
      case 'permission-denied':
        return { plate: 'Permission denied', instruction: o.camera.error?.text ?? '' };
      case 'camera-unavailable':
        return { plate: 'Camera unavailable', instruction: o.camera.error?.text ?? '' };
      case 'camera-failure':
        return o.camera.error?.problem === 'tracking'
          ? {
              plate: 'Tracking stopped',
              instruction:
                s.phase === 'monitoring'
                  ? 'Pose tracking hit an error, so the camera was turned off. End the set to keep the reps so far, or try again.'
                  : 'Pose tracking hit an error, so the camera was turned off. Try again.',
            }
          : {
              plate: 'Camera stopped',
              instruction: s.phase === 'monitoring' ? 'The camera stopped during the set. End the set to keep the reps so far, or try the camera again.' : 'The camera stopped during this session. Try the camera again.',
            };
      case 'pose-ready':
        return { plate: 'Ready', instruction: o.handsFree ? 'Stand still. Calibration starts automatically.' : 'Ready when you are.' };
      case 'calibrating':
        return { plate: 'Calibrate', instruction: 'Controlled reps at your normal tempo. Each one teaches BreakingPoint how you move when fresh.' };
      case 'calibration-issue':
        return {
          plate: 'Check calibration',
          instruction: 'Sets from this calibration will not count toward your records. Calibrate again for a reliable baseline, or start the set.',
        };
      case 'baseline':
        return { plate: 'Baseline locked', instruction: live ? 'Get ready. Do your set at your normal tempo.' : 'The monitored set starts next.' };
      case 'stable':
        return { plate: 'Stable', instruction: n ? 'Your reps match your usual form.' : 'Start your set.' };
      case 'warning':
        return { plate: 'Form changing', instruction: 'Your form is starting to change. Be ready to stop.' };
      case 'sustained':
        return { plate: 'Change continuing', instruction: `The change has lasted ${plural(continuingReps(s), 'rep')}. Be ready to stop.` };
      case 'stop':
        return { plate: 'Stop', instruction: `The alert triggered at rep ${s.alarmRep}. End the set and rest.` };
      case 'tracking-lost':
        return { plate: 'Tracking lost', instruction: 'Step back into the frame with your whole body visible. Reps without a clear view are not scored.' };
      case 'complete':
        return { plate: 'Set complete', instruction: `No alert. You held your usual form for ${plural(heldReps(s.monitorReps), 'rep')}.` };
      case 'rest':
        return { plate: 'Rest', instruction: 'Set saved. Rest until you feel ready, then check your recovery against your usual form.' };
      case 'recovery':
        return { plate: 'Recovery check', instruction: `${RECOVERY_REPS} controlled reps, compared with your usual form.` };
      case 'recovery-done': {
        const status = s.recovery?.status ?? 'persistent';
        return status === 'recovered'
          ? { plate: 'Back to your usual form', instruction: 'Your form is back within your normal range.' }
          : status === 'partial'
            ? { plate: 'Partly back', instruction: 'Consider more rest or a lighter session before you test again.' }
            : { plate: 'Still different', instruction: 'Your form is still different from your usual form. Consider keeping the rest of today light.' };
      }
    }
  })();

  const cameraMessage = state === 'permission-pending' || state === 'starting' || state === 'permission-denied' || state === 'camera-unavailable' || state === 'camera-failure';
  const code =
    state === 'stop'
      ? `Stop / alert at rep ${s.alarmRep}`
      : state === 'tracking-lost' || state === 'camera-failure'
        ? 'Session interrupted'
        : state === 'calibration-issue'
          ? 'Calibration quality'
          : 'Current instruction';

  const quality = cameraMessage
    ? { label: o.camera.error ? 'Camera off' : 'Waiting', detail: o.camera.error ? 'No video' : 'Camera starting' }
    : {
        label: athleteInView ? s.live.qualityLabel : 'No athlete',
        detail: state === 'tracking-lost' ? 'Landmarks lost' : athleteInView ? 'Full body / landmark tracking' : 'No athlete in frame',
      };

  const p = s.phase;
  const rep =
    cameraMessage
      ? null
      : p === 'calibrating'
        ? { value: s.calibrationReps.length, label: `of ${s.calibrationTarget} fresh reps` }
        : p === 'baseline' && s.calibrationReps.length
          ? { value: s.calibrationReps.length, label: 'fresh reps' }
          : p === 'monitoring'
            ? { value: n, label: n === 1 ? 'monitored rep' : 'monitored reps' }
            : p === 'recovery' || p === 'recoveryDone'
              ? { value: s.recoveryReps.length, label: `of ${RECOVERY_REPS} recovery reps` }
              : p === 'summary'
                ? { value: n, label: n === 1 ? 'rep in the set' : 'reps in the set' }
                : null;

  const last = lastScored(s);
  const lastScore = last?.drift?.score ?? null;
  const score =
    p === 'monitoring' && !cameraMessage
      ? { value: lastScore, position: lastScore !== null && s.thresholds ? scorePosition(lastScore, s.thresholds) : null }
      : null;

  return {
    state,
    code,
    ...copy,
    quality,
    rep,
    score,
    calibration: p === 'calibrating' || state === 'calibration-issue' ? { done: s.calibrationReps.length, target: s.calibrationTarget, required: MIN_CALIBRATION_REPS + 1 } : null,
    issues: state === 'calibration-issue' ? (o.calibration?.reasons ?? []) : [],
    cameraMessage,
    athleteInView,
  };
}

/** States in which the monitored set is running and End set applies. */
export const isMonitoringState = (st: WorkoutState) => MONITORING.includes(st);
