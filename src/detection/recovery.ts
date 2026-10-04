// Recovery check: after a rest, a few new reps are scored against the ORIGINAL
// baseline. Recovery % = how much of the post-BreakingPoint excess drift has
// disappeared:  1 - excess(recovery) / excess(post-BreakingPoint),
// where excess(x) = max(0, mean(x) - mu0).

import { clamp, mean } from '../utils/stats';

export type RecoveryStatus = 'recovered' | 'partial' | 'persistent';

export interface RecoveryAssessment {
  percent: number;
  status: RecoveryStatus;
  meanRecovery: number;
  meanPost: number;
}

export function assessRecovery(
  recoveryScores: readonly number[],
  postScores: readonly number[],
  mu0: number,
  sigma0: number,
  warningThreshold: number,
): RecoveryAssessment | null {
  if (recoveryScores.length === 0) return null;
  const meanRecovery = mean(recoveryScores);
  const meanPost = postScores.length ? mean(postScores) : meanRecovery;
  const excessPost = Math.max(0, meanPost - mu0);
  const excessRec = Math.max(0, meanRecovery - mu0);
  const percent = excessPost > 1e-9 ? clamp(1 - excessRec / excessPost, 0, 1) : excessRec < sigma0 ? 1 : 0;
  const withinWarning = meanRecovery <= mu0 + warningThreshold * sigma0;
  const status: RecoveryStatus = withinWarning && percent >= 0.75 ? 'recovered' : percent >= 0.4 ? 'partial' : 'persistent';
  return { percent, status, meanRecovery, meanPost };
}
