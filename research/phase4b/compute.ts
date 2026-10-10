// Phase 4B compute step (analysis v2): per-participant (jump) and per-person (REHAB24-6) records, as fixed by
// research/protocols/jump_fatigue_v04.md and rehab24_6_v04.md with the deviations logged in
// research/protocols/phase4b_deviations.md. Statistics are in stats.py.
//
//   npx vite-node research/phase4b/compute.ts -- --labels shuffled --seed 7 --out <dir> [--inject]
//   npx vite-node research/phase4b/compute.ts -- --labels actual --out <dir>     (only through run.py)
//
// Inputs are exactly the frozen ones (research/phase4b/data.ts). With --labels shuffled, each participant's
// fresh and post-protocol labels (each person's correct and incorrect labels) are randomly reassigned among
// their own trials (reps), keeping the counts. --inject (development only, shuffled labels only) adds known
// shifts. --labels actual refuses to run unless the environment carries the SHA-256 of the current analysis
// freeze file, which run.py sets after verifying both freezes.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FeatureSpec, RepFeatures } from '../../src/biomechanics/catalog';
import { parseDetectorConfig } from '../../src/detection/config';
import { loadJumpSamples, loadRehabSets, type JumpTrial } from './data';
import {
  JUMP_SCORES, personalLooFolds, personalSplits, pooledStandardizedDifference, rankOf, scoreAgainst, shuffleWithin, specsFor,
  standardizedChange, type Cfg,
} from './scoring';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const labels = opt('labels');
const seed = Number(opt('seed') ?? 0);
const outArg = opt('out');
const inject = args.includes('--inject');
export const ANALYSIS_FREEZE = 'research/protocols/phase4b_analysis_freeze_v2.json';

if (labels !== 'shuffled' && labels !== 'actual') throw new Error('--labels shuffled|actual is required');
if (!outArg) throw new Error('--out is required');
const outDir: string = outArg;
if (labels === 'actual') {
  const want = process.env.PHASE4B_ANALYSIS_FREEZE_SHA256;
  const have = existsSync(join(ROOT, ANALYSIS_FREEZE)) ? createHash('sha256').update(readFileSync(join(ROOT, ANALYSIS_FREEZE))).digest('hex') : null;
  if (!want || want !== have) throw new Error('actual labels need the verified analysis freeze; run research/phase4b/run.py actual');
  if (inject) throw new Error('--inject is for shuffled-label development only');
}
if (labels === 'shuffled' && !Number.isInteger(seed)) throw new Error('--seed must be an integer');

const cfg: Cfg = parseDetectorConfig(JSON.parse(readFileSync(join(ROOT, 'public/breakingpoint_detector_config.json'), 'utf8')));

/** Development-only positive control: known shifts added to the second group's values. */
const INJECT_JUMP: Record<string, number> = { jumpHeight: -0.03, trunkLean: 5 };
const INJECT_REHAB: Record<string, number> = { trunkLean: 5, depth: 0.05 };
const injected = (f: RepFeatures, shift: Record<string, number>): RepFeatures => ({
  values: Object.fromEntries(Object.entries(f.values).map(([k, v]) => [k, typeof v === 'number' && k in shift ? v + shift[k] : v])),
  quality: f.quality,
});
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const meanOrNull = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? avg(v) : null;
};

// ------------------------------------------------------------------------------------------- jump
function measureChange(spec: FeatureSpec, fresh: readonly RepFeatures[], post: readonly RepFeatures[]) {
  // dz (v2, reported) and dz_v1 (superseded) are defined in scoring.ts standardizedChange.
  const c = standardizedChange(spec, fresh, post);
  const firstLast = (xs: number[]) => (xs.length >= 2 ? xs[xs.length - 1] - xs[0] : null);
  return {
    fresh: c.first, post: c.second, delta: c.delta, scale_fresh: c.scale_first, scale_post: c.scale_second, dz: c.dz, dz_v1: c.dz_v1,
    within_fresh_last_minus_first: firstLast(c.first), within_post_last_minus_first: firstLast(c.second),
  };
}

