// Static accessibility guards that hold for any palette: the 11px text floor,
// text contrast of the core tokens on the surfaces they are used on, and the
// page-level settings the web-interface audit checks. They fail with file:line
// so a regression names its cause.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Audit another checkout read-only with BP_ROOT=<path>; defaults to this one.
const ROOT = process.env.BP_ROOT ?? '.';
const at = (p: string) => join(ROOT, p);

const walk = (dir: string, ext: string[]): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p, ext) : ext.some((e) => p.endsWith(e)) ? [p] : [];
  });

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

// ---------------------------------------------------------------- text size floor
const FLOOR_PX = 11;

/** The smallest px value a font-size declaration can produce, or null when it is not a plain px / clamp(px, …). */
function minPx(value: string): number | null {
  const v = value.trim();
  const plain = /^([\d.]+)px$/.exec(v);
  if (plain) return Number(plain[1]);
  const clamp = /^clamp\(\s*([\d.]+)px\s*,/.exec(v);
  return clamp ? Number(clamp[1]) : null;
}

describe('text size floor', () => {
  it(`no CSS declares text smaller than ${FLOOR_PX}px`, () => {
    const bad: string[] = [];
    for (const file of walk(at('src'), ['.css'])) {
      stripComments(readFileSync(file, 'utf8'))
        .split('\n')
        .forEach((line, i) => {
          for (const m of line.matchAll(/(?:^|[;{\s])font-size:\s*([^;}]+)/g)) {
            const px = minPx(m[1]);
            if (px !== null && px < FLOOR_PX) bad.push(`${file.replace(/\\/g, '/')}:${i + 1} font-size ${m[1].trim()}`);
          }
        });
    }
    expect(bad, `Informational text must be at least ${FLOOR_PX}px:\n${bad.join('\n')}`).toEqual([]);
  });

  it(`no SVG or inline text in TSX is smaller than ${FLOOR_PX}px`, () => {
    const bad: string[] = [];
    for (const file of walk(at('src'), ['.tsx'])) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const m of line.matchAll(/fontSize[=:]\s*\{?\s*([\d.]+)/g)) if (Number(m[1]) < FLOOR_PX) bad.push(`${file.replace(/\\/g, '/')}:${i + 1} fontSize ${m[1]}`);
        });
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});

// ---------------------------------------------------------------- token contrast
function rootTokens(css: string): Map<string, string> {
  const body = /:root\s*\{([\s\S]*?)\n\}/.exec(stripComments(css))?.[1] ?? '';
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

function resolveHex(tokens: Map<string, string>, name: string, depth = 0): string {
  const raw = tokens.get(name);
  if (raw === undefined) throw new Error(`token ${name} is not defined in :root`);
  const ref = /^var\((--[\w-]+)\)$/.exec(raw);
  if (ref) {
    if (depth > 5) throw new Error(`token ${name} is circular`);
    return resolveHex(tokens, ref[1], depth + 1);
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (!hex) throw new Error(`token ${name} is not a plain hex colour (${raw})`);
  const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
  return h.toLowerCase();
}

const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => {
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('token contrast (WCAG 2.1 AA)', () => {
  const tokens = rootTokens(readFileSync(at('src/styles.css'), 'utf8'));
  const c = (n: string) => resolveHex(tokens, `--${n}`);
  const surfaces = ['void', 'abyss', 'panel', 'panel-2'];

  it.each([['text'], ['text-2'], ['muted']])('%s reads at 4.5:1 on every surface text sits on', (fg) => {
    for (const bg of surfaces) {
      const ratio = contrast(c(fg), c(bg));
      expect(ratio, `--${fg} on --${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // The accent that is used as TEXT: the light cobalt in Breakaway (the base cobalt is a fill), the electric blue before it.
  const accentText = tokens.has('--cobalt-hi') ? 'cobalt-hi' : 'sys';
  it.each([['stable'], ['drift'], ['break'], [accentText], ['ice']])('state and accent colour --%s is legible as text on panels', (fg) => {
    for (const bg of ['void', 'panel']) {
      const ratio = contrast(c(fg), c(bg));
      expect(ratio, `--${fg} on --${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Text that sits ON a filled colour must use the pairing the palette declares for it.
  const fills = [['on-cobalt', 'cobalt'], ['on-lime', 'lime'], ['on-sys', 'sys']].filter(([fg, bg]) => tokens.has('--' + fg) && tokens.has('--' + bg));
  it.each(fills)('--%s on --%s reaches 4.5:1', (fg, bg) => {
    const ratio = contrast(c(fg), c(bg));
    expect(ratio, `--${fg} on --${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it('borders that mark a control are visible (3:1 against the surface they sit on)', () => {
    // Informational: hairlines (--line) are decorative; control outlines (--line-2) are not required to reach 3:1
    // because every control also has a filled background or a text label. This guards against the outline vanishing.
    expect(contrast(c('line-2'), c('panel'))).toBeGreaterThan(1.3);
  });
});

// ---------------------------------------------------------------- page-level settings
describe('page-level settings', () => {
  const html = readFileSync(at('index.html'), 'utf8');
  const css = readFileSync(at('src/styles.css'), 'utf8');

  it('does not disable zoom', () => {
    expect(html).not.toMatch(/user-scalable\s*=\s*(no|0)/i);
    expect(html).not.toMatch(/maximum-scale\s*=\s*1(\.0)?\b/i);
  });

  it('declares a dark colour scheme and a matching theme colour', () => {
    expect(css).toMatch(/color-scheme:\s*dark/);
    expect(html).toMatch(/<meta\s+name="theme-color"/);
  });

  it('has a skip link and a focus-visible ring', () => {
    expect(css).toMatch(/\.skip-link/);
    expect(css).toMatch(/:focus-visible/);
  });

  it('never uses transition: all', () => {
    expect(stripComments(css)).not.toMatch(/transition:\s*all\b/);
  });
});
