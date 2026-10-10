// Phase 4A.5: run every measurement stream through every signal-chain variant.
//
//   npx vite-node research/measurement/run_variants.ts
//
// Inputs (git-ignored, built by research/measurement/build_streams.py and Phase 4A):
//   data/processed/measurement/streams/jump/<stream>/*.f64     jump trials, nine camera set-ups
//   data/processed/landmarks/rehab/<exercise>/<view>/*.json    REHAB24-6 squats and lunges (Phase 4A)
// Output: data/processed/measurement/runs/<dataset>/<stream>/<variant>__s<sigma>__seed<n>.json
//
// The app's code is imported unchanged; the variants differ only in landmark smoothing
// (research/measurement/variants.ts). Nothing is scored against a baseline here.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExerciseType } from '../../src/biomechanics/catalog';
import { NUM_LANDMARKS, type Pose } from '../../src/pose/landmarks';
import { poseFromFlat } from '../evaluation/offlinePipeline';
import { TracedOneEuro, VARIANTS, hash32, runVariant, type VariantId } from './variants';

const ROOT = join(process.cwd(), 'data', 'processed');
const M = join(ROOT, 'measurement');
const HOLD = { jump: 1.7, rehab: 0 }; // as in Phase 4A (research/evaluation/extract_features.ts)
const NOISE_SIGMAS = [0.002, 0.004]; // landmark jitter, image heights (about 1.4 and 2.9 px at 720p)
const NOISE_SEEDS = [1, 2, 3];
const JUMP_NOISE_STREAMS = ['az35_d3.5'];
const REHAB_SETS: [string, string, ExerciseType, boolean][] = [
  ['ex6_squat', 'oblique35', 'squat', true],
  ['ex6_squat', 'side', 'squat', false],
  ['ex5_lunge', 'side', 'lunge', true],
  ['ex5_lunge', 'oblique35', 'lunge', false],
];

const APP_SOURCES = [
  'src/pose/smoothing.ts', 'src/biomechanics/frameMetrics.ts', 'src/reps/segmenter.ts', 'src/biomechanics/repFeatures.ts',
  'research/evaluation/offlinePipeline.ts', 'research/measurement/variants.ts',
];
const sourceHashes = Object.fromEntries(APP_SOURCES.map((f) => [f, createHash('sha256').update(readFileSync(f)).digest('hex')]));

/** Eight stored landmarks -> a full 33-landmark pose (the others are never read by the app's metrics). */
function posesFromF64(path: string, landmarks: number[]): Pose[] {
  const buf = readFileSync(path);
  const v = new Float64Array(buf.buffer, buf.byteOffset, buf.byteLength / 8);
  const per = landmarks.length * 3;
  const out: Pose[] = [];
  for (let f = 0; f * per < v.length; f++) {
    const pose: Pose = Array.from({ length: NUM_LANDMARKS }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
    landmarks.forEach((lm, k) => {
      pose[lm] = { x: v[f * per + 3 * k], y: v[f * per + 3 * k + 1], visibility: v[f * per + 3 * k + 2] };
    });
    out.push(pose);
  }
  return out;
}

function save(dataset: string, stream: string, variant: VariantId, sigma: number, seed: number, meta: object, recordings: object[]) {
  const dir = join(M, 'runs', dataset, stream);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${variant}__s${sigma}__seed${seed}.json`),
    JSON.stringify({ dataset, stream, variant, noise_sigma: sigma, noise_seed: seed, app_sources_sha256: sourceHashes, ...meta, recordings }));
}

function runSet(dataset: 'jump' | 'rehab', stream: string, exercise: ExerciseType, recs: { id: string; poses: Pose[]; fps: number; aspect: number }[], noisy: boolean) {
  const runs: [number, number][] = [[0, 0], ...(noisy ? NOISE_SIGMAS.flatMap((s) => NOISE_SEEDS.map((k) => [s, k] as [number, number])) : [])];
  for (const variant of VARIANTS) {
    for (const [sigma, seed] of runs) {
      const out = recs.map((r) => {
        const times = r.poses.map((_, i) => i / r.fps);
        const res = runVariant(r.poses, times, r.aspect, exercise, variant, HOLD[dataset],
          sigma > 0 ? { sigma, seed: (hash32(r.id) ^ (seed * 0x9e3779b1)) >>> 0 } : null);
        return { recording: r.id, standingFound: res.standingFound, reps: res.reps,
                 ...(dataset === 'jump' && res.reps.length !== 1 ? { phaseLog: res.phaseLog } : {}) };
      });
      save(dataset, stream, variant, sigma, seed, { exercise, hold_last_frame_s: HOLD[dataset] }, out);
    }
  }
  console.log(`${dataset}/${stream}: ${recs.length} recordings x ${VARIANTS.length} variants x ${runs.length} noise runs`);
}

// ---------------------------------------------------------------- jump
const jumpStreams = join(M, 'streams', 'jump');
for (const stream of readdirSync(jumpStreams)) {
  const index = JSON.parse(readFileSync(join(jumpStreams, stream, 'index.json'), 'utf8'));
  const recs = index.recordings.map((m: { recording: string; fps: number }) => ({
    id: m.recording, fps: m.fps, aspect: index.aspect, poses: posesFromF64(join(jumpStreams, stream, `${m.recording}.f64`), index.landmarks),
  }));
  runSet('jump', stream, 'cmj', recs, JUMP_NOISE_STREAMS.includes(stream));
  if (stream === 'az35_d3.5') {
    // One Euro diagnostics on the left (near-side) ankle height: the cutoff the filter actually used.
    const trace = recs.map((r: { id: string; poses: Pose[]; fps: number }) => {
      const f = new TracedOneEuro();
      const cutoff: number[] = [];
      const raw: number[] = [];
      const smooth: number[] = [];
      r.poses.forEach((p, i) => {
        raw.push(p[27].y);
        smooth.push(f.filter(p[27].y, i / r.fps));
        cutoff.push(f.lastCutoff);
      });
      return { recording: r.id, fps: r.fps, ankle_y_raw: raw, ankle_y_one_euro: smooth, cutoff_hz: cutoff };
    });
    mkdirSync(join(M, 'runs', 'jump'), { recursive: true });
    writeFileSync(join(M, 'runs', 'jump', 'one_euro_trace_az35_d3.5.json'), JSON.stringify({ landmark: 'left ankle y', recordings: trace }));
  }
}

// ---------------------------------------------------------------- REHAB24-6 (Phase 4A landmark streams)
for (const [ex, view, exercise, primary] of REHAB_SETS) {
  const dir = join(ROOT, 'landmarks', 'rehab', ex, view);
  if (!existsSync(dir)) throw new Error(`missing ${dir}; run research/adapters/build_landmarks.py`);
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  const recs = index.recordings.map((m: { recording: string }) => {
    const rec = JSON.parse(readFileSync(join(dir, `${m.recording}.json`), 'utf8'));
    return { id: m.recording, fps: rec.fps, aspect: rec.aspect, poses: (rec.frames as number[][]).map(poseFromFlat) };
  });
  runSet('rehab', `${ex}/${view}`, exercise, recs, primary);
}
