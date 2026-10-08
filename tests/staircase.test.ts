// The record staircase: the record rules, that every session stays readable, and
// that the rendered chart does not depend on colour.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecordStaircase } from '../src/components/progress/RecordStaircase';
import { buildStaircase, niceAxis, statusLabel } from '../src/data/staircase';
import type { SessionRecord } from '../src/data/types';

let n = 0;
function set(held: number, over: Partial<SessionRecord> = {}): SessionRecord {
  n++;
  return {
    schemaVersion: 2,
    id: `set_${n}`,
    athleteId: 'ath_1',
    source: 'live',
    sportId: 'strength',
    protocolId: 'squat-bodyweight',
    exercise: 'squat',
    detectorConfigId: 'cfg-1',
    startedAt: new Date(Date.UTC(2026, 8, 1 + n, 12)).toISOString(),
    endedAt: new Date(Date.UTC(2026, 8, 1 + n, 12, 10)).toISOString(),
    baselineSavedAt: '2026-09-01T10:00:00.000Z',
    calibration: { nReps: 6, referenceSource: 'loo', mu0: 0.6, sigma0: 0.25, excludedFeatures: 0, totalFeatures: 4, ok: true, reasons: [] },
    reps: [],
    totalReps: held + 3,
    scoredReps: held + 3,
    heldReps: held,
    onsetRep: held + 1,
    breakpointRep: held + 3,
    avgPre: 0.5,
    avgPost: 1.5,
    topChanges: [],
    patternId: null,
    recovery: null,
    quality: { scoredFraction: 1, meanCapture: 0.9, calibrationOk: true, eligible: true, reasons: [] },
    ...over,
  };
}
const poor = { scoredFraction: 0.4, meanCapture: 0.4, calibrationOk: true, eligible: false, reasons: ['Capture quality too low'] };

describe('the record rules', () => {
  it('the first counted session sets the line and is not called a record', () => {
    const m = buildStaircase([set(5)], 'squat-bodyweight');
    expect(m.sessions[0]).toMatchObject({ status: 'first', best: 5 });
    expect(m.latestIsRecord).toBe(false);
  });

  it('classifies record, matched and below, and the record only ever rises', () => {
    const m = buildStaircase([set(5), set(7), set(7), set(4), set(9)], 'squat-bodyweight');
    expect(m.sessions.map((s) => s.status)).toEqual(['first', 'record', 'matched', 'below', 'record']);
    expect(m.sessions.map((s) => s.best)).toEqual([5, 7, 7, 7, 9]);
    expect(m.record?.value).toBe(9);
    expect(m.latestIsRecord).toBe(true);
    const bests = m.sessions.map((s) => s.best);
    expect(bests).toEqual([...bests].sort((a, b) => a - b));
  });

  it('shows a session that did not count, and it can never raise the line', () => {
    const m = buildStaircase([set(5), set(20, { quality: poor }), set(6)], 'squat-bodyweight');
    expect(m.sessions).toHaveLength(3);
    expect(m.sessions[1]).toMatchObject({ status: 'not-counted', held: 20, best: 5 });
    expect(m.record?.value).toBe(6);
    expect(m.sessions[2]).toMatchObject({ status: 'record', best: 6 });
    expect(statusLabel(m.sessions[1])).toBe('Did not count toward records: capture quality too low');
  });

  it('a newest session that did not count is not a record', () => {
    expect(buildStaircase([set(5), set(20, { quality: poor })], 'squat-bodyweight').latestIsRecord).toBe(false);
  });

  it('keeps protocols and detector versions apart, and orders by time', () => {
    const lunge = set(30, { protocolId: 'lunge-forward' });
    const other = set(30, { detectorConfigId: 'cfg-2' });
    const a = set(3);
    const b = set(4);
    // `a` started before `b`, and the list is deliberately passed out of order
    const m = buildStaircase([b, lunge, other, a], 'squat-bodyweight', { configId: 'cfg-1' });
    expect(m.sessions.map((s) => s.held)).toEqual([3, 4]);
    expect(m.sessions.map((s) => s.status)).toEqual(['first', 'record']);
    expect(m.record?.value).toBe(4);
  });

  it('windowing drops old sessions from view but keeps their effect on the record', () => {
    const history = [set(12), ...Array.from({ length: 5 }, () => set(3))];
    const m = buildStaircase(history, 'squat-bodyweight', { maxSessions: 3 });
    expect(m.sessions).toHaveLength(3);
    expect(m.omitted).toBe(3);
    expect(m.sessions.every((s) => s.best === 12 && s.status === 'below')).toBe(true);
  });

  it('empty history is an empty model, not an error', () => {
    const m = buildStaircase([], 'squat-bodyweight');
    expect(m.sessions).toEqual([]);
    expect(m.record).toBeNull();
    expect(m.latestIsRecord).toBe(false);
  });

  it('picks a round axis that always contains the data', () => {
    expect(niceAxis(9)).toEqual({ yMax: 10, ticks: [0, 2, 4, 6, 8, 10] });
    expect(niceAxis(0).yMax).toBeGreaterThan(0);
    for (const peak of [1, 7, 10, 11, 23, 31, 64]) expect(niceAxis(peak).yMax).toBeGreaterThanOrEqual(peak);
  });
});

