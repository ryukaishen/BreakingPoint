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
  check('E2 after the refresh the athlete is offered the measured reps', new RegExp(`had ${draft.record.totalReps} reps? measured, ${draft.record.heldReps} at your usual form`).test(body), body.slice(0, 120));
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

  // ------------------------------------------------------------ G. audit regressions (findings 2, 3 and 6)
  console.log('\n-- G. A set is never lost to the next action, another tab, or a failed write');
  const sessionsOf = (aid) => E(`JSON.parse(localStorage.getItem('bp.v2.sessions.${aid}') || '[]')`);
  const draftOf = async (aid) => JSON.parse((await E(`localStorage.getItem('bp.v2.draft.${aid}')`)) ?? 'null');
  const reps = () => E(`window.__breakingpoint.engine.getSnapshot().monitorReps.length`);
  const toastText = () => E(`document.querySelector('.toast')?.textContent ?? ''`);
  const owner = await athleteId();

  /** Leave a live set through `leave` (a click that replaces the engine), confirm, and check the set was saved first. */
  async function endAndLeave(label, leave, arrived) {
    await startLive();
    await feed(`s.phase === 'monitoring' && s.monitorReps.length >= 4`, { start: true });
    const n = await reps();
    const before = (await sessionsOf(owner)).length;
    await leave();
    await p.waitFor(`document.querySelector('[role=alertdialog]')`);
    const title = await dialogTitle();
    await sleep(300);
    await p.click('[role=alertdialog] button', 'End set and leave');
    await p.waitFor(arrived, { label });
    await sleep(500);
    const list = await sessionsOf(owner);
    const last = list.at(-1);
    check(
      `${label}: asks first, then the set is saved with every rep before the next session starts, and its draft is cleared`,
      title === 'End this set and leave?' && list.length === before + 1 && last?.source === 'live' && last.reps.length === n && (await keys('bp.v2.draft.')).length === 0,
      `${title}; sessions ${before} -> ${list.length}; ${last?.reps.length} of ${n} reps`,
    );
  }
  await endAndLeave(
    'G1 the Demo switch',
    () => p.click('.workout-source button', 'Demo'),
    `document.querySelector('.workout-source button[aria-pressed=true]')?.textContent.trim() === 'Demo'`,
  );
  await endAndLeave(
    'G2 the camera panel’s Try again',
    () => p.click('.workout-center-message button', 'Try again'),
    `window.__breakingpoint?.engine.getSnapshot().phase === 'idle' && !document.querySelector('[role=alertdialog]')`,
  );
  await endAndLeave(
    'G3 the camera panel’s Run demo dataset',
    () => p.click('.workout-center-message button', 'Run demo dataset'),
    `document.querySelector('.workout-source button[aria-pressed=true]')?.textContent.trim() === 'Demo'`,
  );

  // Another tab switches its active athlete mid-set: this set keeps its athlete.
  await startLive();
  await feed(`s.phase === 'monitoring' && s.monitorReps.length >= 3`, { start: true });
  const other = await E(`(() => { const r = window.__breakingpoint.data.real; const o = r.createAthlete('Other Tab'); r.setActive(o.id); return o.id; })()`);
  await feed(`s.phase === 'monitoring' && s.monitorReps.length >= 6`);
  const nameMid = await E(`window.__breakingpoint.engine.getSnapshot().athlete`);
  const draftMid = await draftOf(owner);
  check(
    'G4 another tab switching athlete mid-set changes nothing here: same name, checkpoints still go to the set’s athlete',
    nameMid === 'E2E Tester' && draftMid?.record.athleteId === owner && draftMid.record.totalReps === (await reps()) && (await draftOf(other)) === null,
    `${nameMid}; draft for ${draftMid?.record.athleteId}`,
  );
  const ownBefore = (await sessionsOf(owner)).length;
  await E(`window.__breakingpoint.engine.endSet()`);
  await sleep(500);
  check(
    'G5 and the set is saved to the athlete it was started for, not the newly active one',
    (await sessionsOf(owner)).length === ownBefore + 1 && (await sessionsOf(other)).length === 0 && (await keys('bp.v2.draft.')).length === 0,
    `owner ${ownBefore} -> ${(await sessionsOf(owner)).length}, other ${(await sessionsOf(other)).length}`,
  );

  const menuName = await E(`document.querySelector('.athlete-trigger .athlete-name')?.textContent ?? ''`);
  await p.click('.athlete-trigger');
  await sleep(200);
  await p.click('.athlete-option', 'Rename');
  await sleep(300);
  const renameTitle = await E(`[...document.querySelectorAll('[role=dialog] h2, [role=alertdialog] h2')].map((h) => h.textContent).join(' ')`);
  await p.click('button', 'Cancel');
  await sleep(200);
  check(
    'G5b on the set’s screen the athlete menu names, and Rename changes, the set’s athlete',
    menuName === 'E2E Tester' && /Rename E2E Tester/.test(renameTitle),
    `${menuName}; ${renameTitle}`,
  );

  // Another tab deletes the set's athlete: nothing falls back to another profile.
  await E(`window.__breakingpoint.data.real.setActive(${JSON.stringify(other)})`);
  await startLive();
  await feed(`s.phase === 'monitoring' && s.monitorReps.length >= 3`, { start: true });
  await E(`(() => { const r = window.__breakingpoint.data.real; r.setActive(${JSON.stringify(owner)}); r.deleteAthlete(${JSON.stringify(other)}); localStorage.removeItem('bp.v2.draft.${other}'); })()`);
  await feed(`s.phase === 'monitoring' && s.monitorReps.length >= 5`);
  const ownCount = (await sessionsOf(owner)).length;
  await E(`window.__breakingpoint.engine.endSet()`);
  await sleep(400);
  const deletedToast = await toastText();
  check(
    'G6 a set whose athlete was deleted elsewhere is reported, and never saved to another athlete',
    /its athlete was deleted on this device/.test(deletedToast) && (await sessionsOf(owner)).length === ownCount && (await sessionsOf(other)).length === 0 && (await draftOf(other)) === null,
    deletedToast,
  );
  await E(`window.__breakingpoint.data.real.setActive(${JSON.stringify(owner)})`);

  // The history write fails: the set's draft survives and is offered again.
  await startLive();
  await feed(`s.phase === 'monitoring' && s.monitorReps.length >= 4`, { start: true });
  const failN = await reps();
  const failBefore = (await sessionsOf(owner)).length;
  await E(`(() => {
    const real = Storage.prototype.setItem;
    window.__realSetItem = real;
    Storage.prototype.setItem = function (k, v) {
      if (String(k).startsWith('bp.v2.sessions.')) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return real.call(this, k, v);
    };
  })()`);
  await E(`window.__breakingpoint.engine.endSet()`);
  await sleep(400);
  const failToast = await toastText();
  const keptDraft = await draftOf(owner);
  check(
    'G7 a failed history write says so and keeps the set’s draft with every rep',
    /could not be saved/.test(failToast) && /kept on this device/.test(failToast) && keptDraft?.kind === 'set' && keptDraft.ended === true && keptDraft.record.totalReps === failN && (await sessionsOf(owner)).length === failBefore,
    `${failToast}; draft ${keptDraft?.record?.totalReps} of ${failN}`,
  );
  await E(`(Storage.prototype.setItem = window.__realSetItem, true)`);
  await p.send('Page.reload').catch(() => {});
  await sleep(900);
  await waitReady();
  await p.waitFor(`document.querySelector('#recovery-title')`);
  const offered = await E(`document.querySelector('#recovery-body').textContent`);
  await p.click('#recovery-title ~ .confirm-actions button', 'Save set');
  await p.waitFor(`!document.querySelector('#recovery-title')`);
  const afterKeep = await sessionsOf(owner);
  const keptOnce = afterKeep.filter((x) => x.id === keptDraft.record.id);
  check(
    'G8 on the next visit it is offered again as a finished set, and saving it stores it once, as it finished',
    new RegExp(`finished on .* ${failN} reps? (?:was|were) measured`).test(offered) &&
      afterKeep.length === failBefore + 1 &&
      keptOnce.length === 1 &&
      !keptOnce[0].quality.reasons.includes('Interrupted before the set ended') &&
      (await keys('bp.v2.draft.')).length === 0,
    offered.slice(0, 100),
  );

  // ------------------------------------------------------------ H. audit round 2
  console.log('\n-- H. Unsaved sets, one identity per set, and the End set dialog');
  const failHistoryWrites = () =>
    E(`(() => {
      window.__realSetItem ??= Storage.prototype.setItem;
      const real = window.__realSetItem;
      Storage.prototype.setItem = function (k, v) {
        if (String(k).startsWith('bp.v2.sessions.')) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        return real.call(this, k, v);
      };
      return true;
    })()`);
  const restoreHistoryWrites = () => E(`(window.__realSetItem && (Storage.prototype.setItem = window.__realSetItem), true)`);
  const dialogOpen = () => E(`!!document.querySelector('#recovery-title')`);
  const dialogBody = () => E(`document.querySelector('#recovery-body')?.textContent ?? ''`);
  const interrupted = (x) => x.quality.reasons.includes('Interrupted before the set ended');

  // The End set dialog stays open while two more reps are recorded: confirming saves the set as it is now.
  await startLive();
  await feed(`s.phase === 'monitoring'`, { start: true });
  const atOpen = await reps();
  const h1Before = (await sessionsOf(owner)).length;
  await p.click('.workout-source button', 'Demo');
  await p.waitFor(`document.querySelector('[role=alertdialog]')`);
  await feed(`s.monitorReps.length >= 2`);
  const atConfirm = await reps();
  await sleep(300);
  await p.click('[role=alertdialog] button', 'End set and leave');
  await p.waitFor(`document.querySelector('.workout-source button[aria-pressed=true]')?.textContent.trim() === 'Demo'`);
  await sleep(500);
  const h1 = await sessionsOf(owner);
  check(
    'H1 reps recorded while End set was being confirmed are ended and saved, not dropped',
    atOpen === 0 && atConfirm >= 2 && h1.length === h1Before + 1 && h1.at(-1).reps.length === atConfirm && (await keys('bp.v2.draft.')).length === 0,
    `${atOpen} reps when asked, ${atConfirm} when confirmed; sessions ${h1Before} -> ${h1.length}, saved ${h1.at(-1)?.reps.length}`,
  );

  // A save that fails as the set is left: the draft survives the engine being replaced, and the athlete
  // cannot start another live set until it is saved or discarded.
  await startLive();
  await feed(`s.phase === 'monitoring' && s.monitorReps.length >= 3`, { start: true });
  const h2N = await reps();
  const h2Before = (await sessionsOf(owner)).length;
  await failHistoryWrites();
  await p.click('.workout-source button', 'Demo');
  await p.waitFor(`document.querySelector('[role=alertdialog]')`);
  await sleep(300);
  await p.click('[role=alertdialog] button', 'End set and leave');
  await p.waitFor(`document.querySelector('.workout-source button[aria-pressed=true]')?.textContent.trim() === 'Demo'`);
  await sleep(500);
  const h2Toast = await toastText();
  const h2Draft = await draftOf(owner);
  await restoreHistoryWrites();
  check(
    'H2 a set whose save fails as it is left keeps its whole draft after the session is replaced',
    h2Draft?.kind === 'set' && h2Draft.ended === true && h2Draft.record.totalReps === h2N && (await sessionsOf(owner)).length === h2Before && /kept on this device/.test(h2Toast),
    `${h2Toast}; draft ${h2Draft?.record?.totalReps} of ${h2N}, ended ${h2Draft?.ended}`,
  );
  await p.click('button.workout-exit');
  await p.waitFor(`document.querySelector('main.landing h1')`);
  await p.click('button', 'Start live camera');
  await p.waitFor(`document.querySelector('#recovery-title')`);
  const h3Body = await dialogBody();
  check(
    'H3 starting another live set for that athlete is refused, and the dialog says why',
    /finished on .*but browser storage was full or unavailable/.test(h3Body) && /Another set for E2E Tester can start once it is saved or discarded/.test(h3Body) && !(await E(`!!document.querySelector('main#main.dashboard')`)),
    h3Body.slice(0, 160),
  );
  await p.click('#recovery-title ~ .confirm-actions button', 'Save set');
  await p.waitFor(`!document.querySelector('#recovery-title')`);
  const h4 = await sessionsOf(owner);
  const h4Same = h4.filter((x) => x.id === h2Draft.record.id);
  check(
    'H4 saving it stores it once, as it finished (not marked interrupted), and clears its draft',
    h4.length === h2Before + 1 && h4Same.length === 1 && !interrupted(h4Same[0]) && h4Same[0].reps.length === h2N && (await keys('bp.v2.draft.')).length === 0,
    `sessions ${h2Before} -> ${h4.length}`,
  );
  await p.click('button', 'Start live camera');
  await p.waitFor(`document.querySelector('main#main.dashboard') && window.__breakingpoint?.engine`);
  check('H5 then a new live set can start', !(await dialogOpen()));

  // In the session: New set is refused while the set waits; Not now keeps it waiting; another athlete is unaffected.
  await startLive();
  await feed(`s.phase === 'monitoring' && s.monitorReps.length >= 4`, { start: true });
  const h6N = await reps();
  const h6Before = (await sessionsOf(owner)).length;
  await failHistoryWrites();
  await E(`window.__breakingpoint.engine.endSet()`);
  await sleep(500);
  await p.click('button', 'New set');
  await p.waitFor(`document.querySelector('#recovery-title')`);
  check(
    'H6 New set for the same athlete is refused while its last set waits, and the dialog says why',
    (await phase()) === 'summary' && /Another set for E2E Tester can start/.test(await dialogBody()),
    await phase(),
  );
  await p.click('#recovery-title ~ .confirm-actions button', 'Save set');
  await sleep(400);
  check(
    'H7 a save that fails again keeps asking, and keeps the draft',
    (await dialogOpen()) && /could not be saved/.test(await toastText()) && (await draftOf(owner))?.ended === true && (await sessionsOf(owner)).length === h6Before,
  );
  await p.click('#recovery-title ~ .confirm-actions button', 'Not now');
  await sleep(300);
  check('H8 Not now closes it without starting anything; the set still waits', !(await dialogOpen()) && (await phase()) === 'summary' && (await draftOf(owner))?.record.totalReps === h6N);
  await restoreHistoryWrites();

  await E(`history.back()`); // the summary covers the workout header: leave it the way the browser does
  await p.waitFor(`document.querySelector('main.landing h1')`);
  const second = await E(`(() => { const d = window.__breakingpoint.data; const id = d.real.createAthlete('Second Athlete').id; d.refresh(); return id; })()`);
  await p.click('.athlete-trigger');
  await sleep(200);
  await p.click('.athlete-option', 'Second Athlete');
  await sleep(300);
  await p.click('button', 'Start live camera');
  await p.waitFor(`document.querySelector('main#main.dashboard') && window.__breakingpoint?.engine`);
  await p.click('button', 'Start calibration');
  await p.waitFor(`window.__breakingpoint.engine.getSnapshot().phase === 'calibrating'`);
  await feed(`s.phase === 'monitoring' && s.monitorReps.length >= 3`, { start: true });
  const secondDraft = await draftOf(second);
  const firstDraft = await draftOf(owner);
  check(
    'H9 another athlete can train meanwhile, and that set is checkpointed under its own athlete',
    !(await dialogOpen()) && secondDraft?.record.athleteId === second && secondDraft.record.totalReps === (await reps()) && firstDraft?.ended === true && firstDraft.record.totalReps === h6N,
    `second ${secondDraft?.record?.totalReps}, first ${firstDraft?.record?.totalReps}`,
  );
  await E(`window.__breakingpoint.engine.endSet()`);
  await sleep(500);
  check('H10 that set saves normally and clears only its own draft', (await sessionsOf(second)).length === 1 && (await draftOf(second)) === null && (await draftOf(owner))?.ended === true);
  await E(`history.back()`);
  await p.waitFor(`document.querySelector('main.landing h1')`);
  await p.click('.athlete-trigger');
  await sleep(200);
  await p.click('.athlete-option', 'E2E Tester');
  await sleep(300);
  await p.click('button', 'Start live camera');
  await p.waitFor(`document.querySelector('#recovery-title')`);
  await p.click('#recovery-title ~ .confirm-actions button', 'Discard set');
  await p.waitFor(`!document.querySelector('#recovery-title')`);
  check('H11 discarding it stores nothing and clears the draft', (await sessionsOf(owner)).length === h6Before && (await keys('bp.v2.draft.')).length === 0);

  // The history write fails, storage recovers, the recovery check completes and saves: one set, no leftover draft.
  await startLive();
  await feed(`s.phase === 'monitoring' && s.monitorReps.length >= 3`, { start: true });
  const h12Before = (await sessionsOf(owner)).length;
  await failHistoryWrites();
  await E(`window.__demo.runToEnd(false)`);
  await sleep(500);
  const h12Draft = await draftOf(owner);
  await restoreHistoryWrites();
  const stage = await E(`(() => { const d = window.__demo; d.startRecovery(); let n = 0; while (d.stage !== 'recoveryDone' && n++ < 200000) d.advance(1); return d.stage; })()`);
  await sleep(600);
  const h12 = await sessionsOf(owner);
  const h12Same = h12.filter((x) => x.id === h12Draft?.record.id);
  check(
    'H12 when the recovery check saves the set, the set’s held draft is cleared',
    h12Draft?.ended === true && stage === 'recoveryDone' && h12Same.length === 1 && !!h12Same[0].recovery && h12.length === h12Before + 1 && (await keys('bp.v2.draft.')).length === 0,
    `stage ${stage}; sessions ${h12Before} -> ${h12.length}; drafts ${(await keys('bp.v2.draft.')).length}`,
  );
  await p.send('Page.reload').catch(() => {});
  await sleep(900);
  await waitReady();
  await sleep(400);
  const h13 = await sessionsOf(owner);
  check(
    'H13 after a reload nothing is offered again, no draft remains and the set is stored exactly once',
    !(await dialogOpen()) && (await keys('bp.v2.draft.')).length === 0 && h13.length === h12Before + 1 && h13.filter((x) => x.id === h12Draft?.record.id).length === 1,
    `sessions ${h13.length}`,
  );

  // Discarding the unsaved set while still on its summary: its recovery check must not store it after all.
  await startLive();
  await feed(`s.phase === 'monitoring' && s.monitorReps.length >= 3`, { start: true });
  const h14Before = (await sessionsOf(owner)).length;
  await failHistoryWrites();
  await E(`window.__demo.runToEnd(false)`);
  await sleep(500);
  await restoreHistoryWrites();
  // After an alert the post-workout panel opens on Recovery; New set is on the summary.
  if (await E(`[...document.querySelectorAll('button')].some((x) => x.offsetParent && x.textContent.includes('Session summary'))`)) await p.click('button', 'Session summary');
  await sleep(300);
  await p.click('button', 'New set');
  await p.waitFor(`document.querySelector('#recovery-title')`);
  await p.click('#recovery-title ~ .confirm-actions button', 'Discard set');
  await p.waitFor(`!document.querySelector('#recovery-title')`);
  const h14Stage = await E(`(() => { const d = window.__demo; d.startRecovery(); let n = 0; while (d.stage !== 'recoveryDone' && n++ < 200000) d.advance(1); return d.stage; })()`);
  await sleep(600);
  check(
    'H14 a set discarded on its summary stays discarded when its recovery check finishes',
    h14Stage === 'recoveryDone' && (await sessionsOf(owner)).length === h14Before && (await keys('bp.v2.draft.')).length === 0,
    `stage ${h14Stage}; sessions ${h14Before} -> ${(await sessionsOf(owner)).length}`,
  );

  // Both the history and the draft writes fail: the finished set is held in memory, so New set cannot drop it.
  await startLive();
  await E(`(() => {
    window.__realSetItem ??= Storage.prototype.setItem;
    const real = window.__realSetItem;
    Storage.prototype.setItem = function (k, v) {
      const key = String(k);
      if (key.startsWith('bp.v2.sessions.') || key.startsWith('bp.v2.draft.')) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return real.call(this, k, v);
    };
    return true;
  })()`);
  await feed(`s.phase === 'monitoring' && s.monitorReps.length >= 3`, { start: true });
  const h15N = await reps();
  const h15Before = (await sessionsOf(owner)).length;
  await E(`window.__breakingpoint.engine.endSet()`);
  await sleep(500);
  const h15Toast = await toastText();
  const h15NoDraft = (await draftOf(owner)) === null;
  await restoreHistoryWrites();
  if (await E(`[...document.querySelectorAll('button')].some((x) => x.offsetParent && x.textContent.includes('Session summary'))`)) await p.click('button', 'Session summary');
  await sleep(300);
  await p.click('button', 'New set');
  await p.waitFor(`document.querySelector('#recovery-title')`);
  const h15Body = await dialogBody();
  check(
    'H15 both writes failed: New set is refused, and the dialog offers the set held in memory and says it lasts only until the page closes',
    h15NoDraft && h15N >= 3 && (await phase()) === 'summary' && /held only until this page closes or reloads/.test(h15Toast) && /could not keep a copy either/.test(h15Body),
    `${h15Toast} | ${h15Body.slice(-110)}`,
  );
  await p.click('#recovery-title ~ .confirm-actions button', 'Save set');
  await p.waitFor(`!document.querySelector('#recovery-title')`);
  const h16 = await sessionsOf(owner);
  check(
    'H16 with storage back, saving it stores the whole set once, as it finished',
    h16.length === h15Before + 1 && h16.at(-1).reps.length === h15N && !interrupted(h16.at(-1)) && (await keys('bp.v2.draft.')).length === 0,
    `sessions ${h15Before} -> ${h16.length}, reps ${h16.at(-1)?.reps.length} of ${h15N}`,
  );
  await p.click('button', 'New set');
  await sleep(400);
  check('H17 then New set starts', (await phase()) === 'monitoring' && !(await dialogOpen()));
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
