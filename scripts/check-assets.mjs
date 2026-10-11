// Verifies that a build serves its own pinned MediaPipe assets, so a deployment never
// silently depends on a CDN or on a different model:
//   - the pose model, byte for byte (SHA-256 pinned in scripts/setup-assets.mjs);
//   - the WASM runtime, identical to the pinned @mediapipe/tasks-vision package.
//
//   node scripts/check-assets.mjs [dir]      dir defaults to dist (the build output)
//
// Exit status 1 on any problem. Run after `vite build` (see vercel.json).
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, process.argv[2] ?? 'dist');
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
// Read the pins from the setup script rather than repeating them here.
const setup = readFileSync(join(root, 'scripts', 'setup-assets.mjs'), 'utf8');
const pins = [...setup.matchAll(/file: '([^']+)',[\s\S]*?sha256: '([0-9a-f]{64})'/g)].map((m) => ({ file: m[1], sha256: m[2] }));

const problems = [];
if (!pins.length) problems.push('no model pins found in scripts/setup-assets.mjs');
for (const m of pins) {
  const p = join(out, 'models', m.file);
  if (!existsSync(p)) problems.push(`missing ${p}`);
  else if (sha256(p) !== m.sha256) problems.push(`${m.file}: SHA-256 differs from the pin`);
}

const pkgWasm = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const outWasm = join(out, 'mediapipe', 'wasm');
const version = JSON.parse(readFileSync(join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'package.json'), 'utf8')).version;
const pinned = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).dependencies['@mediapipe/tasks-vision'];
if (version !== pinned) problems.push(`@mediapipe/tasks-vision installed ${version}, package.json pins ${pinned}`);
if (!existsSync(outWasm)) problems.push(`missing ${outWasm}`);
else
  for (const f of readdirSync(pkgWasm)) {
    const p = join(outWasm, f);
    if (!existsSync(p)) problems.push(`missing wasm/${f}`);
    else if (sha256(p) !== sha256(join(pkgWasm, f))) problems.push(`wasm/${f} differs from @mediapipe/tasks-vision@${version}`);
  }

if (problems.length) {
  console.error('[check-assets] FAILED\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`[check-assets] ok: ${pins.length} model(s) match their pins; WASM runtime matches @mediapipe/tasks-vision@${version}.`);
