// Wording guard for the athlete-facing app. The live screens use plain sports
// language ("form changes", "Form Change Score", "your usual form"); statistical
// terms stay in the research panel, the code and the technical docs. Identifiers
// such as `driftScore` or `FormDrawdown` are never renamed for wording, and the
// phrases below are multi-word so those identifiers do not match.
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PATTERN_EXPLAIN, PATTERN_LABELS } from '../src/protocols/patterns';
import { DISCLAIMER } from '../src/session/summary';
import { STATE_LABEL } from '../src/utils/format';

/** Files whose visible text an athlete sees in the live app. */
const LIVE_COPY_FILES = [
  'src/App.tsx',
  'src/components/SidePanel.tsx',
  'src/components/FormDrawdown.tsx',
  'src/components/RepTimeline.tsx',
  'src/components/SummaryModal.tsx',
  'src/components/Landing.tsx',
  'src/components/Header.tsx',
  'src/components/SportPage.tsx',
  'src/components/ProtocolLibrary.tsx',
  'src/components/debrief/SplitsBand.tsx',
  'src/data/splits.ts',
  'src/data/progress.ts',
  'src/protocols/patterns.ts',
  'src/protocols/sports.ts',
  'src/protocols/protocols.ts',
  'src/session/engine.ts',
  'src/session/summary.ts',
  'src/session/explain.ts',
  'src/biomechanics/plainLanguage.ts',
  'src/utils/format.ts',
  'shared/feature_catalog.json',
];

const BANNED: [RegExp, string][] = [
  [/movement drift/i, 'say "form changes"'],
  [/drift score/i, 'say "Form Change Score"'],
  [/drift (emerging|onset|began|detected|persists|remains|per rep)/i, 'use the plain wording'],
  [/(persistent|smoothed|per-rep|in-control|avg|mean) drift/i, 'use the plain wording'],
  [/form drawdown/i, 'say "Form Changes Over Time"'],
  [/\bregime\b/i, 'jargon'],
  [/movement signature|\bsignature changes\b/i, 'say "your usual form"'],
  [/σ RMS/, 'no σ units in the athlete view'],
  [/(cannot|can never|can't|will never|never) trigger/i, 'not true: the false-positive rate is not zero'],
  [/one (bad|odd|weird) rep (cannot|can't|never)/i, 'not true: the false-positive rate is not zero'],
  [/fatigue (screen|detect)|detects? fatigue|explosive fatigue/i, 'the app does not measure fatigue'],
  // Negations such as "it does not measure fatigue or injury risk" are fine; claims are not.
  [/(predicts?|prevents?|reduces?|lowers?|measures?|detects?) (your )?(injur|ACL)|injury prediction|ACL risk/i, 'no injury claims'],
  [/validated detector|clinically validated/i, 'say what the validation was (synthetic)'],
];

/** Source text without comments, so explanatory code comments do not count as visible copy. */
function visibleSource(path: string): string {
  const raw = readFileSync(path, 'utf8');
  if (path.endsWith('.json')) return raw;
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('athlete-facing wording', () => {
  it.each(LIVE_COPY_FILES)('%s avoids jargon and over-claims', (path) => {
    const text = visibleSource(path);
    for (const [re, why] of BANNED) {
      const m = text.match(re);
      expect(m ? `"${m[0]}" (${why})` : null, path).toBeNull();
    }
  });

  it('state labels are plain words', () => {
    expect(STATE_LABEL).toEqual({ STABLE: 'STABLE', DRIFT: 'FORM CHANGING', BREAKPOINT: 'BREAKING POINT' });
  });

  it('pattern labels and explanations describe movement, not causes', () => {
    const text = [...Object.values(PATTERN_LABELS), ...Object.values(PATTERN_EXPLAIN)].join(' ');
    expect(text).not.toMatch(/drift|fatigue|injur|risk|unsafe|worse/i);
  });

  it('keeps the non-medical disclaimer', () => {
    expect(DISCLAIMER).toBe('BreakingPoint provides training information and is not a medical diagnosis.');
  });
});

describe('feature catalog', () => {
  // Only display strings (label, short, upWord, downWord) may change for wording. Units, scales,
  // groups, weights and noise floors feed the score and the Lab, so they must stay as committed.
  it('numeric and grouping fields are unchanged', () => {
    const c = JSON.parse(readFileSync('shared/feature_catalog.json', 'utf8')) as {
      exercises: Record<string, { features: Record<string, string | number>[] }>;
    };
    const rows: string[] = [];
    for (const [ex, v] of Object.entries(c.exercises)) {
      for (const f of v.features) rows.push([ex, f.key, f.unit, f.displayScale, f.decimals, f.group, f.weight, f.absFloor, f.relFloor].join('|'));
    }
    const hash = createHash('sha256').update(rows.join('\n')).digest('hex');
    expect(hash).toBe('cd57371a4e5e31614df54bedcf0dd017133261e1a6aaede29adb4d14e39711a0');
  });
});
