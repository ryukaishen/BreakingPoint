// Copies the MediaPipe WASM runtime into /public and downloads the pose model,
// so live mode works offline (e.g. on flaky venue Wi-Fi). If anything here
// fails, the app falls back to the public CDN at runtime — install never fails.
import { existsSync, mkdirSync, readdirSync, copyFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const quiet = process.argv.includes('--quiet');
const log = (...a) => { if (!quiet) console.log('[setup-assets]', ...a); };
const warn = (...a) => console.warn('[setup-assets]', ...a);

const MODELS = [
  {
    file: 'pose_landmarker_full.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
  },
  {
    file: 'pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  },
];

function copyWasm() {
  const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
  const dest = join(root, 'public', 'mediapipe', 'wasm');
  if (!existsSync(src)) {
    warn('MediaPipe WASM not found in node_modules (skipping copy).');
    return;
  }
  mkdirSync(dest, { recursive: true });
  let n = 0;
  for (const f of readdirSync(src)) {
    const s = join(src, f);
    const d = join(dest, f);
    if (existsSync(d) && statSync(d).size === statSync(s).size) continue;
    copyFileSync(s, d);
    n++;
  }
  log(`WASM runtime ready (${n} file(s) copied).`);
}

async function downloadModels() {
  const dir = join(root, 'public', 'models');
  mkdirSync(dir, { recursive: true });
  for (const m of MODELS) {
    const out = join(dir, m.file);
    if (existsSync(out) && statSync(out).size > 1_000_000) {
      log(`${m.file} already present.`);
      continue;
    }
    try {
      log(`Downloading ${m.file} ...`);
      const res = await fetch(m.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(out, buf);
      log(`${m.file} saved (${(buf.length / 1e6).toFixed(1)} MB).`);
    } catch (e) {
      warn(`Could not download ${m.file} (${e.message}). Live mode will use the CDN copy.`);
    }
  }
}

try {
  copyWasm();
  await downloadModels();
} catch (e) {
  warn('Asset setup skipped:', e.message);
}
