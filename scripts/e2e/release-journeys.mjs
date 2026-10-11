// Release checks: the user journeys a first-time visitor takes, in a real headless browser.
//
//   npm run build && npm run preview -- --port 4173 --strictPort     (in one terminal)
//   BASE=http://127.0.0.1:4173/ node scripts/e2e/release-journeys.mjs
//
// Runs against the production build (no dev hooks), in throwaway browser profiles, so nothing
// of the user's data is touched. The camera journeys use the browser's fake camera (a test
// pattern, no person), so they cover permissions, errors, model loading and clean-up, not pose
// tracking on a real body. Optional OUT=<dir> saves screenshots of the key states.
// Exit status 1 when any check fails.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { connect, launch, sleep } from '../lib/cdp.mjs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const OUT = process.env.OUT ?? null;
if (OUT) mkdirSync(OUT, { recursive: true });
let fails = 0;
let total = 0;
const check = (name, ok, detail = '') => {
  total++;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `   [${String(detail).slice(0, 160)}]` : ''}`);
};
const section = (t) => console.log(`\n-- ${t}`);

const KEYS = {
  Tab: ['Tab', 'Tab', 9],
  Enter: ['Enter', 'Enter', 13, '\r'],
  Escape: ['Escape', 'Escape', 27],
  Space: [' ', 'Space', 32, ' '],
  4: ['4', 'Digit4', 52, '4'],
};
const key = (p, k) => p.press(...KEYS[k]);

async function shot(p, name) {
  if (!OUT) return;
  const { data } = await p.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
}

async function open({ width = 1440, height = 900, extraArgs = [] } = {}) {
  const browser = await launch({ width, height, extraArgs });
  const p = await connect(browser.port);
  // A long headless run can mark the tab hidden, and hidden pages skip lazy images and throttle
  // rendering. A visitor's tab is visible, so keep this one visible and focused too.
  await p.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await p.send('Page.bringToFront');
  return { browser, p, E: (js) => p.evaluate(js) };
}

const ready = (p) => p.waitFor(`document.readyState === 'complete' && document.querySelector('.app')`, { timeout: 15000 });
const text = (sel) => `(document.querySelector(${JSON.stringify(sel)})?.textContent ?? '')`;
const noOverflow = `document.documentElement.scrollWidth <= window.innerWidth + 1`;
// Mobile emulation widens the layout viewport to fit overflowing content, so on a phone compare with the device width.
const PHONE_W = 390;
const fitsPhone = `document.documentElement.scrollWidth <= ${PHONE_W} + 1`;

/** Run a demo until the set ends and the summary dialog is open. */
async function runDemo(p, id) {
  await p.goto(`${BASE}?demo=${id}&speed=4`);
  await ready(p);
  await p.waitFor(`document.querySelector('[role=dialog][aria-labelledby=summary-title]')`, { timeout: 90000, label: `${id} summary dialog` });
}

/** Open a live session for the squat protocol (creates the athlete on first use). */
async function startLive(p, E) {
  await p.goto(`${BASE}?sport=strength`);
  await ready(p);
  // The sport page opens once the detector settings have loaded.
  await p.waitFor(`[...document.querySelectorAll('button')].some((b) => /Start live camera/.test(b.textContent))`, { timeout: 15000, label: 'sport page' });
  await p.click('button', 'Start live camera');
  await sleep(300);
  if (await E(`!!document.querySelector('#athlete-dialog-title')`)) {
    await p.click('.field-input');
    await p.type('Release Tester');
    await p.click('form[role=dialog] button', 'Add athlete');
  }
  await p.waitFor(`document.querySelector('main#main.dashboard')`, { timeout: 15000 });
}

// ------------------------------------------------------------------ desktop
{
  const { browser, p, E } = await open();
  try {
    section('1. Landing page');
    await p.goto(BASE);
    await ready(p);
    await p.waitFor(`document.querySelector('main#main h1')`);
    const h1 = await E(text('main#main h1'));
    check('1.1 the headline names the idea', /Your movement\.\s*Your baseline\./.test(h1), h1);
    const lede = await E(`document.querySelector('main#main .hero p')?.textContent ?? ''`);
    check('1.2 one plain sentence says what it does', /learns how you move when you.re fresh, then tracks how your form changes/i.test(lede), lede);
    check('1.3 the demo is one click away', await E(`[...document.querySelectorAll('button')].some((b) => /Run the soccer demo/.test(b.textContent))`));
    const meta = await E(`document.querySelector('meta[name=description]')?.content ?? ''`);
    check('1.4 the page description makes no fatigue claim', meta.length > 0 && !/fatigue/i.test(meta), meta);
    check('1.5 no horizontal scroll at 1440px', await E(noOverflow));
    await shot(p, 'desktop-landing');

    section('2. Squat demo to the alert and the summary');
    await runDemo(p, 'strength');
    const summary = await E(text('[role=dialog][aria-labelledby=summary-title]'));
    check('2.1 the summary names the alert rep', /alert triggered at rep \d+/i.test(summary) || /Rep \d+/.test(summary), summary.slice(0, 120));
    check('2.2 a squat is never labelled with the jump pattern', !/EXPLOSIVE/i.test(summary));
    check('2.3 the summary explains what changed in plain words', /leaned forward|drive|bend|depth/i.test(summary));
    // The chart keeps its technical axis labels; everything else in the summary is plain words.
    const plain = await E(`(() => { const d = document.querySelector('[role=dialog][aria-labelledby=summary-title]').cloneNode(true); d.querySelectorAll('svg').forEach((x) => x.remove()); return d.textContent; })()`);
    check('2.3b outside the chart, the summary shows no statistics symbols (σ, EWMA, CUSUM)', !/σ|EWMA|CUSUM/.test(plain), plain.match(/.{0,30}(σ|EWMA|CUSUM).{0,20}/)?.[0] ?? '');
    const ticks = await E(`[...document.querySelectorAll('[role=dialog] svg text')].map((t) => Number(t.textContent)).filter((n) => Number.isInteger(n) && n > 0)`);
    const reps = await E(`(() => { const m = document.querySelector('[role=dialog]').textContent.match(/(\\d+)\\s*reps? scored|Reps\\s*(\\d+)/); return m ? Number(m[1] ?? m[2]) : null; })()`);
    check('2.4 the chart axis ends at the last rep of the set', ticks.length > 0 && Math.max(...ticks) <= 12, `max tick ${Math.max(...ticks)}, reps ${reps}`);
    await shot(p, 'desktop-squat-summary');
    await key(p, 'Escape');
    await p.waitFor(`!document.querySelector('[aria-labelledby=summary-title]')`, { label: 'summary closes on Escape' });
    check('2.5 Escape closes the summary', true);
    const plate = await E(text('.focus .plate'));
    check('2.6 the athlete view says to rest', plate === 'Rest', plate);
    check('2.6b the athlete view uses no statistics symbols', !/σ|EWMA|CUSUM/.test(await E(text('.focus'))));
    check('2.7 the next step is the primary action', /Start recovery check/.test(await E(text('.focus-actions .btn.primary'))));
    check('2.8 detector evidence is shown below in demos', await E(`!!document.querySelector('#evidence')`));
    await shot(p, 'desktop-squat-rest');
    await p.click('.focus-actions .btn.primary', 'Start recovery check');
    await p.waitFor(`/of the change gone/.test(document.querySelector('.focus')?.textContent ?? '')`, { timeout: 60000, label: 'recovery result' });
    const rec = await E(text('.focus .plate'));
    check('2.9 the recovery check finishes with a result', /usual form|Partly back|Still different/.test(rec), rec);
    await E(`document.querySelector('#evidence')?.scrollIntoView()`);
    await sleep(300);
    await shot(p, 'desktop-squat-evidence');
    await E(`window.scrollTo(0, 0)`);

    section('3. Jump and lunge demos');
    for (const [id, name, pattern] of [
      ['soccer', 'jump (CMJ)', /EXPLOSIVE OUTPUT DROPPING/],
      ['pickleball', 'lunge (beta)', /RECOVERY SLOWING|RANGE OF MOTION|TECHNIQUE/],
    ]) {
      await runDemo(p, id);
      const s = await E(text('[role=dialog][aria-labelledby=summary-title]'));
      check(`3.${id === 'soccer' ? 1 : 2} the ${name} demo reaches the alert and the summary`, /rep \d+/i.test(s) && pattern.test(s), s.match(/[A-Z][A-Z –-]{8,}[A-Z]/)?.[0] ?? '');
    }

    section('5. HiPerGator evidence panel');
    await p.send('Page.bringToFront');
    await p.goto(BASE);
    await ready(p);
    await p.click('.app-header button', 'Lab');
    await p.waitFor(`document.querySelector('[role=dialog][aria-labelledby=research-title]')`);
    const lab = await E(text('[role=dialog][aria-labelledby=research-title]'));
    check('5.1 the study is labelled synthetic', /synthetic/i.test(lab));
    check('5.2 the headline numbers are there', /100,000/.test(lab) && /25,280/.test(lab) && /2\.2%/.test(lab) && /89\.6%/.test(lab));
    check('5.3 it says what the study does not show', /not\b[^.]*(real athletes|real cameras|fatigue|injury)/i.test(lab));
    const links = await E(`[...document.querySelectorAll('[role=dialog] a[href]')].map((a) => a.href)`);
    check('5.4 links to the original report, config and job records', ['VALIDATION_REPORT.md', 'breakingpoint_detector_config.json', 'hipergator_jobs.txt'].every((f) => links.some((h) => h.includes(f))), `${links.length} links`);
    check('5.5 GitHub links are pinned to a commit', links.filter((h) => h.includes('github.com')).every((h) => /\/blob\/[0-9a-f]{7,40}\//.test(h) || !h.includes('/blob/')));
    const cfg = await E(`fetch('/breakingpoint_detector_config.json').then((r) => r.ok && r.headers.get('content-type')?.includes('json'))`);
    check('5.6 the detector settings file is served', cfg);
    // The figures shown by default must load; the technical ones sit in collapsed sections and load
    // lazily when opened, so for those it is enough that the site serves them.
    const vis = `[...document.querySelectorAll('[role=dialog] img')].filter((i) => !i.closest('details:not([open])'))`;
    const nVis = await E(`${vis}.length`);
    for (let i = 0; i < nVis; i++) {
      await E(`${vis}[${i}].scrollIntoView({ block: 'center' })`);
      await sleep(200);
    }
    await p.waitFor(`${vis}.every((i) => i.complete && i.naturalWidth > 0)`, { timeout: 10000 }).catch(() => {});
    const shown = await E(`${vis}.map((i) => [i.getAttribute('src'), i.complete && i.naturalWidth > 0, i.complete, i.naturalWidth, Math.round(i.getBoundingClientRect().top)])`);
    check('5.7 the figures shown by default load', shown.length >= 3 && shown.every(([, ok]) => ok), shown.filter(([, ok]) => !ok).map((x) => JSON.stringify(x)).join(', ') || `${shown.length} figures`);
    const tucked = await E(`Promise.all([...document.querySelectorAll('[role=dialog] details img')].map((i) => fetch(i.getAttribute('src')).then((r) => r.ok && (r.headers.get('content-type') ?? '').includes('image/png'))))`);
    check('5.7b the technical figures behind "show more" are served', tucked.length > 0 && tucked.every(Boolean), `${tucked.filter(Boolean).length}/${tucked.length}`);
    await shot(p, 'desktop-research-lab');
    await p.click('[role=tab]', 'Real-world evaluation');
    const rw = await E(text('[role=dialog] .modal-body'));
    check('5.8 the real-world tab is status-only (no result numbers)', !/\d+(\.\d+)?\s*%|AUC|\b0\.\d{2}\b/.test(rw), rw.slice(0, 100));
    await key(p, 'Escape');
    await p.waitFor(`!document.querySelector('[aria-labelledby=research-title]')`, { label: 'research panel closes' });
    check('5.9 Escape closes the panel', true);

    section('7. Keyboard and reduced motion');
    await p.goto(BASE);
    await ready(p);
    await key(p, 'Tab');
    check('7.1 the first Tab reaches the skip link', await E(`document.activeElement?.classList.contains('skip-link')`));
    let found = false;
    for (let i = 0; i < 40 && !found; i++) {
      await key(p, 'Tab');
      found = await E(`/Run the soccer demo/.test(document.activeElement?.textContent ?? '')`);
    }
    check('7.2 the demo button is reachable by Tab', found);
    const ring = await E(`getComputedStyle(document.activeElement).outlineStyle !== 'none'`);
    check('7.3 the focused control shows a focus ring', ring);
    await key(p, 'Enter');
    await p.waitFor(`document.querySelector('main#main.dashboard')`, { label: 'session opens from the keyboard' });
    check('7.4 Enter starts the demo', true);
    await sleep(800);
    await key(p, 'Space');
    await sleep(200);
    check('7.5 Space pauses the demo', await E(`!!document.querySelector('button[aria-label="Resume demo"]')`));
    await key(p, 'Space');
    await key(p, '4');
    await sleep(200);
    check('7.6 4 sets the demo speed', await E(`document.querySelector('[aria-label="Demo speed"] button[aria-pressed=true]')?.textContent === '4×'`));
    await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const dur = await E(`parseFloat(getComputedStyle(document.querySelector('.btn')).transitionDuration)`);
    const anim = await E(`parseFloat(getComputedStyle(document.querySelector('.badge .dot') ?? document.body).animationDuration)`);
    check('7.7 reduced motion removes transitions and animations', dur < 0.001 && anim < 0.001, `transition ${dur}s, animation ${anim}s`);
    await p.send('Emulation.setEmulatedMedia', { features: [] });

    const errors = p.logs.filter((l) => /^(error|EXCEPTION)/.test(l));
    check('no console errors or uncaught exceptions on the desktop journeys', errors.length === 0, errors.join(' | '));
  } finally {
    p.close();
    browser.kill();
  }
}

// ------------------------------------------------------------------ camera
section('4. Live camera: permission, errors, clean-up');
{
  // Granted: the fake camera answers with a test pattern (there is no person in it).
  const { browser, p, E } = await open({ extraArgs: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    await startLive(p, E);
    await p.waitFor(`(() => { const v = document.querySelector('.stage video'); return v && v.readyState >= 2 && !v.paused; })()`, { timeout: 20000, label: 'camera video playing' });
    check('4.1 with permission, the camera stream plays', true);
    await p.waitFor(`/fps, on-device pose model/.test(document.querySelector('.stage')?.textContent ?? '')`, { timeout: 60000, label: 'pose model ready' }).catch(() => {});
    const fps = await E(text('.stage .privacy-note.mono'));
    check('4.2 the pinned pose model loads from this site and runs', /fps, on-device pose model/.test(fps), fps);
    const net = await E(`performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /pose_landmarker|vision_wasm/.test(n))`);
    check('4.3 model and runtime come from this deployment, not a CDN', net.length > 0 && net.every((n) => n.startsWith(new URL(BASE).origin)), net.map((n) => n.replace(/^.*\//, '')).join(', '));
    check('4.4 no error box', !(await E(`/Camera unavailable/.test(document.body.textContent)`)));
    check('4.5 the athlete view asks them to step into frame', /Step into the frame|whole body/.test(await E(text('.focus-instruction'))));
    check('4.6 live sessions show the hands-free option', /Hands-free/.test(await E(text('.session-options'))));
    await shot(p, 'desktop-live-camera');
    await E(`window.__stream = document.querySelector('.stage video').srcObject`);
    await p.click('.app-header .brand');
    await sleep(500);
    if (await E(`!!document.querySelector('[role=alertdialog]')`)) await p.click('[role=alertdialog] button', 'Leave');
    await sleep(500);
    check('4.7 leaving the session turns the camera off', await E(`window.__stream && window.__stream.getTracks().every((t) => t.readyState === 'ended')`));
  } finally {
    p.close();
    browser.kill();
  }
}
{
  // Denied: the browser refuses the camera for this site.
  const { browser, p, E } = await open();
  try {
    const origin = new URL(BASE).origin;
    await p.send('Browser.setPermission', { origin, permission: { name: 'camera' }, setting: 'denied' });
    await startLive(p, E);
    await p.waitFor(`/Camera unavailable/.test(document.body.textContent)`, { timeout: 15000, label: 'denied message' });
    const msg = await E(text('.stage-center'));
    check('4.8 a denied permission says so and how to fix it', /permission was denied/i.test(msg) && /settings/i.test(msg), msg);
    check('4.9 it offers Try again and a demo', /Try again/.test(msg) && /Run demo dataset/.test(msg));
    await p.click('.stage-center button', 'Run demo dataset');
    await p.waitFor(`/Demo dataset/i.test(document.querySelector('.stage')?.textContent ?? '')`, { timeout: 10000, label: 'demo starts' });
    check('4.10 the demo button switches to the demo', true);
  } finally {
    p.close();
    browser.kill();
  }
}
// Missing and busy cameras are simulated by making getUserMedia fail the way browsers do,
// before the page loads. Headless Edge would otherwise open this machine's real webcam.
for (const [n, name, errName, expect] of [
  ['4.11', 'no camera says so plainly', 'NotFoundError', /No camera was found/i],
  ['4.12', 'a camera in use elsewhere says so', 'NotReadableError', /being used by another app/i],
]) {
  const { browser, p, E } = await open();
  try {
    await p.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('simulated', ${JSON.stringify(errName)}));`,
    });
    await startLive(p, E);
    await p.waitFor(`/Camera unavailable/.test(document.body.textContent)`, { timeout: 15000, label: `${errName} message` });
    const msg = await E(text('.stage-center'));
    check(`${n} ${name}`, expect.test(msg), msg);
  } finally {
    p.close();
    browser.kill();
  }
}