describe('the rendered chart', () => {
  const render = (history: SessionRecord[]) => renderToStaticMarkup(createElement(RecordStaircase, { model: buildStaircase(history, 'squat-bodyweight') }));

  it('draws one bar per session and gives every bar its value as text', () => {
    const history = [set(5), set(7), set(4), set(9, { quality: poor }), set(8)];
    const html = render(history);
    expect((html.match(/class="rs-bar /g) ?? []).length).toBe(5);
    const vals = [...html.matchAll(/class="rs-val num"[^>]*>(\d+)</g)].map((m) => Number(m[1]));
    expect(vals).toEqual([5, 7, 4, 9, 8]);
  });

  it('separates the outcomes by shape and style, not colour alone: cap, diamond, outline, dashed', () => {
    const html = render([set(5), set(7), set(4), set(9, { quality: poor })]);
    expect(html).toContain('is-first');
    expect(html).toContain('is-record');
    expect(html).toContain('rs-cap'); // cap on the record bar
    expect(html).toContain('rs-diamond'); // diamond where a bar meets the line
    expect(html).toContain('is-held'); // outlined
    expect(html).toContain('is-void'); // dashed
    expect(html).toContain('Did not count toward records'); // legend, because one exists
  });

  it('leans bars and the staircase together at 12 degrees', () => {
    expect(render([set(5), set(7)])).toContain('skewX(-12)');
  });

  it('lime is only for the newest session, and only when it is a genuine new record', () => {
    expect(render([set(5), set(7)])).toContain('is-new');
    expect(render([set(5), set(7), set(6)])).not.toContain('is-new');
    expect(render([set(5), set(7), set(9, { quality: poor })])).not.toContain('is-new');
  });

  it('has a table that restates the chart, and hides the drawing from assistive tech', () => {
    const html = render([set(5), set(7), set(7)]);
    expect(html).toMatch(/<svg[^>]*role="img"/); // the drawing is one labelled image; the table carries the detail
    expect(html).toMatch(/<svg[^>]*aria-label="[^"]*is your record/);
    expect(html).toContain('<div class="visually-hidden"><table>'); // wrapped in a block, because a table cannot clip itself
    expect((html.match(/<tr>/g) ?? []).length).toBe(1 + 3);
    expect(html).toContain('New record');
    expect(html).toContain('Matched your record');
  });

  it('says what an empty chart means', () => {
    expect(render([])).toContain('draws the first step of your record line');
  });
});

// The outlined and dashed bars carry the "did not beat the line" sessions, so their colours must be
// readable on the page. WCAG asks 3:1 for graphics; check the actual tokens, not a guess.
describe('the colours that carry every session', () => {
  const css = readFileSync('src/styles.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens = new Map<string, string>();
  for (const m of (/:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens.set(m[1], m[2].trim());
  const hex = (name: string, depth = 0): string => {
    const raw = tokens.get(name) ?? '';
    const ref = /^var\((--[\w-]+)\)$/.exec(raw);
    if (ref && depth < 5) return hex(ref[1], depth + 1);
    const h = /^#([0-9a-f]{6})$/i.exec(raw)?.[1];
    if (!h) throw new Error(`${name} is not a plain hex colour (${raw})`);
    return h.toLowerCase();
  };
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (h: string) => [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it.each([['stable'], ['muted'], ['ice'], ['text']])('--%s reads at 3:1 or better on the page and on panels', (t) => {
    for (const bg of ['void', 'panel']) expect(ratio(hex(`--${t}`), hex(`--${bg}`)), `--${t} on --${bg}`).toBeGreaterThanOrEqual(3);
  });
});
