// Movement primitives: the small set of reusable biomechanical building blocks.
// Many sports map onto the same primitive, so "15 sports" never means 15 models —
// a sport only chooses which repeatable movement is monitored and how it is described.
// Only primitives with an `engine` can be analysed; the statistical detector is shared.

import type { ExerciseType } from '../biomechanics/catalog';
import type { RepPhase } from '../reps/segmenter';

export type PrimitiveId =
  | 'SQUAT'
  | 'JUMP_AND_LAND'
  | 'FORWARD_LUNGE'
  | 'LATERAL_MOVEMENT'
  | 'SINGLE_LEG_HOP'
  | 'GAIT_CYCLE'
  | 'HIP_HINGE'
  | 'STRIKE_STEP'
  | 'KICK';

export type PrimitiveStatus = 'implemented' | 'beta' | 'roadmap';

export interface PrimitiveDef {
  id: PrimitiveId;
  name: string;
  status: PrimitiveStatus;
  /** Engine-level movement implementation (segmenter + feature extractor). Absent = not analysable yet. */
  engine?: ExerciseType;
  /** Segmentation phases, in order. */
  phases: string[];
  /** Live phase labels shown on the camera stage. */
  phaseLabels: Partial<Record<RepPhase, string>>;
  description: string;
}

export const PRIMITIVES: Record<PrimitiveId, PrimitiveDef> = {
  SQUAT: {
    id: 'SQUAT',
    name: 'Squat',
    status: 'implemented',
    engine: 'squat',
    phases: ['standing', 'descent', 'bottom', 'ascent', 'standing'],
    phaseLabels: { standing: 'Standing', descending: 'Descending', bottom: 'Bottom', ascending: 'Ascending' },
    description: 'Bilateral lowering and rising; segmented from hip drop normalized by leg length.',
  },
  JUMP_AND_LAND: {
    id: 'JUMP_AND_LAND',
    name: 'Jump & land',
    status: 'implemented',
    engine: 'cmj',
    phases: ['standing', 'countermovement', 'propulsion', 'flight', 'landing', 'standing'],
    phaseLabels: { standing: 'Standing', dip: 'Countermovement', propulsion: 'Propulsion', flight: 'Flight', landing: 'Landing' },
    description: 'Countermovement, take-off, flight and landing; take-off/touch-down from ankle lift.',
  },
  FORWARD_LUNGE: {
    id: 'FORWARD_LUNGE',
    name: 'Forward lunge',
    status: 'beta',
    engine: 'lunge',
    phases: ['ready', 'descent', 'bottom', 'recovery', 'ready'],
    phaseLabels: { standing: 'Ready', descending: 'Descent', bottom: 'Bottom', ascending: 'Recovery' },
    description: 'Step forward, lower, and push back to ready; same hip-drop state machine plus step tracking.',
  },
  LATERAL_MOVEMENT: {
    id: 'LATERAL_MOVEMENT',
    name: 'Lateral movement',
    status: 'roadmap',
    phases: ['ready', 'push-off', 'travel', 'plant', 'ready'],
    phaseLabels: {},
    description: 'Shuffles, lateral lunges and change-of-direction; needs a frontal camera view.',
  },
  SINGLE_LEG_HOP: {
    id: 'SINGLE_LEG_HOP',
    name: 'Single-leg hop',
    status: 'roadmap',
    phases: ['stance', 'take-off', 'flight', 'landing', 'stabilize'],
    phaseLabels: {},
    description: 'Unilateral jump-and-land with side-specific baselines.',
  },
  GAIT_CYCLE: {
    id: 'GAIT_CYCLE',
    name: 'Gait cycle',
    status: 'roadmap',
    phases: ['stance', 'swing'],
    phaseLabels: {},
    description: 'Continuous stride analysis; needs longer temporal modelling than discrete reps.',
  },
  HIP_HINGE: {
    id: 'HIP_HINGE',
    name: 'Hip hinge',
    status: 'roadmap',
    phases: ['standing', 'hinge', 'bottom', 'lockout'],
    phaseLabels: {},
    description: 'Deadlift-style hinge; needs back-angle based segmentation.',
  },
  STRIKE_STEP: {
    id: 'STRIKE_STEP',
    name: 'Strike step',
    status: 'roadmap',
    phases: ['guard', 'drive', 'impact', 'recover'],
    phaseLabels: {},
    description: 'Explosive forward attack steps (e.g. kendo fumikomi).',
  },
  KICK: {
    id: 'KICK',
    name: 'Kick',
    status: 'roadmap',
    phases: ['guard', 'chamber', 'extension', 'retract', 'guard'],
    phaseLabels: {},
    description: 'Repeated kicks; requires fast single-limb tracking.',
  },
};

export const isAnalysable = (p: PrimitiveDef): boolean => !!p.engine && p.status !== 'roadmap';

export function primitiveForEngine(engine: ExerciseType): PrimitiveDef {
  const found = Object.values(PRIMITIVES).find((p) => p.engine === engine);
  if (!found) throw new Error(`No primitive implements engine '${engine}'`);
  return found;
}