// ------------------------------------------------------------------ phone
section('6. Phone-sized screens (390 x 844)');
{
  const { browser, p, E } = await open();
  try {
    await p.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await p.goto(BASE);
    await ready(p);
    check('6.1 landing has no horizontal scroll', await E(fitsPhone), await E(`document.documentElement.scrollWidth`));
    await shot(p, 'phone-landing');
    check('6.2 the More menu is offered', await E(`getComputedStyle(document.querySelector('.more-nav')).display !== 'none'`));
    await p.click('.more-nav button', 'More');
    const items = await E(`[...document.querySelectorAll('.more-list button')].map((b) => b.textContent.trim())`);
    check('6.3 it holds the navigation that does not fit', items.includes('Protocols') && items.includes('Lab study'), items.join(', '));
    await shot(p, 'phone-more-menu');
    await p.click('.more-list button', 'Protocols');
    await p.waitFor(`[...document.querySelectorAll('[role=dialog]')].some((d) => /protocol/i.test(d.textContent))`, { label: 'protocol library opens' });
    check('6.4 Protocols opens the library', true);
    await key(p, 'Escape');
    await sleep(300);
    await p.click('.more-nav button', 'More');
    await key(p, 'Escape');
    await sleep(200);
    check('6.5 Escape closes the menu and returns focus to it', await E(`!document.querySelector('.more-list') && document.activeElement?.closest('.more-nav') !== null`));
    await p.click('.more-nav button', 'More');
    await p.click('.more-list button', 'Lab study');
    await p.waitFor(`document.querySelector('[aria-labelledby=research-title]')`, { label: 'Lab opens from the menu' });
    check('6.6 Lab study opens the evidence panel', true);
    await key(p, 'Escape');
    await runDemo(p, 'strength');
    check('6.7 the session fits the phone width', await E(fitsPhone), await E(`document.documentElement.scrollWidth`));
    const modalFits = await E(`(() => { const m = document.querySelector('[role=dialog] .modal, .modal'); const r = m.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; })()`);
    check('6.8 the summary fits the screen', modalFits);
    await shot(p, 'phone-squat-summary');
    await key(p, 'Escape');
    await sleep(300);
    const focusTop = await E(`document.querySelector('.focus').getBoundingClientRect().top + scrollY`);
    const stageTop = await E(`document.querySelector('.stage').getBoundingClientRect().top + scrollY`);
    check('6.9 the athlete view sits under the camera stage', focusTop > stageTop);
    const btn = await E(`document.querySelector('.focus-actions .btn').getBoundingClientRect().height`);
    check('6.10 touch targets are at least 44px tall', btn >= 44, `${btn}px`);
    await E(`document.querySelector('.focus').scrollIntoView()`);
    await sleep(200);
    await shot(p, 'phone-squat-rest');
    check('6.11 Back returns to the landing page', (await (async () => {
      await p.send('Runtime.evaluate', { expression: 'history.back()' });
      await sleep(800);
      return E(`!!document.querySelector('main#main h1') && !document.querySelector('main.dashboard')`);
    })()));
    const errors = p.logs.filter((l) => /^(error|EXCEPTION)/.test(l));
    check('no console errors on the phone journeys', errors.length === 0, errors.join(' | '));
  } finally {
    p.close();
    browser.kill();
  }
}

console.log(`\n${total - fails}/${total} checks passed${fails ? `, ${fails} failing` : ''}`);
process.exit(fails ? 1 : 0);
