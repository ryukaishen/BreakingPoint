// Copies the MediaPipe WASM runtime into /public and downloads the pose model,
// so live mode works offline (e.g. on flaky venue Wi-Fi) and a deployment serves
// its own copies. If anything here fails, the app falls back to the public CDN at
// runtime, so install never fails.
//
// Pinning: the WASM runtime comes from @mediapipe/tasks-vision, whose version is
// pinned exactly in package.json. The model is pinned to one object generation of
// Google's "latest" file (the bytes the app was built and tested with; the
// versioned "/1/" file is a different build) and checked against its SHA-256.
// scripts/check-assets.mjs verifies both again in the build output.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, copyFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const quiet = process.argv.includes('--quiet');
const log = (...a) => { if (!quiet) console.log('[setup-assets]', ...a); };
const warn = (...a) => console.warn('[setup-assets]', ...a);

export const MODELS = [
  {
    file: 'pose_landmarker_full.task',
    // Generation 1682642787774579 of float16/latest (2023-04-28). A different generation returns 404.
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task?generation=1682642787774579',
    sha256: '4eaa5eb7a98365221087693fcc286334cf0858e2eb6e15b506aa4a7ecdcec4ad',
    bytes: 9398198,
  },
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

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
    if (existsSync(d) && sha256(readFileSync(d)) === sha256(readFileSync(s))) continue;
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
    if (existsSync(out) && statSync(out).size === m.bytes && sha256(readFileSync(out)) === m.sha256) {
      log(`${m.file} already present and verified.`);
      continue;
    }
    try {
      log(`Downloading ${m.file} ...`);
      const res = await fetch(m.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const got = sha256(buf);
      if (got !== m.sha256) throw new Error(`SHA-256 mismatch (got ${got.slice(0, 16)}…, expected ${m.sha256.slice(0, 16)}…)`);
      writeFileSync(out, buf);
      log(`${m.file} saved and verified (${(buf.length / 1e6).toFixed(1)} MB).`);
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