function jumpRecords() {
  return loadJumpSamples(ROOT).map((smp) => {
    const people = smp.people.map((p) => {
      let groups: JumpTrial[][] = [p.fresh, p.post];
      if (labels === 'shuffled') groups = shuffleWithin(groups.map((g) => [...g].sort((a, b) => a.order - b.order)), seed, p.subject);
      let [fresh, post] = groups.map((g) => [...g].sort((a, b) => a.order - b.order));
      if (inject) post = post.map((t) => ({ ...t, f: injected(t.f, INJECT_JUMP) }));
      return { ...p, fresh, post };
    });
    const records = people.map((p, idx) => {
      const allTrials = [...p.fresh, ...p.post];
      const measures: Record<string, unknown> = {};
      for (const spec of specsFor('cmj')) measures[spec.key] = measureChange(spec, p.fresh.map((t) => t.f), p.post.map((t) => t.f));
      const scores: Record<string, unknown> = {};
      for (const [label, remove] of Object.entries(JUMP_SCORES)) {
        const specs = specsFor('cmj', remove);
        const entry: Record<string, unknown> = {};
        const three = smp.threePlusThree && p.fresh.length === 3 && p.post.length === 3;
        if (three) {
          const sr = personalSplits(allTrials.map((t) => t.f), [0, 1, 2], specs, cfg);
          const valid = sr.splitMeans.filter((x): x is number => x !== null).sort((a, b) => a - b);
          entry.personal = {
            split_means: sr.splitMeans, true_split: sr.trueSplit, rank: rankOf(sr.splitMeans, sr.trueSplit), true_mean: sr.splitMeans[sr.trueSplit],
            median_of_20: valid.length ? (valid[Math.floor((valid.length - 1) / 2)] + valid[Math.ceil((valid.length - 1) / 2)]) / 2 : null,
          };
        }
        // Population baseline: every other participant's fresh trials in this sample.
        const others = people.filter((_, j) => j !== idx).flatMap((q) => q.fresh.map((t) => t.f));
        const popScores = scoreAgainst(others, allTrials.map((t) => t.f), specs, cfg);
        const fs = popScores.slice(0, p.fresh.length);
        const ps = popScores.slice(p.fresh.length);
        const pop: Record<string, unknown> = {
          fresh_scores: fs, post_scores: ps,
          delta: meanOrNull(ps) !== null && meanOrNull(fs) !== null ? (meanOrNull(ps) as number) - (meanOrNull(fs) as number) : null,
          within_fresh_last_minus_first: fs.length >= 2 && fs[0] !== null && fs[fs.length - 1] !== null ? (fs[fs.length - 1] as number) - (fs[0] as number) : null,
          within_post_last_minus_first: ps.length >= 2 && ps[0] !== null && ps[ps.length - 1] !== null ? (ps[ps.length - 1] as number) - (ps[0] as number) : null,
        };
        if (three) {
          const combos: number[][] = [];
          for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++) combos.push([a, b, c]);
          pop.split_means = combos.map((ref) => meanOrNull([0, 1, 2, 3, 4, 5].filter((i) => !ref.includes(i)).map((i) => popScores[i])));
          pop.rank = rankOf(pop.split_means as (number | null)[], 0);
        }
        entry.population = pop;
        scores[label] = entry;
      }
      const meanRise = (ts: JumpTrial[]) => avg(ts.map((t) => t.comRise));
      return {
        subject: p.subject, group: p.group, sex: p.sex, n_fresh: p.fresh.length, n_post: p.post.length,
        trials_fresh: p.fresh.map((t) => t.rid), trials_post: p.post.map((t) => t.rid), measures, scores,
        reference: { com_rise_delta: p.fresh.length && p.post.length ? meanRise(p.post) - meanRise(p.fresh) : null, forceplate_delta_cm: p.forceplateDeltaCm },
      };
    });
    return { sample: smp.name, path: smp.path, path_label: smp.pathLabel, view: smp.view, stream: smp.stream,
             three_plus_three: smp.threePlusThree, participants: records.length, records };
  });
}

// ------------------------------------------------------------------------------------------- REHAB24-6
function rehabRecords() {
  return loadRehabSets(ROOT).map((set) => {
    const people = set.people.map((p) => {
      let { correct, incorrect } = p;
      if (labels === 'shuffled') [correct, incorrect] = shuffleWithin([correct, incorrect], seed, `${set.name}:${p.person}`);
      if (inject) incorrect = incorrect.map((f) => injected(f, INJECT_REHAB));
      return { person: p.person, correct, incorrect };
    });
    const specs = specsFor(set.exercise);
    const records = people.map((p, idx) => {
      const folds = personalLooFolds(p.correct, p.incorrect, specs, cfg);
      const others = people.filter((_, j) => j !== idx).flatMap((q) => q.correct);
      const pop = scoreAgainst(others, [...p.correct, ...p.incorrect], specs, cfg);
      const stddiff: Record<string, number | null> = {};
      const stddiff_v1: Record<string, number | null> = {};
      for (const spec of specs) {
        // v2 (reported): over the person's pooled spread (label-free); v1 (superseded): over the correct-rep spread.
        const d = pooledStandardizedDifference(spec, p.correct, p.incorrect);
        stddiff[spec.key] = d.v2;
        stddiff_v1[spec.key] = d.v1;
      }
      return {
        person: p.person, n_correct: p.correct.length, n_incorrect: p.incorrect.length,
        personal_folds: folds,
        population: { correct: pop.slice(0, p.correct.length), incorrect: pop.slice(p.correct.length) },
        stddiff, stddiff_v1,
      };
    });
    return { set: set.name, key: set.key, exercise: set.exercise, persons: records.length, records };
  });
}

const result = {
  generated_by: 'research/phase4b/compute.ts (analysis v2)',
  labels, seed: labels === 'shuffled' ? seed : null, inject: inject ? { jump_post: INJECT_JUMP, rehab_incorrect: INJECT_REHAB } : null,
  jump: jumpRecords(),
  rehab: rehabRecords(),
};
mkdirSync(join(ROOT, outDir), { recursive: true });
writeFileSync(join(ROOT, outDir, 'records.json'), JSON.stringify(result));
console.log(`wrote ${outDir}/records.json (${labels}${labels === 'shuffled' ? `, seed ${seed}` : ''}${inject ? ', injected' : ''})`);
