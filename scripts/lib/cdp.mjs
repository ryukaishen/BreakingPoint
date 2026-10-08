// Minimal Chrome DevTools Protocol client for headless Edge/Chrome (Node 22+ has a global WebSocket).
// Dev tooling only: used by scripts/readability.mjs. No dependencies.
//
// Every browser it starts runs in a throwaway profile named bp-e2e-*, on a random port, and is
// killed by profile name, so a run can never attach to a stale instance and never touches a
// browser the user opened. Override the browser with BP_BROWSER=<path to msedge.exe or chrome.exe>.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const BROWSER = process.env.BP_BROWSER ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Stop every headless browser this tooling started (identified by its bp-e2e-* profile directory). */
export function killTestBrowsers(match = 'bp-e2e-') {
  const exe = basename(BROWSER);
  spawnSync(
    'powershell',
    ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='${exe}'" | Where-Object { $_.CommandLine -match '${match}' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
    { stdio: 'ignore' },
  );
}

export async function launch({ port = 9400 + Math.floor(Math.random() * 500), width = 1440, height = 900, extraArgs = [] } = {}) {
  killTestBrowsers(); // stale instances from earlier runs would otherwise answer on a reused port
  const userDataDir = mkdtempSync(join(tmpdir(), 'bp-e2e-'));
  const proc = spawn(
    BROWSER,
    ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, `--window-size=${width},${height}`, ...extraArgs, 'about:blank'],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  const kill = () => killTestBrowsers(basename(userDataDir));
  return { port, proc, kill, userDataDir };
}

export async function connect(port) {
  let targets = [];
  for (let i = 0; i < 40; i++) {
    targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    if (targets.some((t) => t.type === 'page')) break;
    await sleep(250);
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const handlers = new Map();
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (p) m.error ? p.reject(new Error(`${m.error.message}`)) : p.resolve(m.result);
    } else for (const h of handlers.get(m.method) ?? []) h(m.params);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, { resolve, reject });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const on = (method, fn) => handlers.set(method, [...(handlers.get(method) ?? []), fn]);

  await send('Page.enable');
  await send('Runtime.enable');

  const logs = [];
  on('Runtime.consoleAPICalled', (p) => {
    if (['error', 'warning'].includes(p.type)) logs.push(`${p.type}: ${p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`);
  });
  on('Runtime.exceptionThrown', (p) => logs.push(`EXCEPTION: ${(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text).slice(0, 400)}`));
  const dialogs = [];
  const policy = { accept: true };
  on('Page.javascriptDialogOpening', (p) => {
    dialogs.push({ type: p.type, message: p.message });
    send('Page.handleJavaScriptDialog', { accept: policy.accept }).catch(() => {});
  });

  const evaluate = async (expression, { awaitPromise = true } = {}) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`eval failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}\n  in: ${expression.slice(0, 160)}`);
    return r.result.value;
  };
  const waitFor = async (expression, { timeout = 8000, label = expression } = {}) => {
    const t0 = Date.now();
    for (;;) {
      try {
        if (await evaluate(`Boolean(${expression})`)) return true;
      } catch {
        /* page may be navigating */
      }
      if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for: ${label}`);
      await sleep(100);
    }
  };
  const goto = async (url) => {
    await send('Page.navigate', { url });
    await sleep(300);
  };
  const clickAt = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  /** Real, trusted click on the first visible element of `selector` whose text includes `text`. */
  const click = async (selector, text = '') => {
    const rect = await evaluate(`(() => {
      const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((e) => (e.textContent || '').trim().includes(${JSON.stringify(text)}));
      const el = els.find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);
    if (!rect) throw new Error(`no visible ${selector} containing "${text}"`);
    await clickAt(rect.x, rect.y);
    await sleep(120);
  };
  const type = async (text) => {
    for (const ch of text) await send('Input.dispatchKeyEvent', { type: 'char', text: ch });
  };
  const press = async (key, code = key, vk = 0, text) => {
    await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  };

  return { send, on, evaluate, waitFor, goto, click, clickAt, type, press, dialogs, logs, policy, close: () => ws.close() };
}
