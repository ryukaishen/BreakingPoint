// Phase 4B scoring helpers (research/phase4b/scoring.ts). The ablated scores must equal the app's own
// score with those measurements' weight set to 0, and the split, rank, shuffle and linking helpers must
// do exactly what protocol v04 says.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { buildFeatureBaselines } from '../src/baseline/baseline';
import { featureSpecs, type RepFeatures } from '../src/biomechanics/catalog';
import { DEFAULT_DETECTOR_CONFIG, parseDetectorConfig } from '../src/detection/config';
import { driftScore } from '../src/detection/driftScore';
import { DemoController } from '../src/demo/demoController';
import { SessionEngine } from '../src/session/engine';
import {
  JUMP_SCORES, combinations, linkReps, personalSplits, rankOf, scoreAgainst, shuffleWithin, specsFor,
} from '../research/phase4b/scoring';

const cfg = existsSync('public/breakingpoint_detector_config.json')
  ? parseDetectorConfig(JSON.parse(readFileSync('public/breakingpoint_detector_config.json', 'utf8')))
  : DEFAULT_DETECTOR_CONFIG;

function cmjReps(): RepFeatures[] {
  const engine = new SessionEngine('cmj', cfg, 'Adam', 'demo');
  new DemoController(engine, 'cmj').runToEnd(false);
  const s = engine.getSnapshot();
  return [...s.calibrationReps, ...s.monitorReps].map((r) => r.features);
}

describe('ablated scores', () => {
  const reps = cmjReps();
  it('the shipped config weights by group and quality, so a removed measurement equals weight 0', () => {
    expect(cfg.featureWeighting).toBe('grouped_quality');
    for (const [label, remove] of Object.entries(JUMP_SCORES)) {
      const reduced = specsFor('cmj', remove);
      const zeroed = featureSpecs('cmj').map((s) => (remove.includes(s.key) ? { ...s, weight: 0 } : s));
      const ref = reps.slice(0, 5);
      const a = scoreAgainst(ref, reps.slice(5), reduced, cfg);
      const fb = buildFeatureBaselines(ref, zeroed, cfg.qualityMin);
      const b = reps.slice(5).map((r) => driftScore(r, fb, zeroed, cfg).score);
      a.forEach((x, i) => expect(x, label).toBeCloseTo(b[i] as number, 12));
    }
  });
  it('S0 is the app score itself and ablations drop exactly the named measurements', () => {
    expect(specsFor('cmj').map((s) => s.key)).toEqual(featureSpecs('cmj').map((s) => s.key));
    expect(specsFor('cmj', JUMP_SCORES['S-valid']).map((s) => s.key)).toEqual(
      ['jumpHeight', 'rsiMod', 'countermovementDepth', 'eccentricDuration', 'trunkLean', 'landingKneeFlex'],
    );
  });
});

describe('personal-baseline splits', () => {
  it('enumerates the 20 three-of-six reference sets and finds the true split', () => {
    const c = combinations(6, 3);
    expect(c).toHaveLength(20);
    expect(new Set(c.map((x) => x.join())).size).toBe(20);
    const reps = cmjReps().slice(0, 6);
    expect(personalSplits(reps, [0, 1, 2], specsFor('cmj'), cfg).trueSplit).toBe(0);
    expect(personalSplits(reps, [5, 3, 4], specsFor('cmj'), cfg).trueSplit).toBe(c.findIndex((x) => x.join() === '3,4,5'));
  });
  it('ranks the true split first when the comparison set clearly differs', () => {
    const base = cmjReps().slice(0, 3);
    const shifted = base.map((r) => ({ ...r, values: Object.fromEntries(Object.entries(r.values).map(([k, v]) => [k, typeof v === 'number' ? v * 1.6 : v])) }));
    const sr = personalSplits([...base, ...shifted], [0, 1, 2], specsFor('cmj'), cfg);
    expect(rankOf(sr.splitMeans, sr.trueSplit)).toBeLessThanOrEqual(2);
  });
  it('rank: 1 is the largest, ties share the average rank, nulls are skipped', () => {
    expect(rankOf([3, 1, 2], 0)).toBe(1);
    expect(rankOf([2, 2, 1], 0)).toBe(1.5);
    expect(rankOf([null, 2, 1], 2)).toBe(2);
    expect(rankOf([null, 2], 0)).toBeNull();
  });
});

describe('label shuffling', () => {
  it('stays within the person, keeps the counts, and repeats for the same seed', () => {
    const groups = [['a', 'b', 'c'], ['d', 'e']];
    const s1 = shuffleWithin(groups, 3, 'sub01');
    expect(s1.map((g) => g.length)).toEqual([3, 2]);
    expect(s1.flat().sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(shuffleWithin(groups, 3, 'sub01')).toEqual(s1);
    const seen = new Set(Array.from({ length: 30 }, (_, k) => shuffleWithin(groups, k, 'sub01')[0].join()));
    expect(seen.size).toBeGreaterThan(3);
  });
});

describe('rep linking', () => {
  it('links one-to-one by the share inside, with the inclusion script tie-break', () => {
    const found = [{ tStart: 1, tEnd: 2 }, { tStart: 1.2, tEnd: 1.8 }, { tStart: 5, tEnd: 6 }];
    const ann = [{ t_start: 0, t_end: 3 }, { t_start: 5.8, t_end: 9 }];
    const link = linkReps(found, ann);
    expect(link.get(0)).toBe(1); // both found reps lie fully inside; the larger found index wins the tie
    expect(link.has(1)).toBe(false); // only 0.2 of the third found rep lies inside the second annotation
  });
});
