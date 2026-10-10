# Motion capture vs the app's webcam measurements

BreakingPoint measures people with MediaPipe Pose on one camera. The real-world evaluation instead feeds motion-capture positions through a virtual camera into the app's own code (`research/adapters/landmarks.py`, `research/evaluation/offlinePipeline.ts`). This page lists how the two differ, so no result from the offline pipeline is read as a webcam result.

## Points on the body

| App landmark (MediaPipe index) | Jump dataset (markers) | REHAB24-6 (skeleton joints) | Difference from MediaPipe |
|---|---|---|---|
| Shoulder (11, 12) | acromion marker LSHO/RSHO | glenohumeral joint centre (LeftArm/RightArm) | The marker sits on top of the shoulder, above the joint centre |
| Hip (23, 24) | greater-trochanter marker LGT/RGT | hip joint centre (LeftUpLeg/RightUpLeg) | MediaPipe's hip is a learned keypoint between the two; the trochanter is lateral and a little lower |
| Knee (25, 26) | midpoint of lateral and medial epicondyle markers | knee joint centre | Close to the joint centre in both |
| Ankle (27, 28) | midpoint of the malleolus markers | ankle joint centre | Close to the joint centre in both |
| Heel, toe (29 to 32) | heel and toe markers | toe only; no heel | Not used by any app measurement |

## Angles

- **The app's angles are 2D.** Knee flexion is 180 degrees minus the angle between hip, knee and ankle *in the image* (x scaled by the aspect ratio); hip flexion uses shoulder, hip and knee; trunk lean is the hip-to-shoulder line's angle from vertical. They depend on the camera's viewpoint: an oblique view shortens flexion compared with a side view.
- **OpenSim angles (jump dataset) are 3D anatomical joint coordinates** from a scaled musculoskeletal model. They are not the same quantity as the app's 2D angles and are used only to check that the offline measurements move together with them.
- **REHAB24-6 has no joint angles**; the offline pipeline's reference is the 3D angle between the skeleton's joint centres.

## Signal

| | MediaPipe webcam (live app) | Offline pipeline |
|---|---|---|
| Rate | camera frame rate, about 30 fps | 30 fps (jump data resampled from 250 Hz; REHAB24-6 at 30 fps) |
| Noise and jitter | yes, smoothed by the app's One Euro filter | none in the input; the same filter is applied |
| Far-side limb | often hidden or guessed | always present (visibility set to 0.9) |
| Lost frames, low confidence | yes; the app leaves reps unscored | never |
| Depth | estimated by the model, not used by the app | true 3D, projected through a pinhole camera |
| Camera placement | wherever the athlete puts it | as the app advises (hip height, 3 to 3.5 m, side-on or 35 degrees oblique) |

## Consequences

- Offline results are a **best case** for the app's measurement and segmentation code. They say nothing about how well MediaPipe tracks real video. That needs real recorded footage run through MediaPipe (for example REHAB24-6's videos), as its own evaluation.
- Left/right measures are likely more informative offline than live, because the far leg is never hidden.
- The app's jump timing uses its smoothed ankle position. On clean data its touchdown fires about 0.37 s after force-plate contact, so its "flight time" is longer than the true flight time and its "landing knee flexion" window starts after the deepest part of the landing (`research/reports/phase4a_dataset_integration.md`). These are properties of the app's code, not of the offline pipeline.
