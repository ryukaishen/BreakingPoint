// Measures whether what an athlete must read from across the room is large enough to read,
// on a given device at a given distance. See docs/READABILITY_3M.md for the standard.
//
//   node scripts/readability.mjs --target board-b1 --device laptop15
//   node scripts/readability.mjs --url http://localhost:5173/ --probe "rep count|.focus-num|digits|T1" --device phone
//   node scripts/readability.mjs --table                       (the sizes the standard requires, per device)
//
// Options
//   --target <name>      a preset: board-b1 | app-session            (see PRESETS below)
//   --url <url>          page to open (overrides the preset's)
//   --probe "name|selector|kind|tier"   add a measurement; kind: digits | caps | thickness; tier: T1 | T2 | G. Repeatable.
//   --device <name>      laptop13 | laptop15 (default) | monitor24 | phone
//   --distance <metres>  viewing distance (default 3.0)
//   --sim <file.png>     also write a "what 3 m looks like" image (shrunk to the angle, lightly blurred)
//   --json <file>        write the measurements as JSON
//
// Exit status 1 when any measured item fails its tier, so it can gate a change.
// Dev tooling only: it opens a headless browser in a throwaway profile (scripts/lib/cdp.mjs).

import { writeFileSync } from 'node:fs';
import { connect, launch, sleep } from './lib/cdp.mjs';
import { angularSizeDeg, DEVICES, judge, NOMINAL_DISTANCE_M, requiredPx, TIERS, fontSizeForCapPx } from '../src/ui/readability.ts';

// ---------------------------------------------------------------- presets
const PRESETS = {
  'board-b1': {
    url: 'http://localhost:5173/docs/design-concepts.html',
    // The mock is drawn on a 1200x720 canvas scaled into the page. Measure it at its own pixels, as if it filled the screen.
    unscaled: true,
    // Show the mock at 1:1 (it is normally scaled to fit the page) so a screenshot of it is a screen.
    prepare: `(() => { const screen = document.querySelector('.B .hud').closest('.screen'); const vp = screen.closest('.viewport'); screen.style.transform = 'none'; vp.style.width = '1200px'; vp.style.height = '720px'; screen.scrollIntoView({ block: 'start' }); return true; })()`,
    simClip: { selector: '.B .hud', closest: '.screen' },
    description: 'The approved Direction B in-set mock (B1), at its own 1200x720 pixels.',
    probes: [
      { name: 'rep count', selector: '.B .hud .hrep', kind: 'digits', tier: 'T1' },
      { name: 'state word', selector: '.B .hud .hstate', kind: 'caps', tier: 'T1' },
      { name: 'instruction', selector: '.B .hud > div[style*="font-size:16px"]', kind: 'caps', tier: 'T2' },
      { name: 'record label', selector: '.B .hud .race .lane-lbl span', kind: 'caps', tier: 'T2' },
      { name: 'record marker', selector: '.B .hud .lane .ghost', kind: 'thickness', tier: 'G' },
    ],
  },
  'app-session': {
    url: 'http://localhost:5173/?demo=soccer',
    unscaled: false,
    // Wait until a demo set is under way, so the live panels show a real state.
    prepare: `new Promise((res) => { const t0 = Date.now(); const tick = () => { const s = window.__breakingpoint && window.__breakingpoint.engine.getSnapshot(); if (s && s.phase === 'monitoring' && s.monitorReps.length >= 3 && s.alarmRep === null) res(true); else if (Date.now() - t0 > 90000) res(false); else setTimeout(tick, 150); }; tick(); })`,
    description: 'The session screen as it is now (demo set, mid-set, stable).',
    probes: [
      { name: 'state word', selector: '.state-label', kind: 'caps', tier: 'T1' },
      { name: 'reps held', selector: '.held .v', kind: 'digits', tier: 'T1' },
      { name: 'instruction', selector: '.state-sub', kind: 'caps', tier: 'T2' },
      { name: 'record label', selector: '.held .pb', kind: 'caps', tier: 'T2' },
    ],
  },
};

