// Movement protocols: a repeatable movement screen built on one primitive.
// Protocols are sport-agnostic; sports reference them and add context/terminology.

import { featureSpecs } from '../biomechanics/catalog';
import { isAnalysable, PRIMITIVES, type PrimitiveId } from './primitives';

/**
 * READY       implemented and covered by the end-to-end demo + tests
 * BETA        implemented on a shared primitive, less validated (real-camera reliability not yet established)
 * COMING_SOON on the near-term roadmap — cannot be launched
 * FUTURE      research roadmap — cannot be launched
 */
export type ProtocolStatus = 'READY' | 'BETA' | 'COMING_SOON' | 'FUTURE';

export interface ProtocolDef {
  id: string;
  name: string;
  primitive: PrimitiveId;
  status: ProtocolStatus;
  /** Camera placement guidance shown on cards and in live setup. */
  camera: string;
  purpose: string;
  /** Feature keys measured (analysable protocols) — must exist in the feature catalog. */
  metrics: string[];
  /** Human-readable metrics for roadmap protocols (nothing is measured yet). */
  plannedMetrics?: string[];
}

const keys = (exercise: 'squat' | 'cmj' | 'lunge') => featureSpecs(exercise).map((f) => f.key);

export const PROTOCOLS: Record<string, ProtocolDef> = {
  'squat-bodyweight': {
    id: 'squat-bodyweight',
    name: 'Bodyweight Squat',
    primitive: 'SQUAT',
    status: 'READY',
    camera: 'Side-on, 30–45° to the camera, whole body in frame',
    purpose: 'Track how squat mechanics change across a set.',
    metrics: keys('squat'),
  },
  'jump-repeated': {
    id: 'jump-repeated',
    name: 'Repeated Countermovement Jump',
    primitive: 'JUMP_AND_LAND',
    status: 'READY',
    camera: 'Side-on, 30–45°, whole body plus room above the head',
    purpose: 'Track how your jumps and landings change across repeated jumps.',
    metrics: keys('cmj'),
  },
  'lunge-forward': {
    id: 'lunge-forward',
    name: 'Forward Lunge',
    primitive: 'FORWARD_LUNGE',
    status: 'BETA',
    camera: 'Side-on (~90°), both feet visible; lead with the same leg every rep',
    purpose: 'Track how lunge depth, posture and recovery change across repeated lunges.',
    metrics: keys('lunge'),
  },
  // ---------------------------------------------------------------- roadmap
  'hop-single-leg': {
    id: 'hop-single-leg', name: 'Single-Leg Hop', primitive: 'SINGLE_LEG_HOP', status: 'COMING_SOON',
    camera: 'Side-on, whole body, separate baseline per leg', purpose: 'Unilateral take-off and landing consistency.',
    metrics: [], plannedMetrics: ['Hop height proxy', 'Landing knee flexion', 'Trunk control', 'Side-to-side difference'],
  },
  'cod-lateral': {
    id: 'cod-lateral', name: 'Lateral Change-of-Direction', primitive: 'LATERAL_MOVEMENT', status: 'COMING_SOON',
    camera: 'Front-on, whole body', purpose: 'Plant-and-cut mechanics across repeated direction changes.',
    metrics: [], plannedMetrics: ['Plant depth', 'Trunk lateral lean', 'Knee alignment (frontal)', 'Push-off time'],
  },
  'landing-single-leg': {
    id: 'landing-single-leg', name: 'Single-Leg Landing', primitive: 'SINGLE_LEG_HOP', status: 'COMING_SOON',
    camera: 'Side-on or front-on, whole body', purpose: 'Landing absorption and stabilization on one leg.',
    metrics: [], plannedMetrics: ['Landing knee flexion', 'Time to stabilize', 'Trunk sway'],
  },
  'shuffle-defensive': {
    id: 'shuffle-defensive', name: 'Defensive Shuffle', primitive: 'LATERAL_MOVEMENT', status: 'COMING_SOON',
    camera: 'Front-on, whole body', purpose: 'Stance height and shuffle rhythm across repeated shuffles.',
    metrics: [], plannedMetrics: ['Stance height', 'Step width', 'Shuffle cadence'],
  },
  'jump-approach': {
    id: 'jump-approach', name: 'Approach Jump', primitive: 'JUMP_AND_LAND', status: 'COMING_SOON',
    camera: 'Side-on, wide frame for the run-up', purpose: 'Approach, take-off and landing consistency (needs run-up segmentation).',
    metrics: [], plannedMetrics: ['Penultimate step', 'Take-off angle', 'Jump height proxy', 'Landing depth'],
  },
  'landing-screen': {
    id: 'landing-screen', name: 'Landing Screen', primitive: 'JUMP_AND_LAND', status: 'COMING_SOON',
    camera: 'Front-on or side-on, whole body', purpose: 'Repeated drop-landing absorption pattern.',
    metrics: [], plannedMetrics: ['Landing knee flexion', 'Landing hip flexion', 'Absorption time'],
  },
  'lunge-lateral': {
    id: 'lunge-lateral', name: 'Lateral Lunge', primitive: 'LATERAL_MOVEMENT', status: 'COMING_SOON',
    camera: 'Front-on, whole body', purpose: 'Side-to-side lunge depth and recovery.',
    metrics: [], plannedMetrics: ['Lateral depth', 'Trunk lean', 'Recovery time'],
  },
  'lunge-deep': {
    id: 'lunge-deep', name: 'Deep Lunge', primitive: 'FORWARD_LUNGE', status: 'COMING_SOON',
    camera: 'Side-on, both feet visible', purpose: 'Long-reach lunge typical of badminton net play.',
    metrics: [], plannedMetrics: ['Reach length', 'Lunge depth', 'Recovery time'],
  },
  'split-step': {
    id: 'split-step', name: 'Split-Step Recovery', primitive: 'JUMP_AND_LAND', status: 'COMING_SOON',
    camera: 'Front-on, whole body', purpose: 'Small-hop readiness and recovery rhythm.',
    metrics: [], plannedMetrics: ['Hop timing', 'Landing width', 'Recovery time'],
  },
  deadlift: {
    id: 'deadlift', name: 'Deadlift', primitive: 'HIP_HINGE', status: 'COMING_SOON',
    camera: 'Side-on, whole body and bar path', purpose: 'Hip-hinge pattern and back angle across a set (needs a hinge segmenter).',
    metrics: [], plannedMetrics: ['Back angle', 'Hip hinge ROM', 'Bar-path proxy', 'Tempo'],
  },
  fumikomi: {
    id: 'fumikomi', name: 'Fumikomi', primitive: 'STRIKE_STEP', status: 'COMING_SOON',
    camera: 'Side-on, whole body', purpose: 'Explosive stamping step of kendo attacks.',
    metrics: [], plannedMetrics: ['Step length', 'Drive time', 'Trunk uprightness'],
  },
  'forward-attack': {
    id: 'forward-attack', name: 'Forward Attack', primitive: 'STRIKE_STEP', status: 'COMING_SOON',
    camera: 'Side-on, whole body', purpose: 'Repeated forward attacks from kamae.',
    metrics: [], plannedMetrics: ['Launch time', 'Step length', 'Recovery to guard'],
  },
  'kick-repeated': {
    id: 'kick-repeated', name: 'Repeated Kick', primitive: 'KICK', status: 'COMING_SOON',
    camera: 'Side-on, whole body', purpose: 'Chamber, extension and retraction consistency.',
    metrics: [], plannedMetrics: ['Kick height', 'Chamber time', 'Retraction speed', 'Support-leg stability'],
  },
  'gait-consistency': {
    id: 'gait-consistency', name: 'Gait Consistency', primitive: 'GAIT_CYCLE', status: 'FUTURE',
    camera: 'Side-on, treadmill or track', purpose: 'Stride-to-stride consistency over a run.',
    metrics: [], plannedMetrics: ['Stride time', 'Knee flexion at contact', 'Trunk lean'],
  },
  'stride-asymmetry': {
    id: 'stride-asymmetry', name: 'Stride Asymmetry', primitive: 'GAIT_CYCLE', status: 'FUTURE',
    camera: 'Side-on or rear view', purpose: 'Track how left/right stride differences change during a run.',
    metrics: [], plannedMetrics: ['Step time asymmetry', 'Contact time asymmetry'],
  },
  'step-analysis': {
    id: 'step-analysis', name: 'Repeated Step Analysis', primitive: 'GAIT_CYCLE', status: 'FUTURE',
    camera: 'Side-on', purpose: 'Repeated acceleration steps.',
    metrics: [], plannedMetrics: ['Step length', 'Shin angle', 'Push-off time'],
  },
  'landing-stick': {
    id: 'landing-stick', name: 'Stick Landing', primitive: 'JUMP_AND_LAND', status: 'COMING_SOON',
    camera: 'Side-on, whole body', purpose: 'Landing control and time to stabilize.',
    metrics: [], plannedMetrics: ['Landing depth', 'Time to stabilize', 'Trunk control'],
  },
};

/** A protocol can start live/demo analysis only if it is READY/BETA *and* its primitive has an engine. */
export function canLaunch(p: ProtocolDef): boolean {
  return (p.status === 'READY' || p.status === 'BETA') && isAnalysable(PRIMITIVES[p.primitive]);
}

export const STATUS_LABEL: Record<ProtocolStatus, string> = {
  READY: 'Ready',
  BETA: 'Beta',
  COMING_SOON: 'Coming soon',
  FUTURE: 'Future',
};

/** Library glyphs: ✓ ready, △ beta, ○ roadmap. */
export const STATUS_GLYPH: Record<ProtocolStatus, string> = { READY: '✓', BETA: '△', COMING_SOON: '○', FUTURE: '○' };
