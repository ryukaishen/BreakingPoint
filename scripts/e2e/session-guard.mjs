// End-to-end check of session protection, recovery, landmarks and announcements, in a real browser.
//
//   npm run dev -- --port 5174          (in one terminal)
//   BASE=http://127.0.0.1:5174/ node scripts/e2e/session-guard.mjs
//
// It runs in a throwaway browser profile, so nothing of the user's data is touched. A live set is
// driven by feeding the real SessionEngine synthetic frames through the app's dev hook
// (window.__breakingpoint, present only under `npm run dev`); no camera is involved, which also
// means live camera behaviour itself is NOT covered. Exit status 1 when any check fails.
import { connect, launch, sleep } from '../lib/cdp.mjs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5173/';
let fails = 0;
let total = 0;
const check = (name, ok, detail = '') => {
  total++;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `   [${detail}]` : ''}`);
};

const browser = await launch();
const p = await connect(browser.port);

const E = (js) => p.evaluate(js);
const phase = () => E(`window.__breakingpoint.engine.getSnapshot().phase`);
const keys = (prefix) => E(`Object.keys(localStorage).filter((k) => k.startsWith(${JSON.stringify(prefix)}))`);
const athleteId = () => E(`JSON.parse(localStorage.getItem('bp.v2.athletes') || '[]')[0]?.id ?? null`);
const dialogTitle = () => E(`document.querySelector('[role=alertdialog] h2')?.textContent ?? null`);
const view = () => E(`history.state?.bp?.view ?? null`);

async function waitReady() {
  await p.waitFor(`document.readyState === 'complete' && document.querySelector('.app')`);
  await sleep(250);
}

/** Open a live session for the strength protocol and start calibrating. Creates the athlete on first use. */
async function startLive({ calibrate = true } = {}) {
  await p.goto(BASE + '?sport=strength');
  await waitReady();
  await p.waitFor(`document.querySelector('main.landing h1')`);
  await p.click('button', 'Start live camera');
  await sleep(300);
  if (await E(`!!document.querySelector('#athlete-dialog-title')`)) {
    await p.click('.field-input');
    await p.type('E2E Tester');
    await p.click('form[role=dialog] button', 'Add athlete');
  }
  await p.waitFor(`document.querySelector('main#main.dashboard') && window.__breakingpoint?.engine`);
  if (calibrate) {
    await p.click('button', 'Start calibration');
    await p.waitFor(`window.__breakingpoint.engine.getSnapshot().phase === 'calibrating'`);
  }
}

/** Feed synthetic frames into the live engine until `pred` (a JS expression over `s`, the snapshot) holds. */
async function feed(pred, { start = false } = {}) {
  if (start) {
    await E(`(async () => {
      const { DemoController } = await import('/src/demo/demoController.ts');
      const eng = window.__breakingpoint.engine;
      window.__demo = new DemoController(eng, eng.getSnapshot().exercise);
      window.__demo.start();
    })()`);
  }
  const r = await E(`(() => {
    const d = window.__demo, e = window.__breakingpoint.engine; let n = 0;
    const done = () => { const s = e.getSnapshot(); return ${pred}; };
    while (n < 60000 && !done()) { d.advance(3); n += 3; }
    const s = e.getSnapshot();
    return { frames: n, phase: s.phase, cal: s.calibrationReps.length, reps: s.monitorReps.length, alarm: s.alarmRep };
  })()`);
  await sleep(350); // let React run its effects (checkpoint)
  return r;
}

async function run() {
  // ------------------------------------------------------------ A. landmarks and skip link (landing)
  console.log('\n-- A. Landmarks, headings, skip link');
  await p.goto(BASE);
  await waitReady();
  await p.waitFor(`document.querySelector('main#main h1')`);
  check('A1 exactly one <main> landmark, and it is the skip target', (await E(`document.querySelectorAll('main').length`)) === 1 && (await E(`document.querySelector('main').id`)) === 'main');
  check('A2 landing has one h1, inside main', (await E(`document.querySelectorAll('h1').length`)) === 1 && (await E(`!!document.querySelector('main h1')`)));
  check('A3 the footer stays outside main (keeps its landmark)', await E(`(() => { const f = document.querySelector('footer'); return !!f && !document.querySelector('main').contains(f); })()`));
  check('A4 document has a banner (header)', await E(`!!document.querySelector('header')`));
  const topBefore = await E(`document.querySelector('.skip-link').getBoundingClientRect().top`);
  await p.press('Tab', 'Tab', 9);
  const firstFocus = await E(`document.activeElement.className`);
  const topAfter = await E(`document.querySelector('.skip-link').getBoundingClientRect().top`);
  check('A5 the skip link is the first tab stop', String(firstFocus).includes('skip-link'), firstFocus);
  check('A6 it is off-screen until focused, then visible', topBefore < 0 && topAfter >= 0, `top ${topBefore} -> ${topAfter}`);
  const len0 = await E(`history.length`);
  await p.press('Enter', 'Enter', 13, '\r');
  await sleep(200);
  check('A7 activating it focuses <main> without touching the URL or history', (await E(`document.activeElement.id`)) === 'main' && (await E(`location.hash`)) === '' && (await E(`history.length`)) === len0);
  check('A8 the first history entry is the landing view', (await view()) === 'landing');

  // ------------------------------------------------------------ B. demo session: history, title, headings
  console.log('\n-- B. Demo session and browser history');
  const h0 = await E(`history.length`);
  await p.click('button', 'Run the soccer demo');
  await p.waitFor(`document.querySelector('main#main.dashboard') && window.__breakingpoint?.engine`);
  check('B1 session view: one main with a visually hidden h1 naming it', (await E(`document.querySelectorAll('main').length`)) === 1 && /Soccer.*demo session/.test(await E(`document.querySelector('main#main h1')?.textContent ?? ''`)));
  check('B2 the tab title names the session', /Soccer/.test(await E(`document.title`)), await E(`document.title`));
  check('B3 entering the session added one history entry', (await view()) === 'session' && (await E(`history.length`)) === h0 + 1);
  const liveRegions = await E(`[...document.querySelectorAll('[aria-live],[role=status],[role=alert]')].map((e) => (e.getAttribute('role') || '-') + '/' + (e.getAttribute('aria-live') || '-'))`);
  check('B4 only the announcer owns live regions in the session', liveRegions.length === 2 && liveRegions.includes('status/polite') && liveRegions.includes('alert/-'), liveRegions.join(' '));
  await E(`history.back()`);
  await p.waitFor(`document.querySelector('main#main .hero')`);
  check('B5 Back from a demo session returns to landing with no prompt', !(await E(`!!document.querySelector('[role=alertdialog]')`)));
  check('B6 the title is restored', (await E(`document.title`)) === 'BreakingPoint');
  await E(`history.forward()`);
  await sleep(500);
  check('B7 Forward onto the ended session does not bring it back', !(await E(`!!document.querySelector('.dashboard')`)) && (await view()) === 'landing');

  // ------------------------------------------------------------ C. announcer across a whole demo run
  console.log('\n-- C. Announcements during a full demo run');
  await p.click('button', 'Run the soccer demo');
  await p.waitFor(`document.querySelector('main#main.dashboard') && window.__breakingpoint?.engine`);
  await E(`(() => {
    window.__polite = []; window.__alerts = [];
    const watch = (el, sink) => new MutationObserver(() => { const t = el.textContent.trim(); if (t && sink[sink.length - 1] !== t) sink.push(t); }).observe(el, { childList: true, characterData: true, subtree: true });
    watch(document.querySelector('[role=status][aria-live=polite]'), window.__polite);
    watch(document.querySelector('[role=alert]'), window.__alerts);
    window.__breakingpoint.runner.speed = 4;
  })()`);
  await p.waitFor(`window.__breakingpoint.engine.getSnapshot().phase === 'summary'`, { timeout: 120000, label: 'demo reaches summary' });
  await sleep(500);
  const polite = await E(`window.__polite`);
  const alerts = await E(`window.__alerts`);
  const monReps = await E(`window.__breakingpoint.engine.getSnapshot().monitorReps.length`);
  console.log('   polite:', JSON.stringify(polite));
  console.log('   alerts:', JSON.stringify(alerts));
  check('C1 progress is announced politely a handful of times, never once per rep', polite.length >= 3 && polite.length <= 8 && polite.length < monReps, `${polite.length} messages for ${monReps} reps`);
  check('C2 the first form change is announced', polite.some((m) => /form is starting to change/i.test(m)));
  check('C3 the stop instruction is a single assertive alert naming the rep', alerts.length === 1 && /^Stop\. The alert triggered at rep \d+\. End the set and rest\.$/.test(alerts[0]), alerts[0]);
  check('C4 the set summary is announced', polite.some((m) => /^Set ended/.test(m)));
  check('C5 demo sessions write no recovery drafts', (await keys('bp.v2.draft.')).length === 0);

  // ------------------------------------------------------------ D. live protection
  console.log('\n-- D. Protecting a live session (Back, cancel, confirm, refresh, close)');
  await startLive();
  const aid = await athleteId();
  check('D1 a live athlete exists and the session is calibrating', !!aid && (await phase()) === 'calibrating');
  await E(`history.back()`);
  await p.waitFor(`document.querySelector('[role=alertdialog]')`);
  await sleep(500);
  check('D2 Back is intercepted: the athlete is asked first', (await dialogTitle()) === 'Leave calibration?', await dialogTitle());
  check('D3 and they stay in the session meanwhile', (await E(`!!document.querySelector('main.dashboard')`)) && (await view()) === 'session');
  await p.click('[role=alertdialog] button', 'Cancel');
  await sleep(300);
  check('D4 Cancel keeps the calibration running', !(await E(`!!document.querySelector('[role=alertdialog]')`)) && (await phase()) === 'calibrating');
  await E(`history.back()`);
  await p.waitFor(`document.querySelector('[role=alertdialog]')`);
  await sleep(300);
  await p.click('[role=alertdialog] button', 'Leave');
  await p.waitFor(`document.querySelector('main.landing h1')`);
  check('D5 confirming leaves for the previous view (the sport page)', (await view()) === 'sport' && /Strength/.test(await E(`document.title`)));

  await p.click('button', 'Start live camera');
  await p.waitFor(`document.querySelector('main#main.dashboard') && window.__breakingpoint?.engine`);
  await p.click('button', 'Start calibration');
  await p.waitFor(`window.__breakingpoint.engine.getSnapshot().phase === 'calibrating'`);
  await E(`window.__marker = 'same-page'`);
  p.policy.accept = false; // dismiss the browser's leave prompt
  const dlgClose = p.dialogs.length;
  await p.send('Page.close').catch(() => {});
  await sleep(900);
  check('D5b closing the tab mid-calibration asks the browser to confirm, and staying keeps the page alive', p.dialogs.length > dlgClose && p.dialogs.at(-1).type === 'beforeunload' && (await E('1 + 1')) === 2, JSON.stringify(p.dialogs.at(-1)));
  const dlg0 = p.dialogs.length;
  await p.send('Page.reload').catch(() => {});
  await sleep(900);
  check('D6 refreshing mid-calibration asks the browser to confirm', p.dialogs.length > dlg0 && p.dialogs.at(-1).type === 'beforeunload', JSON.stringify(p.dialogs.at(-1)));
  check('D7 staying keeps the page and the calibration', (await E(`window.__marker`)) === 'same-page' && (await phase()) === 'calibrating');
  p.policy.accept = true;
  await p.send('Page.reload').catch(() => {});
  await p.waitFor(`window.__marker === undefined && document.readyState === 'complete' && document.querySelector('.app')`, { timeout: 15000, label: 'page reloaded' });
  await sleep(300);
  const afterView = await view();
  check('D8 leaving anyway reloads the page, and the ended session is not resurrected', (await E(`window.__marker`)) === undefined && ['landing', 'sport'].includes(afterView) && !(await E(`!!document.querySelector('.dashboard')`)), `now on: ${afterView} (the URL still names the sport)`);
  const dlg1 = p.dialogs.length;
  await p.send('Page.reload').catch(() => {});
  await sleep(900);
  await waitReady();
  check('D9 with nothing at risk, refresh is not interrupted', p.dialogs.length === dlg1);

  // ------------------------------------------------------------ E. recovery
  console.log('\n-- E. Recovering an interrupted set');
  await startLive();
  await feed(`s.phase === 'monitoring' && s.monitorReps.length >= 5`, { start: true });
  const r1 = await E(`(() => { const s = window.__breakingpoint.engine.getSnapshot(); return { phase: s.phase, reps: s.monitorReps.length }; })()`);
  const draftRaw = await E(`localStorage.getItem('bp.v2.draft.' + JSON.parse(localStorage.getItem('bp.v2.athletes'))[0].id)`);
  const draft = draftRaw ? JSON.parse(draftRaw) : null;
  check('E1 a live set is checkpointed as reps are measured', r1.phase === 'monitoring' && draft?.kind === 'set' && draft.record.totalReps === r1.reps && draft.record.source === 'live', `${r1.reps} reps, draft ${draft?.record?.totalReps}`);
  p.policy.accept = true;
  await p.send('Page.reload').catch(() => {});
  await sleep(900);
  await waitReady();
  await p.waitFor(`document.querySelector('#recovery-title')`);
  const body = await E(`document.querySelector('#recovery-body').textContent`);
  check('E2 after the refresh the athlete is offered the measured reps', new RegExp(`${draft.record.totalReps} reps? had been measured, ${draft.record.heldReps} at your usual form`).test(body), body.slice(0, 120));
  check('E3 the choice is explicit: Escape and click-away do nothing', await (async () => {
    await p.press('Escape', 'Escape', 27);
    await p.clickAt?.(5, 5);
    await sleep(250);
    return E(`!!document.querySelector('#recovery-title')`);
  })());
  await p.click('#recovery-title ~ .confirm-actions button', 'Keep interrupted set');
  await p.waitFor(`!document.querySelector('#recovery-title')`);
  const saved = await E(`(() => { const id = JSON.parse(localStorage.getItem('bp.v2.athletes'))[0].id; return JSON.parse(localStorage.getItem('bp.v2.sessions.' + id) || '[]'); })()`);
  const kept = saved.find((s) => s.id === draft.record.id);
  check('E4 keeping it stores the set, marked not eligible for records', !!kept && kept.quality.eligible === false && kept.quality.reasons.includes('Interrupted before the set ended'), JSON.stringify(kept?.quality));
  check('E5 the stored set holds exactly the measured reps', kept?.reps.length === draft.record.totalReps && kept.source === 'live');
  check('E6 the draft is gone afterwards', (await keys('bp.v2.draft.')).length === 0);

  // Discard
  await startLive();
  await feed(`s.phase === 'monitoring' && s.monitorReps.length >= 3`, { start: true });
  const before = (await E(`JSON.parse(localStorage.getItem('bp.v2.sessions.' + JSON.parse(localStorage.getItem('bp.v2.athletes'))[0].id) || '[]').length`));
  await p.send('Page.reload').catch(() => {});
  await sleep(900);
  await waitReady();
  await p.waitFor(`document.querySelector('#recovery-title')`);
  await p.click('#recovery-title ~ .confirm-actions button', 'Discard set');
  await p.waitFor(`!document.querySelector('#recovery-title')`);
  const after = (await E(`JSON.parse(localStorage.getItem('bp.v2.sessions.' + JSON.parse(localStorage.getItem('bp.v2.athletes'))[0].id) || '[]').length`));
  check('E7 discarding saves nothing and clears the draft', after === before && (await keys('bp.v2.draft.')).length === 0, `${before} -> ${after}`);

  // Normal end clears the draft
  await startLive();
  await feed(`s.phase === 'monitoring' && s.monitorReps.length >= 3`, { start: true });
  const dMid = (await keys('bp.v2.draft.')).length;
  await E(`window.__demo.runToEnd(false)`);
  await sleep(600);
  const finished = await E(`(() => { const id = JSON.parse(localStorage.getItem('bp.v2.athletes'))[0].id; const l = JSON.parse(localStorage.getItem('bp.v2.sessions.' + id) || '[]'); return { n: l.length, last: l.at(-1) }; })()`);
  check('E8 a set that ends normally is saved as a normal set and leaves no draft behind', dMid === 1 && (await keys('bp.v2.draft.')).length === 0 && finished.last && !finished.last.quality.reasons.includes('Interrupted before the set ended'), `draft mid-set ${dMid}, sessions ${finished.n}`);

  // Calibration interrupted
  await startLive();
  const cal = await feed(`s.phase === 'calibrating' && s.calibrationReps.length >= 2`, { start: true });
  const calDraft = JSON.parse((await E(`localStorage.getItem('bp.v2.draft.' + JSON.parse(localStorage.getItem('bp.v2.athletes'))[0].id)`)) ?? 'null');
  check('E9 an unfinished calibration is noted, not restored', calDraft?.kind === 'calibration' && calDraft.reps === cal.cal, JSON.stringify(calDraft));
  await p.send('Page.reload').catch(() => {});
  await sleep(900);
  await waitReady();
  await p.waitFor(`document.querySelector('.toast')`);
  check('E10 the athlete is told, once, that nothing was saved', /calibration was interrupted/.test(await E(`document.querySelector('.toast').textContent`)) && (await keys('bp.v2.draft.')).length === 0 && !(await E(`!!document.querySelector('#recovery-title')`)));

  // Leaving on purpose during monitoring keeps the existing "end the set and save it" behaviour
  await startLive();
  await feed(`s.phase === 'monitoring' && s.monitorReps.length >= 4`, { start: true });
  const nBefore = await E(`JSON.parse(localStorage.getItem('bp.v2.sessions.' + JSON.parse(localStorage.getItem('bp.v2.athletes'))[0].id) || '[]').length`);
  await E(`history.back()`);
  await p.waitFor(`document.querySelector('[role=alertdialog]')`);
  const t = await dialogTitle();
  await sleep(300);
  await p.click('[role=alertdialog] button', 'End set and leave');
  await p.waitFor(`document.querySelector('main.landing h1')`);
  await sleep(400);
  const nAfter = await E(`JSON.parse(localStorage.getItem('bp.v2.sessions.' + JSON.parse(localStorage.getItem('bp.v2.athletes'))[0].id) || '[]').length`);
  check('E11 Back during a set asks, and confirming ends and saves the set exactly as before', t === 'End this set and leave?' && nAfter === nBefore + 1 && (await keys('bp.v2.draft.')).length === 0, `${t}; sessions ${nBefore} -> ${nAfter}`);

  // Hostile storage
  console.log('\n-- F. Corrupt or tampered drafts');
  const id = await athleteId();
  await E(`localStorage.setItem('bp.v2.draft.${id}', '{ this is not json')`);
  await p.goto(BASE);
  await waitReady();
  check('F1 a corrupt draft is dropped quietly', !(await E(`!!document.querySelector('#recovery-title')`)) && (await keys('bp.v2.draft.')).length === 0);
  const tampered = JSON.stringify({ v: 1, kind: 'set', savedAt: new Date().toISOString(), record: { schemaVersion: 2, source: 'demo', id: 'x', athleteId: id } });
  await E(`localStorage.setItem('bp.v2.draft.${id}', ${JSON.stringify(tampered)})`);
  await p.goto(BASE);
  await waitReady();
  check('F2 a draft claiming demo data is refused and removed', !(await E(`!!document.querySelector('#recovery-title')`)) && (await keys('bp.v2.draft.')).length === 0);
  await E(`localStorage.setItem('bp.v2.draft.ghost_athlete', ${JSON.stringify(JSON.stringify({ v: 1, kind: 'calibration', savedAt: new Date().toISOString(), athleteId: 'ghost_athlete', protocolId: 'squat-bodyweight', reps: 2 }))})`);
  await p.goto(BASE);
  await waitReady();
  check('F3 a draft for an athlete that does not exist is dropped', (await keys('bp.v2.draft.')).length === 0 && !(await E(`!!document.querySelector('#recovery-title')`)));
}

try {
  await run();
} catch (e) {
  fails++;
  console.log(`\nABORTED: ${e.message}`);
} finally {
  console.log(`\n${total - fails}/${total} checks passed${fails ? `, ${fails} failing` : ''}`);
  p.close();
  browser.kill();
  process.exit(fails ? 1 : 0);
}
