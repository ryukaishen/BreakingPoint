// The rep-by-rep comparison: which set it compares against, how reps map to cells,
// that the words never judge anything but reps held, and that the rendered band
// carries every state without relying on colour.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SplitsBand } from '../src/components/debrief/SplitsBand';
import { bestComparable, buildSplits, cellLabel, toCell } from '../src/data/splits';
import type { SessionRecord, SessionRep } from '../src/data/types';

type S = 'STABLE' | 'DRIFT' | 'BREAKPOINT' | null;
const reps = (states: S[], opts: { afterFrom?: number } = {}): SessionRep[] =>
  states.map((s, i) => ({ index: i + 1, score: s === null ? null : 0.5, state: s, ewma: s === null ? null : 0.5, quality: 0.9, afterWarning: opts.afterFrom !== undefined && i + 1 > opts.afterFrom }));

let n = 0;
function set(held: number, over: Partial<SessionRecord> = {}): SessionRecord {
  n++;
  const r = reps([...Array(held).fill('STABLE'), 'DRIFT', 'DRIFT', 'BREAKPOINT']);
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
    reps: r,
    totalReps: r.length,
    scoredReps: r.length,
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

describe('choosing the set to compare against', () => {
  it('picks the earlier comparable set with the most reps held, latest on a tie', () => {
    const a = set(6);
    const b = set(8);
    const c = set(8);
    const today = set(9);
    expect(bestComparable([a, b, c, today], today)?.id).toBe(c.id);
    expect(bestComparable([a, today], today)?.id).toBe(a.id);
  });

  it('ignores itself, later sets, other protocols, other detector versions, demo data and ineligible sets', () => {
    // Every distractor is built BEFORE today (so it is earlier) and has more reps held, so only its own flaw can exclude it.
    const earlierOk = set(5);
    const otherProtocol = set(20, { protocolId: 'lunge-forward' });
    const otherDetector = set(20, { detectorConfigId: 'cfg-2' });
    const demo = set(20, { source: 'demo' });
    const otherAthlete = set(20, { athleteId: 'ath_2' });
    const poor = set(20, { quality: { scoredFraction: 0.3, meanCapture: 0.4, calibrationOk: true, eligible: false, reasons: ['Capture quality too low'] } });
    const today = set(7);
    const later = set(20, { startedAt: new Date(Date.UTC(2027, 0, 1)).toISOString() });
    const history = [earlierOk, otherProtocol, otherDetector, demo, otherAthlete, poor, later, today];
    expect(bestComparable(history, today)?.id).toBe(earlierOk.id);
    // and with the only legitimate candidate removed, nothing is left to compare against
    expect(bestComparable(history.filter((s) => s !== earlierOk), today)).toBeNull();
  });

  it('is null when nothing comparable exists, and for a set that is not itself eligible', () => {
    const today = set(7);
    expect(bestComparable([today], today)).toBeNull();
    const bad = set(7, { quality: { scoredFraction: 0.5, meanCapture: 0.5, calibrationOk: true, eligible: false, reasons: ['Capture quality too low'] } });
    expect(bestComparable([set(9), bad], bad)).toBeNull();
  });
});

describe('cells', () => {
  it('maps detector states, unscored reps and reps after the warning', () => {
    const cells = reps(['STABLE', 'DRIFT', 'BREAKPOINT', null, 'DRIFT'], { afterFrom: 3 }).map(toCell);
    expect(cells.map((c) => c.state)).toEqual(['stable', 'drift', 'break', 'unscored', 'drift']);
    expect(cells.map((c) => c.afterWarning)).toEqual([false, false, false, true, true]);
  });

  it('describes each state in words, including after the warning', () => {
    expect(cellLabel(undefined)).toBe('No rep');
    expect(cellLabel(toCell(reps(['STABLE'])[0]))).toBe('At baseline');
    expect(cellLabel(toCell(reps(['BREAKPOINT', 'DRIFT'], { afterFrom: 1 })[1]))).toBe('Form changing, after the warning');
    expect(cellLabel(toCell(reps([null])[0]))).toBe('Not scored');
  });
});

describe('the model', () => {
  const fmt = () => 'Oct 4';

  it('compares a new record against the previous best and says so plainly', () => {
    const prev = set(8);
    const today = set(9);
    const m = buildSplits([prev, today], today, { formatDate: fmt });
    expect(m.outcome.kind).toBe('new-record');
    expect(m.best?.label).toBe('Best set, Oct 4');
    expect(m.headline).toBe('You held your baseline for 9 reps, 1 rep more than your best.');
    expect(m.rows[0]).toMatchObject({ id: 'held', today: '9', best: '8', delta: '+1' });
    expect(m.today.held).toBe(9);
    expect(m.slots).toBe(Math.max(today.reps.length, prev.reps.length));
  });

  it('states a shortfall neutrally and a match as a match', () => {
    const prev = set(8);
    const below = set(6);
    expect(buildSplits([prev, below], below, { formatDate: fmt }).headline).toBe('You held your baseline for 6 reps. Your best is 8.');
    const matched = set(8);
    const m = buildSplits([prev, matched], matched, { formatDate: fmt });
    expect(m.headline).toBe('You held your baseline for 8 reps, matching your best.');
    expect(m.rows[0].delta).toBe('same');
    expect(buildSplits([prev, below], below, { formatDate: fmt }).rows[0].delta).toBe('−2');
  });

  it('never judges when drift began or when the breaking point fired', () => {
    const prev = set(8);
    const today = set(9);
    const m = buildSplits([prev, today], today, { formatDate: fmt });
    for (const id of ['onset', 'break'] as const) expect(m.rows.find((r) => r.id === id)?.delta).toBeNull();
    // a later breaking point is reported, not praised
    expect(m.rows.find((r) => r.id === 'break')).toMatchObject({ today: 'Rep 12', best: 'Rep 11' });
    expect(JSON.stringify(m)).not.toMatch(/better|worse|great|excellent|improv|achiev/i);
  });

  it('a first set has no comparison and says what it means', () => {
    const today = set(5);
    const m = buildSplits([today], today, { formatDate: fmt });
    expect(m.best).toBeNull();
    expect(m.outcome.kind).toBe('first-record');
    expect(m.note).toMatch(/line to beat/);
    expect(m.rows.every((r) => r.best === null && r.delta === null)).toBe(true);
  });

  it('a set that is not eligible is not compared, and the reason is given', () => {
    const bad = set(7, { quality: { scoredFraction: 0.5, meanCapture: 0.5, calibrationOk: true, eligible: false, reasons: ['Capture quality too low'] } });
    const m = buildSplits([set(9), bad], bad, { formatDate: fmt });
    expect(m.best).toBeNull();
    expect(m.note).toBe('Not compared with your other sets: capture quality too low.');
  });

  it('records the breaking point and drift onset from the stored set', () => {
    const today = set(9);
    const m = buildSplits([today], today);
    expect(m.today).toMatchObject({ onsetRep: 10, breakpointRep: 12, held: 9 });
  });
});

describe('the rendered band', () => {
  const render = (m: ReturnType<typeof buildSplits>) => renderToStaticMarkup(createElement(SplitsBand, { model: m }));

  it('renders one cell per rep per lane, with a legend that names every state', () => {
    const prev = set(8);
    const today = set(9);
    const html = render(buildSplits([prev, today], today));
    const cells = (html.match(/class="sb-cell /g) ?? []).length;
    expect(cells).toBe(2 * Math.max(today.reps.length, prev.reps.length));
    for (const word of ['At baseline', 'Form changing', 'Breaking point', 'End of the held run']) expect(html).toContain(word);
  });

  it('carries state without colour: hatch pattern, cross glyph, outline, and a text-alternative table', () => {
    const prev = set(8);
    const today = set(9);
    const html = render(buildSplits([prev, today], today));
    expect(html).toContain('s-drift'); // hatched via CSS pattern
    expect(html).toContain('✕'); // cross glyph on the breaking-point rep
    expect(html).toContain('<div class="visually-hidden"><table>'); // wrapped in a block, because a table cannot clip itself
    expect((html.match(/<tr>/g) ?? []).length).toBe(1 + Math.max(today.reps.length, prev.reps.length));
    expect(html).toContain('Breaking point</td>');
    expect(html).toMatch(/aria-hidden="true"/); // the visual chart is hidden from assistive tech; the table replaces it
  });

  it('marks the held run in lime only for a genuine new record', () => {
    const prev = set(8);
    const rec = set(9);
    expect(render(buildSplits([prev, rec], rec))).toContain('is-record');
    const level = set(8);
    expect(render(buildSplits([prev, level], level))).not.toContain('is-record');
    const below = set(5);
    expect(render(buildSplits([prev, below], below))).not.toContain('is-record');
    expect(render(buildSplits([rec], rec))).not.toContain('is-record'); // first set: nothing to beat yet
  });

  it('keeps the NEW RECORD tag out of the band unless asked (the result slab owns it), and never for a non-record', () => {
    const prev = set(8);
    const rec = set(9);
    const tagged = (m: ReturnType<typeof buildSplits>) => renderToStaticMarkup(createElement(SplitsBand, { model: m, recordTag: true }));
    expect(render(buildSplits([prev, rec], rec))).not.toContain('New record');
    expect(tagged(buildSplits([prev, rec], rec))).toContain('New record');
    const level = set(8);
    expect(tagged(buildSplits([prev, level], level))).not.toContain('New record');
  });

  it('reads the comparison in plain words, with the held delta spelled out', () => {
    const prev = set(8);
    const rec = set(9);
    const html = render(buildSplits([prev, rec], rec));
    expect(html).toContain('Best set: 8');
    expect(html).toContain('(+1)');
    expect(html).toContain('Best set: Rep 11'); // the breaking point is a fact, with no delta beside it
    expect(html).not.toMatch(/Best set: Rep 11[^<]*\(/);
  });

  it('marks reps after the warning and unscored reps in the legend only when present', () => {
    const today = set(4, { reps: reps(['STABLE', 'STABLE', 'STABLE', 'STABLE', 'DRIFT', 'BREAKPOINT', 'DRIFT', null], { afterFrom: 6 }), totalReps: 8 });
    const html = render(buildSplits([today], today));
    expect(html).toContain('After the warning, not counted');
    expect(html).toContain('Not scored');
    const clean = set(3);
    expect(render(buildSplits([clean], clean))).not.toContain('After the warning, not counted');
  });

  it('uses a heading the debrief can place, and degrades to a message for an empty set', () => {
    const today = set(3);
    expect(renderToStaticMarkup(createElement(SplitsBand, { model: buildSplits([today], today), headingLevel: 3 }))).toMatch(/<h3 id="splits-title">/);
    const empty = set(0, { reps: [], totalReps: 0, scoredReps: 0 });
    expect(render(buildSplits([empty], empty))).toContain('No reps were measured in this set.');
  });
});

// A keyframe that sets `transform` replaces an element's own transform for as long as the animation fills.
// The held-run marker's 12° lean once vanished that way (found by comparing a motion render with a
// reduced-motion render), so the rule is checked here for every element that leans AND animates.
describe('animation never overrides the 12° lean', () => {
  const css = readFileSync('src/components/debrief/SplitsBand.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  /** The body of `@keyframes <name> { ... }`, found by matching braces (a regex cannot balance them). */
  const keyframes = (name: string): string => {
    const at = css.indexOf(`@keyframes ${name}`);
    if (at < 0) return '';
    const open = css.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
    }
    return '';
  };

  it('an element with its own transform animates opacity only', () => {
    const own = new Set(rules.filter((r) => /(^|;)\s*transform:/.test(r.body) && !r.sel.startsWith('@')).map((r) => r.sel.split(/\s+/).pop()));
    let checked = 0;
    for (const r of rules) {
      const anim = /animation:\s*(sb-[\w-]+)/.exec(r.body)?.[1];
      if (!anim) continue;
      const frames = keyframes(anim);
      expect(frames.length, `could not find @keyframes ${anim}`).toBeGreaterThan(0);
      if (own.has(r.sel.split(/\s+/).pop())) {
        checked++;
        expect(frames, `${r.sel} has its own transform but animates ${anim}`).not.toMatch(/transform/);
      }
    }
    expect(checked, 'the test found no leaning element that animates, so it checked nothing').toBeGreaterThan(0);
  });
});
