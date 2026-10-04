// MediaPipe Pose (BlazePose) 33-landmark topology. "Left"/"right" are the
// athlete's own sides.

export interface Landmark {
  x: number; // normalized [0,1] of image width
  y: number; // normalized [0,1] of image height
  z?: number;
  visibility: number; // [0,1]
}

export type Pose = Landmark[];

export const LM = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFoot: 31,
  rightFoot: 32,
} as const;

export const NUM_LANDMARKS = 33;

/** Body connections drawn on the overlay (face mesh points omitted for clarity). */
export const CONNECTIONS: [number, number][] = [
  [LM.leftShoulder, LM.leftEar],
  [LM.rightShoulder, LM.rightEar],
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftShoulder, LM.leftElbow],
  [LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow],
  [LM.rightElbow, LM.rightWrist],
  [LM.leftShoulder, LM.leftHip],
  [LM.rightShoulder, LM.rightHip],
  [LM.leftHip, LM.rightHip],
  [LM.leftHip, LM.leftKnee],
  [LM.leftKnee, LM.leftAnkle],
  [LM.leftAnkle, LM.leftHeel],
  [LM.leftHeel, LM.leftFoot],
  [LM.leftAnkle, LM.leftFoot],
  [LM.rightHip, LM.rightKnee],
  [LM.rightKnee, LM.rightAnkle],
  [LM.rightAnkle, LM.rightHeel],
  [LM.rightHeel, LM.rightFoot],
  [LM.rightAnkle, LM.rightFoot],
];

export const LEFT_SIDE = new Set<number>([7, 11, 13, 15, 23, 25, 27, 29, 31]);
export const RIGHT_SIDE = new Set<number>([8, 12, 14, 16, 24, 26, 28, 30, 32]);

/** Landmarks that must be visible for reliable lower-body kinematics. */
export const KEY_LANDMARKS = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle];
