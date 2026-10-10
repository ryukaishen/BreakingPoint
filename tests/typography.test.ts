// The numeral rule (src/ui/numerals.css): Anybody italic only at display size and
// always with tabular figures; everything smaller stays in Mona Sans.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.BP_ROOT ?? '.';
const HERO_MIN_PX = 32;

const walk = (dir: string, ext: string[]): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p, ext) : ext.some((e) => p.endsWith(e)) ? [p] : [];
  });

const blank = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

interface Rule {
  file: string;
  line: number;
  selector: string;
  decls: Map<string, string>;
}

/** A small CSS scanner: flat rules and rules nested one level in @media/@supports. Ignores @keyframes and @font-face. */
export function parseRules(file: string, css: string): Rule[] {
  const text = blank(css);
  const out: Rule[] = [];
  const stack: { selector: string; line: number; body: string; at: boolean }[] = [];
  let buf = '';
  let line = 1;
  for (const ch of text) {
    if (ch === '\n') line++;
    if (ch === '{') {
      const sel = buf.trim();
      stack.push({ selector: sel, line, body: '', at: sel.startsWith('@') });
      buf = '';
    } else if (ch === '}') {
      const top = stack.pop();
      if (top && !top.at && !stack.some((s) => /^@(keyframes|font-face)/.test(s.selector)) && !/^@(keyframes|font-face)/.test(top.selector)) {
        const decls = new Map<string, string>();
        for (const d of (top.body + buf).split(';')) {
          const i = d.indexOf(':');
          if (i > 0) decls.set(d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim());
        }
        out.push({ file, line: top.line, selector: top.selector, decls });
      }
      buf = '';
    } else if (ch === ';' && stack.length) {
      const top = stack[stack.length - 1];
      top.body += buf + ';';
      buf = '';
    } else buf += ch;
  }
  return out;
}

/** The smallest px a font-size can produce: px, clamp(px, …), max(…, px) or a :root token that resolves to one. */
function minPx(value: string, tokens: Map<string, string>): number | null {
  const v = value.trim();
  let m = /^([\d.]+)px$/.exec(v);
  if (m) return Number(m[1]);
  m = /^clamp\(\s*([\d.]+)px\s*,/.exec(v);
  if (m) return Number(m[1]);
  m = /^max\(.*?,\s*([\d.]+)px\s*\)$/.exec(v);
  if (m) return Number(m[1]);
  m = /^var\((--[\w-]+)\)$/.exec(v);
  if (m && tokens.has(m[1])) return minPx(tokens.get(m[1])!, tokens);
  return null;
}

const usesNumFont = (r: Rule) => /--font-num|anybody/i.test(r.decls.get('font-family') ?? '') || /--font-num|anybody/i.test(r.decls.get('font') ?? '');
const tabular = (r: Rule) => /tabular-nums/.test(r.decls.get('font-variant-numeric') ?? '') || /["']tnum["']/.test(r.decls.get('font-feature-settings') ?? '');

describe('numeral typography rule', () => {
  const files = walk(join(ROOT, 'src'), ['.css']);
  const all = files.flatMap((f) => parseRules(f.replace(/\\/g, '/'), readFileSync(f, 'utf8')));
  const tokens = new Map<string, string>();
  for (const r of all) if (r.selector === ':root') for (const [k, v] of r.decls) if (k.startsWith('--')) tokens.set(k, v);
  const numRules = all.filter(usesNumFont).filter((r) => !(r.selector === ':root'));

  it('the scanner reads rules, including those nested in @media', () => {
    const rules = parseRules('x.css', '/* c */ .a { color: red; font-size: 12px } @media (x) { .b { font-family: var(--font-num); font-size: 40px; } } @keyframes k { from { font-size: 1px } }');
    expect(rules.map((r) => r.selector)).toEqual(['.a', '.b']);
    expect(usesNumFont(rules[1])).toBe(true);
  });

  it(`Anybody is only used at ${HERO_MIN_PX}px or larger, declared in the same rule`, () => {
    const bad = numRules.filter((r) => {
      const size = r.decls.get('font-size');
      const px = size ? minPx(size, tokens) : null;
      return px === null || px < HERO_MIN_PX;
    });
    expect(bad.map((r) => `${r.file}:${r.line} ${r.selector} font-size ${r.decls.get('font-size') ?? '(none)'}`), `Anybody italic needs an explicit font-size of at least ${HERO_MIN_PX}px; smaller numbers belong in Mona Sans (.num):`).toEqual([]);
  });

  it('Anybody always has tabular figures enabled', () => {
    const bad = numRules.filter((r) => !tabular(r));
    expect(bad.map((r) => `${r.file}:${r.line} ${r.selector}`)).toEqual([]);
  });

  it('inline and SVG text using the numeral font declares a size of at least the floor', () => {
    const bad: string[] = [];
    for (const f of walk(join(ROOT, 'src'), ['.tsx'])) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((l, i) => {
        if (!/FONT_NUM|--font-num|Anybody/.test(l)) return;
        const near = lines.slice(Math.max(0, i - 2), i + 3).join(' ');
        const size = [...near.matchAll(/fontSize[=:]\s*\{?\s*(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
        if (!size.length || Math.min(...size) < HERO_MIN_PX) bad.push(`${f.replace(/\\/g, '/')}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('the shared utility classes obey their own rule', () => {
    const hero = all.find((r) => r.selector === '.num-hero');
    const data = all.find((r) => r.selector === '.num');
    expect(hero, '.num-hero is defined in src/ui/numerals.css').toBeDefined();
    expect(minPx(hero!.decls.get('font-size') ?? '', tokens)).toBeGreaterThanOrEqual(HERO_MIN_PX);
    expect(tabular(hero!)).toBe(true);
    expect(data, '.num is defined').toBeDefined();
    expect(usesNumFont(data!)).toBe(false);
    expect(tabular(data!)).toBe(true);
  });
});
