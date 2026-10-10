// Plain-language wording for a change in each rep measurement, used to build
// athlete-facing sentences such as "Your knee range of motion decreased and your
// reps became slower." Display only: the score and the detector never read these.
// Measurements that describe the same thing (left and right knee range of motion)
// share a phrase, so a sentence never says it twice.

import type { ExerciseType } from './catalog';

export interface ChangePhrase {
  /** The measurement went up. */
  up: string;
  /** The measurement went down. */
  down: string;
}

const KNEE_ROM: ChangePhrase = { up: 'your knee range of motion increased', down: 'your knee range of motion decreased' };
const HIP_ROM: ChangePhrase = { up: 'your hip range of motion increased', down: 'your hip range of motion decreased' };
const TRUNK: ChangePhrase = { up: 'you leaned forward more', down: 'you stayed more upright' };
const REP_TIME: ChangePhrase = { up: 'your reps became slower', down: 'your reps became faster' };

export const CHANGE_PHRASES: Record<ExerciseType, Record<string, ChangePhrase>> = {
  squat: {
    kneeRomL: KNEE_ROM,
    kneeRomR: KNEE_ROM,
    hipRom: HIP_ROM,
    depth: { up: 'your squats got deeper', down: 'your squats got shallower' },
    trunkLean: TRUNK,
    repDuration: REP_TIME,
    eccentricDuration: { up: 'you lowered more slowly', down: 'you lowered faster' },
    concentricDuration: { up: 'you stood up more slowly', down: 'you stood up faster' },
    peakVelocity: { up: 'your drive out of the bottom got faster', down: 'your drive out of the bottom got slower' },
    asymmetry: { up: 'the difference between your left and right knee grew', down: 'the difference between your left and right knee shrank' },
  },
  cmj: {
    jumpHeight: { up: 'your jump height increased', down: 'your jump height dropped' },
    rsiMod: { up: 'your jumps became more explosive', down: 'your jumps became less explosive' },
    flightTime: { up: 'your time in the air got longer', down: 'your time in the air got shorter' },
    countermovementDepth: { up: 'you dipped deeper before jumping', down: 'your dip before jumping got shallower' },
    eccentricDuration: { up: 'your dip got slower', down: 'your dip got faster' },
    concentricDuration: { up: 'your push-off took longer', down: 'your push-off got quicker' },
    trunkLean: TRUNK,
    landingKneeFlex: { up: 'you landed with more knee bend', down: 'you landed with less knee bend' },
    asymmetry: { up: 'the difference between your left and right landing grew', down: 'the difference between your left and right landing shrank' },
  },
  lunge: {
    kneeRomL: KNEE_ROM,
    kneeRomR: KNEE_ROM,
    hipRom: HIP_ROM,
    depth: { up: 'your lunges got deeper', down: 'your lunges got shallower' },
    stepLength: { up: 'your steps got longer', down: 'your steps got shorter' },
    trunkLean: TRUNK,
    repDuration: REP_TIME,
    eccentricDuration: { up: 'you lowered more slowly', down: 'you lowered faster' },
    concentricDuration: { up: 'you pushed back up more slowly', down: 'you pushed back up faster' },
    recoveryVelocity: { up: 'your push back to standing got faster', down: 'your push back to standing got slower' },
    asymmetry: { up: 'the difference between your left and right knee grew', down: 'the difference between your left and right knee shrank' },
  },
};

/** The phrase for one measurement moving in the direction of `z`, or null for an unknown key. */
export function changePhrase(exercise: ExerciseType, key: string, z: number): string | null {
  const p = CHANGE_PHRASES[exercise][key];
  if (!p || !Number.isFinite(z) || z === 0) return null;
  return z > 0 ? p.up : p.down;
}
