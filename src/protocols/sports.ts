// Centralized sport-profile configuration. Sports are a CONTEXT layer: they pick
// which protocol (movement primitive) is monitored, which metrics are featured,
// and what the UI calls things. They contain no detector parameters — the
// Lab-calibrated detector (BreakingPoint Lab, HiPerGator-ready) is shared by every sport and protocol.

import type { PatternId } from './patterns';

export type SportIconId =
  | 'soccer' | 'basketball' | 'volleyball' | 'racquet' | 'strength' | 'martial' | 'running' | 'gymnastics' | 'field';

export interface SportProtocolRef {
  protocolId: string;
  /** Sport-specific screen name, e.g. "Explosive Jump Check". */
  title?: string;
  /** Short card tagline, e.g. "Explosive output". */
  tagline?: string;
  purpose?: string;
  /** Featured metrics (feature keys), in display order. */
  focus?: string[];
  /** Demo athlete-card session label. */
  session?: string;
}

export interface SportContextDef {
  id: string;
  name: string;
  protocols: SportProtocolRef[];
  /** Sport-specific names for drift patterns (display only). */
  patternLabels?: Partial<Record<PatternId, string>>;
  /** Sport-specific terminology for features (display only). */
  featureLabels?: Record<string, string>;
  note?: string;
}

export interface SportProfile extends SportContextDef {
  icon: SportIconId;
  tier: 'primary' | 'secondary';
  /** One-line card descriptor, e.g. "Explosive movement". */
  descriptor: string;
  subSports?: SportContextDef[];
}

const RACQUET_LUNGE: SportProtocolRef = {
  protocolId: 'lunge-forward',
  title: 'Forward Lunge Endurance',
  tagline: 'Lunge + recovery',
  purpose: 'Track how lunge depth, posture and recovery speed change across repeated lunges — the reach-and-recover pattern of racquet play.',
  focus: ['concentricDuration', 'recoveryVelocity', 'trunkLean', 'kneeRomL', 'depth', 'stepLength'],
  session: 'Match simulation',
};
const RACQUET_LABELS = { concentricDuration: 'Recovery time', recoveryVelocity: 'Push-back speed' };

