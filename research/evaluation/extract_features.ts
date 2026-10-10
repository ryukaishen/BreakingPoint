// Run every prepared recording through the app's own rep detection and measurement code.
//
//   npx vite-node research/evaluation/extract_features.ts
//
// Reads data/processed/landmarks/**/index.json (written by research/adapters/build_landmarks.py)
// and writes the matching data/processed/features/**/features.json: for each recording, every
// rep the app's segmenter found, with its timing and the app's rep measurements. Nothing is
// scored against a baseline here and no detector runs; that belongs to the evaluation itself.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import type { ExerciseType } from '../../src/biomechanics/catalog';
import { extractRecording, poseFromFlat } from './offlinePipeline';

const ROOT = join(process.cwd(), 'data', 'processed');
/**
 * Jump trials were trimmed shortly after landing, often while the athlete was still crouched.
 * Holding the last pose for 1.7 s lets the app's jump segmenter close the jump through its own
 * 1.6 s landing timeout. The jump measurements read nothing later than 0.5 s after landing, and
 * every trial has more than that after contact, so the held frames never enter a measurement
 * (checked in research/evaluation/integration_report.py).
 */
const HOLD_LAST_FRAME_S: Record<string, number> = { jump_fatigue: 1.7, rehab24_6: 0 };
const LANDMARKS = join(ROOT, 'landmarks');
const FEATURES = join(ROOT, 'features');

/** The app files whose code produces the numbers below; their hashes go into every output. */
const APP_SOURCES = [
  'src/pose/smoothing.ts',
  'src/biomechanics/frameMetrics.ts',
  'src/reps/segmenter.ts',
  'src/biomechanics/repFeatures.ts',
  'shared/feature_catalog.json',
  'research/evaluation/offlinePipeline.ts',
];

function indexes(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...indexes(p));
    else if (name === 'index.json') out.push(p);
  }
  return out;
}

const sourceHashes = Object.fromEntries(
  APP_SOURCES.map((f) => [f, createHash('sha256').update(readFileSync(f)).digest('hex')]),
);

const found = indexes(LANDMARKS);
if (!found.length) {
  console.error('No landmark indexes found. Run: python -I research/adapters/build_landmarks.py');
  process.exit(1);
}

for (const indexPath of found) {
  const index = JSON.parse(readFileSync(indexPath, 'utf8'));
  const dir = dirname(indexPath);
  const exercise: ExerciseType = index.movement ?? index.exercise;
  const results = [];
  for (const meta of index.recordings) {
    const rec = JSON.parse(readFileSync(join(dir, `${meta.recording}.json`), 'utf8'));
    const poses = (rec.frames as number[][]).map(poseFromFlat);
    const times = poses.map((_, i) => i / rec.fps);
    const r = extractRecording(poses, times, rec.aspect, exercise, HOLD_LAST_FRAME_S[index.dataset] ?? 0);
    results.push({ recording: meta.recording, ...r });
  }
  const outPath = join(FEATURES, relative(LANDMARKS, dir), 'features.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify({
      dataset: index.dataset,
      exercise,
      view: index.view,
      primary: index.primary,
      hold_last_frame_s: HOLD_LAST_FRAME_S[index.dataset] ?? 0,
      generated_at: new Date().toISOString(),
      app_sources_sha256: sourceHashes,
      recordings: results,
    }),
  );
  const reps = results.reduce((s, r) => s + r.reps.length, 0);
  console.log(`${relative(LANDMARKS, dir).replace(/\\/g, '/')}: ${results.length} recordings, ${reps} reps found`);
}
