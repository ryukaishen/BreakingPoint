import { RECOVERY_REPS, type Snapshot } from '../../session/engine';

export type StageId = 'calibrate' | 'monitor' | 'detect' | 'recover';

/** `warning` marks Detect while the form is changing; `alert` marks it once the alert has fired. */
export type StageStatus = 'pending' | 'current' | 'done' | 'warning' | 'alert';

export interface TrackStage {
  id: StageId;
  label: string;
  status: StageStatus;
  /** Real progress for the active stage ("4/6", "7", "rep 10"). Null when there is nothing to count. */
  count: string | null;
}

/**
 * Calibrate → Monitor → Detect → Recover, read from the engine snapshot and nothing else.
 * It is a projection only: no stage here can start, advance or skip a phase.
 */
export function stageTrack(s: Snapshot): TrackStage[] {
  const p = s.phase;
  const recovering = p === 'recovery' || p === 'recoveryDone';
  const alerted = s.alarmRep !== null;
  const alertShowing = alerted && (p === 'monitoring' || p === 'summary');
  const formChanging = p === 'monitoring' && !alerted && s.state === 'DRIFT';
  return [
    {
      id: 'calibrate',
      label: 'Calibrate',
      status: p === 'idle' || p === 'calibrating' ? 'current' : s.baseline ? 'done' : 'pending',
      count: p === 'calibrating' ? `${s.calibrationReps.length}/${s.calibrationTarget}` : null,
    },
    {
      id: 'monitor',
      label: 'Monitor',
      status:
        p === 'baseline' || (p === 'monitoring' && !alerted)
          ? 'current'
          : s.monitorReps.length > 0 && (alerted || p === 'summary' || recovering)
            ? 'done'
            : 'pending',
      count: p === 'monitoring' && !alerted ? String(s.monitorReps.length) : null,
    },
    {
      id: 'detect',
      label: 'Detect',
      status: alertShowing ? 'alert' : alerted && recovering ? 'done' : formChanging ? 'warning' : 'pending',
      count: alertShowing ? `rep ${s.alarmRep}` : null,
    },
    {
      id: 'recover',
      label: 'Recover',
      status: p === 'recovery' ? 'current' : p === 'recoveryDone' ? 'done' : 'pending',
      count: p === 'recovery' ? `${s.recoveryReps.length}/${RECOVERY_REPS}` : null,
    },
  ];
}

/** The stage the athlete is in now, for aria-current: the alert outranks the set it interrupted. */
export function currentStage(stages: readonly TrackStage[]): StageId | null {
  return (stages.find((st) => st.status === 'alert') ?? stages.find((st) => st.status === 'current'))?.id ?? null;
}
