// Phase 4B interval calibration (development only; never reads which split or rep labelling is real).
//
//   npx vite-node research/phase4b/calibration.ts -- --out <dir> --part enumeration|population|rehab
//       [--sample B/primary] [--inject] [--pop-replicates 2000] [--rehab-replicates 2000]
//
// Each participant's trials (each person's reps) are pooled as soon as they are loaded and ordered by a
// hash of their identifiers, so the labelling in the inclusion file is not carried into anything below:
//
//   enumeration  every label-free split of each participant's usable jumps into "fresh" and "post" groups of
//                the sample's sizes: change, standardized change (v1: fresh spread; v2: mean of the fresh and
//                post spreads) and personal-baseline rank. Exact null distributions: under random labelling
//                each split is equally likely.
//   population   population-baseline statistics for random splits (one per participant per replicate),
//                recomputed in full because each baseline uses the other participants. One sample per process.
//   rehab        personal AUC (v1 fold-averaged, v2 fold-paired), population AUC and standardized differences
//                (v1: correct-rep spread; v2: the person's pooled spread) under random relabelling within person.
//
// --inject adds the development positive-control shifts to the designated "post" jumps and "incorrect" reps.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FeatureSpec, RepFeatures } from '../../src/biomechanics/catalog';
import { parseDetectorConfig } from '../../src/detection/config';
import { loadJumpSamples, loadRehabSets, type JumpTrial } from './data';
import {
  JUMP_SCORES, aucFoldAveraged, aucFoldPaired, aucPairs, combinations, hashString, personalLooFolds, pooledStandardizedDifference,
  rankOf, rng, scoreAgainst, specsFor, standardizedChange, type Cfg,
} from './scoring';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const opt = (name: string, d?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : d;
};
const outArg = opt('out');
const part = opt('part');
if (!outArg || !part) throw new Error('--out and --part are required');
const outDir: string = outArg;
const onlySample = opt('sample');
const inject = args.includes('--inject');
const R_POP = Number(opt('pop-replicates', '2000'));
const R_REHAB = Number(opt('rehab-replicates', '2000'));
const SEED = Number(opt('seed', '424242'));
const cfg: Cfg = parseDetectorConfig(JSON.parse(readFileSync(join(ROOT, 'public/breakingpoint_detector_config.json'), 'utf8')));
const INJECT_JUMP: Record<string, number> = { jumpHeight: -0.03, trunkLean: 5 };
const INJECT_REHAB: Record<string, number> = { trunkLean: 5, depth: 0.05 };
const shifted = (f: RepFeatures, shift: Record<string, number>): RepFeatures => ({
  values: Object.fromEntries(Object.entries(f.values).map(([k, v]) => [k, typeof v === 'number' && k in shift ? v + shift[k] : v])),
  quality: f.quality,
});
mkdirSync(join(ROOT, outDir), { recursive: true });
const blobs: { name: string; shape: number[] }[] = [];
function writeBlob(name: string, rows: (number | null)[][]) {
  const n = rows[0]?.length ?? 0;
  const a = new Float32Array(rows.length * n);
  rows.forEach((r, i) => r.forEach((v, j) => (a[i * n + j] = v === null || !Number.isFinite(v) ? NaN : v)));
  writeFileSync(join(ROOT, outDir, `${name}.f32`), Buffer.from(a.buffer));
  blobs.push({ name, shape: [rows.length, n] });
}
const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const byHash = (a: JumpTrial, b: JumpTrial) => hashString(a.rid) - hashString(b.rid);

/** v1 standardized change: Δ over the app's spread of the "fresh" values. v2: Δ over the mean of the app's spread
 * of the fresh and of the post values, which flips sign exactly when the labels are swapped. */
function standardized(spec: FeatureSpec, fresh: readonly RepFeatures[], post: readonly RepFeatures[]) {
  const c = standardizedChange(spec, fresh, post); // the same definitions as the analysis (scoring.ts)
  return { delta: c.delta, dz1: c.dz_v1, dz2: c.dz };
}

const samples = loadJumpSamples(ROOT);
const index: Record<string, unknown> = { generated_by: 'research/phase4b/calibration.ts', part, sample: onlySample ?? null,
  inject: inject ? { jump_post: INJECT_JUMP, rehab_incorrect: INJECT_REHAB } : null, seed: SEED };