// ---------------------------------------------------------------- the measurer that runs in the page
// Serialised with Function.prototype.toString, so it is ordinary source here (no string escaping).
async function measureInPage(probes, unscaled) {
  await document.fonts.ready;
  const ctx = document.createElement('canvas').getContext('2d');
  const num = (c) => {
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  /** The colour behind an element, or null when a gradient or image makes it unknowable here. */
  const behind = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = num(cs.backgroundColor);
      if (c && c.a > 0) return c.a < 1 ? null : c;
    }
    return { r: 255, g: 255, b: 255 };
  };
  return probes.map((p) => {
    const el = [...document.querySelectorAll(p.selector)].find((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!el) return { ...p, found: false };
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const k = unscaled || !el.offsetWidth ? 1 : rect.width / el.offsetWidth; // transform scale of the page
    const w = unscaled ? el.offsetWidth : rect.width;
    const h = unscaled ? el.offsetHeight : rect.height;
    const text = (el.textContent || '').trim().slice(0, 40);
    let px;
    let fontPx = null;
    let fontOk = true;
    let contrast = null;
    if (p.kind === 'thickness') {
      px = Math.min(w, h);
      const fill = num(cs.backgroundColor);
      const back = el.parentElement ? behind(el.parentElement) : null;
      contrast = fill && fill.a === 1 && back ? ratio(fill, back) : null;
    } else {
      fontPx = parseFloat(cs.fontSize) * k;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${parseFloat(cs.fontSize)}px ${cs.fontFamily}`;
      fontOk = document.fonts.check(ctx.font);
      const sample = p.kind === 'digits' ? (/\d/.exec(text) || ['0'])[0] : 'H';
      px = ctx.measureText(sample).actualBoundingBoxAscent * k;
      const fg = num(cs.color);
      const back = behind(el);
      contrast = fg && fg.a === 1 && back ? ratio(fg, back) : null;
    }
    return { ...p, found: true, px, fontPx, fontOk, text, contrast, family: cs.fontFamily.split(',')[0].replace(/["']/g, '') };
  });
}

// ---------------------------------------------------------------- command line
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const optAll = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));
const pad = (v, n) => String(v).padEnd(n);

if (args.includes('--table')) {
  console.log(`Sizes the standard requires at ${NOMINAL_DISTANCE_M} m (glyph height in CSS px, and the font size that gives it)\n`);
  console.log(pad('device', 54) + ['T1', 'T2', 'G'].map((t) => pad(`${t} ${TIERS[t].minDeg}°`, 22)).join(''));
  for (const [name, d] of Object.entries(DEVICES)) {
    const cells = ['T1', 'T2', 'G'].map((t) => {
      const px = requiredPx(TIERS[t].minDeg, NOMINAL_DISTANCE_M, d.mmPerPx);
      return pad(t === 'G' ? `${px.toFixed(0)} px` : `${px.toFixed(0)} px (font ${fontSizeForCapPx(px).toFixed(0)})`, 22);
    });
    console.log(pad(`${name}: ${d.label}`, 54) + cells.join(''));
  }
  process.exit(0);
}

const targetName = opt('target');
const preset = targetName ? PRESETS[targetName] : null;
if (targetName && !preset) {
  console.error(`Unknown target "${targetName}". Presets: ${Object.keys(PRESETS).join(', ')}`);
  process.exit(2);
}
const custom = optAll('probe').map((s) => {
  const [name, selector, kind, tier] = s.split('|');
  return { name, selector, kind, tier };
});
const probes = [...(preset?.probes ?? []), ...custom];
const url = opt('url', preset?.url);
if (!url || !probes.length) {
  console.error('Give --target <preset>, or --url with at least one --probe "name|selector|kind|tier". Run with --table for the required sizes.');
  process.exit(2);
}
const deviceName = opt('device', 'laptop15');
const device = DEVICES[deviceName];
if (!device) {
  console.error(`Unknown device "${deviceName}". Devices: ${Object.keys(DEVICES).join(', ')}`);
  process.exit(2);
}
const distance = Number(opt('distance', NOMINAL_DISTANCE_M));
const viewport = { laptop13: [1440, 900], laptop15: [1536, 864], monitor24: [1920, 1080], phone: [390, 844] }[deviceName];

// ---------------------------------------------------------------- run
const browser = await launch({ width: viewport[0], height: viewport[1] });
const page = await connect(browser.port);
let failures = 0;
try {
  await page.send('Emulation.setDeviceMetricsOverride', { width: viewport[0], height: viewport[1], deviceScaleFactor: 1, mobile: deviceName === 'phone' });
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await page.goto(url);
  await page.waitFor(`document.readyState === 'complete'`, { timeout: 30000 });
  if (preset?.prepare) {
    const ok = await page.evaluate(preset.prepare);
    if (!ok) console.warn('warning: the page did not reach the state the preset waits for; measuring anyway');
  }
  await sleep(500);
  const measured = await page.evaluate(`(${measureInPage.toString()})(${JSON.stringify(probes)}, ${JSON.stringify(!!preset?.unscaled)})`);

  console.log(`\n${preset?.description ?? url}`);
  console.log(`${device.label}, viewed from ${distance} m. One CSS pixel = ${device.mmPerPx} mm.\n`);
  console.log(pad('item', 16) + pad('tier', 6) + pad('glyph px', 10) + pad('angle', 9) + pad('needs', 11) + pad('reads to', 10) + pad('contrast', 12) + 'result');
  const rows = [];
  for (const m of measured) {
    if (!m.found) {
      failures++;
      console.log(pad(m.name, 16) + pad(m.tier, 6) + `NOT FOUND (${m.selector})`);
      rows.push({ ...m });
      continue;
    }
    const v = judge(m.tier, m.px, m.contrast, deviceName, distance);
    if (!v.pass) failures++;
    const c = v.contrast === null ? 'unknown' : `${v.contrast.toFixed(1)}:1 ${v.contrastOk ? '' : `(<${TIERS[m.tier].minContrast})`}`;
    console.log(
      pad(m.name, 16) + pad(m.tier, 6) + pad(m.px.toFixed(1), 10) + pad(`${v.angleDeg.toFixed(2)}°`, 9) + pad(`${v.requiredPx.toFixed(0)} px`, 11) + pad(`${v.readsToM.toFixed(1)} m`, 10) + pad(c, 12) + (v.pass ? 'pass' : 'FAIL'),
    );
    rows.push({ ...m, ...v });
  }
  console.log(`\n${failures ? `${failures} of ${measured.length} items do not meet the standard at ${distance} m.` : `All ${measured.length} items meet the standard at ${distance} m.`}`);
  console.log('Angles come from the rendered glyph height; this is a measurement of size and contrast, not a substitute for the real-device check in docs/READABILITY_3M.md.');

  const jsonOut = opt('json');
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ url, device: deviceName, distance, rows }, null, 2));

  const simOut = opt('sim');
  if (simOut) {
    // "What 3 m looks like": the screen shrunk to the angle it subtends from there compared with an arm's length
    // (0.6 m), lightly blurred for the eye's limit. An aid for looking, not a pass or fail.
    // A preset can name the element that IS the screen (a mock inside a page); otherwise the viewport is.
    const clip = preset?.simClip
      ? await page.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(preset.simClip.selector)}).closest(${JSON.stringify(preset.simClip.closest)}); const r = e.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height, scale: 1 }; })()`)
      : null;
    const shot = await page.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip, captureBeyondViewport: true } : {}) });
    const k = distance / 0.6;
    const w = Math.round((clip?.width ?? viewport[0]) / k);
    const h = Math.round((clip?.height ?? viewport[1]) / k);
    await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    const frame = (await page.send('Page.getFrameTree')).frameTree.frame.id;
    await page.send('Page.setDocumentContent', {
      frameId: frame,
      html: `<body style="margin:0;background:#000"><img style="width:${w}px;filter:blur(0.5px)" src="data:image/png;base64,${shot.data}"></body>`,
    });
    await sleep(400);
    const small = await page.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(simOut, Buffer.from(small.data, 'base64'));
    console.log(`Wrote the ${distance} m view (${w}x${h}) to ${simOut}`);
  }
} finally {
  page.close();
  browser.kill();
}
process.exit(failures ? 1 : 0);
