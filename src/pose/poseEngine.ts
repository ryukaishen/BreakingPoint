// Browser-side MediaPipe Pose Landmarker. Everything runs locally in WebAssembly
// (GPU delegate when available); video frames never leave the device.
// Assets are served from /public (copied by `npm install`); if missing we fall
// back to the official CDN.

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import type { Pose } from './landmarks';

const LOCAL_WASM = '/mediapipe/wasm';
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const LOCAL_MODEL = '/models/pose_landmarker_full.task';
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task';

export type PoseEngineStatus = 'idle' | 'loading' | 'ready' | 'error';

async function exists(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    return r.ok && !(r.headers.get('content-type') ?? '').includes('text/html');
  } catch {
    return false;
  }
}

export class PoseEngine {
  private landmarker: PoseLandmarker | null = null;
  private lastTs = -1;
  status: PoseEngineStatus = 'idle';
  delegate: 'GPU' | 'CPU' = 'GPU';
  error: string | null = null;

  async init(): Promise<void> {
    if (this.landmarker) return;
    this.status = 'loading';
    try {
      const wasmBase = (await exists(`${LOCAL_WASM}/vision_wasm_internal.js`)) ? LOCAL_WASM : CDN_WASM;
      const modelPath = (await exists(LOCAL_MODEL)) ? LOCAL_MODEL : CDN_MODEL;
      const fileset = await FilesetResolver.forVisionTasks(wasmBase);
      const make = (delegate: 'GPU' | 'CPU') =>
        PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: modelPath, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
      try {
        this.landmarker = await make('GPU');
        this.delegate = 'GPU';
      } catch {
        this.landmarker = await make('CPU');
        this.delegate = 'CPU';
      }
      this.status = 'ready';
    } catch (e) {
      this.status = 'error';
      this.error = e instanceof Error ? e.message : String(e);
      throw e;
    }
  }

  /** Detect a pose in the current video frame. Returns null when no person is found. */
  detect(video: HTMLVideoElement, timestampMs: number): Pose | null {
    if (!this.landmarker || video.readyState < 2) return null;
    const ts = Math.max(timestampMs, this.lastTs + 1);
    this.lastTs = ts;
    const res = this.landmarker.detectForVideo(video, ts);
    const lm = res.landmarks?.[0];
    if (!lm || lm.length < 33) return null;
    return lm.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 0 }));
  }

  close() {
    this.landmarker?.close();
    this.landmarker = null;
    this.status = 'idle';
  }
}