export const SPORTS: SportProfile[] = [
  {
    id: 'soccer',
    name: 'Soccer',
    icon: 'soccer',
    tier: 'primary',
    descriptor: 'Explosive movement',
    protocols: [
      {
        protocolId: 'jump-repeated',
        title: 'Explosive Jump Check',
        tagline: 'Explosive output',
        purpose: 'Track how jump height, push-off and landing change across repeated jumps.',
        focus: ['jumpHeight', 'rsiMod', 'landingKneeFlex', 'trunkLean', 'concentricDuration', 'asymmetry'],
        session: 'Late-training screen',
      },
      { protocolId: 'hop-single-leg', tagline: 'Unilateral consistency' },
      { protocolId: 'cod-lateral', tagline: 'Lateral movement' },
    ],
    featureLabels: {
      jumpHeight: 'Jump height proxy',
      rsiMod: 'Explosive velocity (RSI-mod)',
      landingKneeFlex: 'Landing depth',
      concentricDuration: 'Push-off time',
    },
  },
  {
    id: 'basketball',
    name: 'Basketball',
    icon: 'basketball',
    tier: 'primary',
    descriptor: 'Jump + landing',
    protocols: [
      {
        protocolId: 'jump-repeated',
        title: 'Repeated Jump',
        tagline: 'Repeated explosiveness',
        purpose: 'Track repeated explosiveness, landing consistency, trunk control and asymmetry across a jump series.',
        focus: ['jumpHeight', 'rsiMod', 'landingKneeFlex', 'trunkLean', 'asymmetry', 'flightTime'],
        session: 'Post-practice screen',
      },
      { protocolId: 'landing-single-leg', tagline: 'Landing control' },
      { protocolId: 'shuffle-defensive', tagline: 'Lateral movement' },
    ],
    patternLabels: { explosive: 'JUMP CONSISTENCY CHANGING' },
    featureLabels: { rsiMod: 'Repeated explosiveness (RSI-mod)', landingKneeFlex: 'Landing knee flexion' },
  },
  {
    id: 'volleyball',
    name: 'Volleyball',
    icon: 'volleyball',
    tier: 'primary',
    descriptor: 'Jump consistency',
    protocols: [
      {
        protocolId: 'jump-repeated',
        title: 'Jump Consistency',
        tagline: 'Jump consistency',
        purpose: 'Track jump height, take-off timing and landing depth across a repeated-jump block.',
        focus: ['jumpHeight', 'concentricDuration', 'landingKneeFlex', 'countermovementDepth', 'trunkLean', 'flightTime'],
        session: 'Between-sets screen',
      },
      { protocolId: 'jump-approach', tagline: 'Approach mechanics' },
      { protocolId: 'landing-screen', tagline: 'Landing absorption' },
    ],
    patternLabels: { explosive: 'JUMP CONSISTENCY CHANGING', landing: 'LANDING MECHANICS CHANGING' },
    featureLabels: { jumpHeight: 'Jump height proxy', concentricDuration: 'Take-off time', landingKneeFlex: 'Landing depth' },
  },
  {
    id: 'racquet',
    name: 'Racquet Sports',
    icon: 'racquet',
    tier: 'primary',
    descriptor: 'Lunge + recovery',
    protocols: [],
    subSports: [
      {
        id: 'pickleball',
        name: 'Pickleball',
        protocols: [RACQUET_LUNGE, { protocolId: 'lunge-lateral', tagline: 'Side reach' }, { protocolId: 'split-step', tagline: 'Readiness' }],
        featureLabels: RACQUET_LABELS,
      },
      {
        id: 'tennis',
        name: 'Tennis',
        protocols: [RACQUET_LUNGE, { protocolId: 'lunge-lateral', tagline: 'Side reach' }, { protocolId: 'split-step', tagline: 'Readiness' }],
        featureLabels: RACQUET_LABELS,
      },
      {
        id: 'badminton',
        name: 'Badminton',
        protocols: [{ ...RACQUET_LUNGE, session: 'Footwork block' }, { protocolId: 'lunge-deep', tagline: 'Net reach' }, { protocolId: 'split-step', tagline: 'Readiness' }],
        featureLabels: RACQUET_LABELS,
      },
    ],
  },
  {
    id: 'strength',
    name: 'Strength',
    icon: 'strength',
    tier: 'primary',
    descriptor: 'Squat mechanics',
    protocols: [
      {
        protocolId: 'squat-bodyweight',
        title: 'Bodyweight Squat',
        tagline: 'Squat mechanics',
        purpose: 'The reference protocol: depth, trunk angle, tempo and symmetry across a working set.',
        focus: ['depth', 'kneeRomL', 'trunkLean', 'peakVelocity', 'concentricDuration', 'asymmetry'],
        session: 'Training set',
      },
      {
        protocolId: 'lunge-forward',
        title: 'Lunge',
        tagline: 'Unilateral strength',
        purpose: 'Forward-lunge depth, posture and recovery across a set (shared lunge primitive).',
        focus: ['depth', 'kneeRomL', 'trunkLean', 'recoveryVelocity', 'asymmetry'],
        session: 'Training set',
      },
      { protocolId: 'deadlift', tagline: 'Hip hinge' },
    ],
  },
  {
    id: 'martial',
    name: 'Martial Arts',
    icon: 'martial',
    tier: 'primary',
    descriptor: 'Movement consistency',
    protocols: [],
    subSports: [
      {
        id: 'kendo',
        name: 'Kendo',
        protocols: [{ protocolId: 'fumikomi', tagline: 'Attack step' }, { protocolId: 'forward-attack', tagline: 'Attack consistency' }],
      },
      { id: 'kickboxing', name: 'Kickboxing', protocols: [{ protocolId: 'kick-repeated', tagline: 'Kick consistency' }] },
      {
        id: 'fencing',
        name: 'Fencing',
        protocols: [
          {
            protocolId: 'lunge-forward',
            title: 'Forward Lunge',
            tagline: 'Attack + recovery',
            purpose: 'Lunge distance, posture and recovery-to-guard across repeated attacks (shared lunge primitive).',
            focus: ['stepLength', 'recoveryVelocity', 'concentricDuration', 'trunkLean', 'depth'],
            session: 'Bout simulation',
          },
        ],
        featureLabels: { stepLength: 'Lunge distance', concentricDuration: 'Recovery to guard', recoveryVelocity: 'Recovery speed' },
      },
    ],
  },
  {
    id: 'running',
    name: 'Running',
    icon: 'running',
    tier: 'secondary',
    descriptor: 'Gait consistency',
    protocols: [{ protocolId: 'gait-consistency' }, { protocolId: 'stride-asymmetry' }, { protocolId: 'step-analysis' }],
    note: 'Gait analysis needs longer continuous temporal modelling than discrete reps, so it is not part of the current MVP.',
  },
  {
    id: 'gymnastics',
    name: 'Gymnastics',
    icon: 'gymnastics',
    tier: 'secondary',
    descriptor: 'Jump + landing',
    protocols: [
      {
        protocolId: 'jump-repeated',
        title: 'Repeated Jump',
        tagline: 'Take-off + landing',
        purpose: 'Take-off and landing consistency across a jump series (shared jump-and-land primitive).',
        focus: ['jumpHeight', 'landingKneeFlex', 'trunkLean', 'asymmetry', 'flightTime'],
        session: 'Training screen',
      },
      { protocolId: 'landing-stick', tagline: 'Landing control' },
    ],
  },
  {
    id: 'field',
    name: 'Field Sports',
    icon: 'field',
    tier: 'secondary',
    descriptor: 'Explosive movement',
    protocols: [
      {
        protocolId: 'jump-repeated',
        title: 'Explosive Jump Check',
        tagline: 'Explosive output',
        purpose: 'Repeated-jump screen for football, rugby, lacrosse and field hockey (shared jump-and-land primitive).',
        focus: ['jumpHeight', 'rsiMod', 'landingKneeFlex', 'trunkLean', 'asymmetry'],
        session: 'Late-training screen',
      },
      { protocolId: 'cod-lateral', tagline: 'Cutting' },
    ],
    featureLabels: { rsiMod: 'Explosive velocity (RSI-mod)', jumpHeight: 'Jump height proxy' },
  },
];