if (part === 'enumeration') {
  const KEYS = specsFor('cmj').map((s) => s.key);
  const enumeration = samples.map((smp) => ({
    sample: smp.name, path: smp.path, view: smp.view, three_plus_three: smp.threePlusThree,
    people: smp.people.map((p) => {
      const pool = [...p.fresh, ...p.post].sort(byHash); // labels dropped here; only the group sizes remain
      const nF = p.fresh.length;
      const combos = combinations(pool.length, nF);
      const delta: Record<string, (number | null)[]> = Object.fromEntries(KEYS.map((k) => [k, []]));
      const dz: Record<string, (number | null)[]> = Object.fromEntries(KEYS.map((k) => [k, []]));
      const dz2: Record<string, (number | null)[]> = Object.fromEntries(KEYS.map((k) => [k, []]));
      const rank: Record<string, (number | null)[]> = Object.fromEntries(Object.keys(JUMP_SCORES).map((s) => [s, []]));
      const trueMean: Record<string, (number | null)[]> = Object.fromEntries(Object.keys(JUMP_SCORES).map((s) => [s, []]));
      for (const c of combos) {
        const post = pool.map((_, i) => i).filter((i) => !c.includes(i));
        const fresh = c.map((i) => pool[i].f);
        const postF = post.map((i) => (inject ? shifted(pool[i].f, INJECT_JUMP) : pool[i].f));
        for (const spec of specsFor('cmj')) {
          const s = standardized(spec, fresh, postF);
          delta[spec.key].push(s.delta);
          dz[spec.key].push(s.dz1);
          dz2[spec.key].push(s.dz2);
        }
        if (smp.threePlusThree && pool.length === 6 && nF === 3) {
          // The designated split's rank among all 20 reference choices, on this split's data (injection shifts it).
          const reps = pool.map((t, i) => (post.includes(i) ? postF[post.indexOf(i)] : t.f));
          for (const [label, remove] of Object.entries(JUMP_SCORES)) {
            const specs = specsFor('cmj', remove);
            const means = combinations(6, 3).map((ref) => {
              const comp = [0, 1, 2, 3, 4, 5].filter((i) => !ref.includes(i));
              return mean(scoreAgainst(ref.map((i) => reps[i]), comp.map((i) => reps[i]), specs, cfg));
            });
            const t = combos.findIndex((x) => x.join() === c.join());
            rank[label].push(rankOf(means, t));
            trueMean[label].push(means[t]);
          }
        }
      }
      return { subject: p.subject, n_fresh: nF, n_total: pool.length, assignments: combos.length, delta, dz, dz2, rank, true_mean: trueMean };
    }),
  }));
  writeFileSync(join(ROOT, outDir, 'jump_enumeration.json'), JSON.stringify({ inject: inject ? INJECT_JUMP : null, samples: enumeration }));
  console.log('jump enumeration written');
} else if (part === 'population') {
  const popIndex = [];
  for (const smp of samples.filter((s) => !onlySample || `${s.path}/${s.name}` === onlySample)) {
    const pools = smp.people.map((p) => ({ pool: [...p.fresh, ...p.post].sort(byHash), nF: p.fresh.length }));
    const combosOf = pools.map((q) => combinations(q.pool.length, q.nF));
    const r = rng((SEED ^ hashString(`${smp.path}/${smp.name}`)) >>> 0);
    const deltaRows: Record<string, (number | null)[][]> = Object.fromEntries(Object.keys(JUMP_SCORES).map((s) => [s, []]));
    const rankRows: Record<string, (number | null)[][]> = Object.fromEntries(Object.keys(JUMP_SCORES).map((s) => [s, []]));
    for (let rep = 0; rep < R_POP; rep++) {
      const picks = combosOf.map((cs) => cs[Math.floor(r() * cs.length)]);
      const designated = pools.map((q, j) => ({
        fresh: picks[j].map((i) => q.pool[i].f),
        post: q.pool.map((_, i) => i).filter((i) => !picks[j].includes(i)).map((i) => (inject ? shifted(q.pool[i].f, INJECT_JUMP) : q.pool[i].f)),
      }));
      for (const [label, remove] of Object.entries(JUMP_SCORES)) {
        const specs = specsFor('cmj', remove);
        const dRow: (number | null)[] = [];
        const rRow: (number | null)[] = [];
        designated.forEach((dsg, j) => {
          const others = designated.filter((_, k) => k !== j).flatMap((o) => o.fresh);
          const all = [...dsg.fresh, ...dsg.post];
          const s = scoreAgainst(others, all, specs, cfg);
          const mf = mean(s.slice(0, dsg.fresh.length));
          const mp = mean(s.slice(dsg.fresh.length));
          dRow.push(mf !== null && mp !== null ? mp - mf : null);
          if (smp.threePlusThree && all.length === 6 && dsg.fresh.length === 3) {
            const means = combinations(6, 3).map((ref) => mean([0, 1, 2, 3, 4, 5].filter((i) => !ref.includes(i)).map((i) => s[i])));
            rRow.push(rankOf(means, 0)); // the designated fresh trials are positions 0 to 2 of `all`
          } else rRow.push(null);
        });
        deltaRows[label].push(dRow);
        rankRows[label].push(rRow);
      }
    }
    for (const label of Object.keys(JUMP_SCORES)) {
      writeBlob(`pop_${smp.path}_${smp.name}_${label}_delta`, deltaRows[label]);
      if (smp.threePlusThree) writeBlob(`pop_${smp.path}_${smp.name}_${label}_rank`, rankRows[label]);
    }
    popIndex.push({ sample: smp.name, path: smp.path, participants: smp.people.length, three_plus_three: smp.threePlusThree, replicates: R_POP });
    console.log(`population ${smp.path}/${smp.name}: ${R_POP} replicates`);
  }
  index.population = popIndex;
} else if (part === 'rehab') {
  const rehabIndex = [];
  for (const set of loadRehabSets(ROOT)) {
    const specs = specsFor(set.exercise);
    const r = rng((SEED ^ hashString(set.name)) >>> 0);
    const pools = set.people.map((p) => ({ pool: [...p.correct, ...p.incorrect], nC: p.correct.length }));
    const rows: Record<string, (number | null)[][]> = { aucA: [], aucB: [], aucPop: [] };
    for (const s of specs) {
      rows[`std_${s.key}`] = [];
      rows[`std2_${s.key}`] = [];
    }
    for (let rep = 0; rep < R_REHAB; rep++) {
      const designated = pools.map((q) => {
        const idx = q.pool.map((_, i) => i);
        for (let i = idx.length - 1; i > 0; i--) {
          const j = Math.floor(r() * (i + 1));
          [idx[i], idx[j]] = [idx[j], idx[i]];
        }
        const correct = idx.slice(0, q.nC).map((i) => q.pool[i]);
        const incorrect = idx.slice(q.nC).map((i) => (inject ? shifted(q.pool[i], INJECT_REHAB) : q.pool[i]));
        return { correct, incorrect };
      });
      const a: (number | null)[] = [];
      const b: (number | null)[] = [];
      const pop: (number | null)[] = [];
      const std: Record<string, (number | null)[]> = Object.fromEntries(specs.map((s) => [s.key, []]));
      const std2: Record<string, (number | null)[]> = Object.fromEntries(specs.map((s) => [s.key, []]));
      designated.forEach((d, j) => {
        const folds = personalLooFolds(d.correct, d.incorrect, specs, cfg);
        a.push(aucFoldAveraged(folds));
        b.push(aucFoldPaired(folds));
        const others = designated.filter((_, k) => k !== j).flatMap((o) => o.correct);
        const ps = scoreAgainst(others, [...d.correct, ...d.incorrect], specs, cfg);
        pop.push(aucPairs(ps.slice(d.correct.length), ps.slice(0, d.correct.length)));
        for (const spec of specs) {
          const sd = pooledStandardizedDifference(spec, d.correct, d.incorrect); // the same definitions as the analysis
          std[spec.key].push(sd.v1);
          std2[spec.key].push(sd.v2);
        }
      });
      rows.aucA.push(a);
      rows.aucB.push(b);
      rows.aucPop.push(pop);
      for (const s of specs) {
        rows[`std_${s.key}`].push(std[s.key]);
        rows[`std2_${s.key}`].push(std2[s.key]);
      }
    }
    for (const [k, v] of Object.entries(rows)) writeBlob(`rehab_${set.name}_${k}`, v);
    rehabIndex.push({ set: set.name, exercise: set.exercise, persons: set.people.length,
                      n_correct: set.people.map((p) => p.correct.length), n_incorrect: set.people.map((p) => p.incorrect.length),
                      measurements: specs.map((s) => s.key), replicates: R_REHAB });
    console.log(`rehab ${set.name}: ${R_REHAB} replicates`);
  }
  index.rehab = rehabIndex;
} else throw new Error('--part must be enumeration, population or rehab');

index.blobs = blobs;
const tag = part === 'population' && onlySample ? `population_${onlySample.replace('/', '_')}` : part;
writeFileSync(join(ROOT, outDir, `index_${tag}.json`), JSON.stringify(index, null, 1));
console.log(`wrote ${outDir}/index_${tag}.json`);
