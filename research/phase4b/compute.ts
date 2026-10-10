// Phase 4B compute step: per-participant (jump) and per-person (REHAB24-6) records, as fixed by
// research/protocols/jump_fatigue_v04.md and rehab24_6_v04.md. Statistics are in stats.py.
//
//   npx vite-node research/phase4b/compute.ts -- --labels shuffled --seed 7 --out <dir> [--inject]
//   npx vite-node research/phase4b/compute.ts -- --labels actual --out <dir>     (only through run.py)
//
// Inputs are exactly the frozen ones: the inclusion lists, the Phase 4A.5 runs and references they
// hash, and the shipped detector config. With --labels shuffled, each participant's fresh and
// post-protocol labels (each person's correct and incorrect labels) are randomly reassigned among their
// own trials (reps), keeping the counts. --inject (development only, shuffled labels only) adds known
// shifts to check the analysis finds them. --labels actual refuses to run unless the environment carries
// the SHA-256 of research/protocols/phase4b_analysis_freeze.json, which run.py sets after verifying it.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExerciseType, RepFeatures } from '../../src/biomechanics/catalog';
import { parseDetectorConfig } from '../../src/detection/config';
import {
  JUMP_SCORES, appScale, linkReps, personalSplits, rankOf, scoreAgainst, shuffleWithin, specsFor, type Cfg,
} from './scoring';

const ROOT = process.cwd();
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const labels = opt('labels');
const seed = Number(opt('seed') ?? 0);
const outDir = opt('out');
const inject = args.includes('--inject');
const FREEZE = 'research/protocols/phase4b_analysis_freeze.json';

if (labels !== 'shuffled' && labels !== 'actual') throw new Error('--labels shuffled|actual is required');
if (!outDir) throw new Error('--out is required');
if (labels === 'actual') {
  const want = process.env.PHASE4B_ANALYSIS_FREEZE_SHA256;
  const have = existsSync(join(ROOT, FREEZE)) ? createHash('sha256').update(readFileSync(join(ROOT, FREEZE))).digest('hex') : null;
  if (!want || want !== have) throw new Error('actual labels need the verified analysis freeze; run research/phase4b/run.py actual');
  if (inject) throw new Error('--inject is for shuffled-label development only');
}
if (labels === 'shuffled' && !Number.isInteger(seed)) throw new Error('--seed must be an integer');

const cfg: Cfg = parseDetectorConfig(read('public/breakingpoint_detector_config.json'));
const inc = read('research/protocols/phase4b_inclusion_v04.json');

/** Development-only positive control: known shifts added to the second group's values. */
const INJECT_JUMP: Record<string, number> = { jumpHeight: -0.03, trunkLean: 5 };
const INJECT_REHAB: Record<string, number> = { trunkLean: 5, depth: 0.05 };
const injected = (f: RepFeatures, shift: Record<string, number>): RepFeatures => ({
  values: Object.fromEntries(Object.entries(f.values).map(([k, v]) => [k, typeof v === 'number' && k in shift ? v + shift[k] : v])),
  quality: f.quality,
});

// ------------------------------------------------------------------------------------------- jump
interface Trial { rid: string; order: number; f: RepFeatures; comRise: number }

function jumpRecords() {
  const refs: Record<string, { com_rise_per_leg: number; condition: string; trial: number }> = Object.fromEntries(
    read('data/processed/measurement/references/jump.json').trials.map((t: { recording: string }) => [t.recording, t]),
  );
  const parts = read('data/processed/measurement/references/participants.json');
  const J = inc.jump_fatigue;
  const runCache = new Map<string, Map<string, RepFeatures>>();
  const runFor = (variant: string, stream: string) => {
    const k = `${stream}/${variant}`;
    if (!runCache.has(k)) {
      const r = read(`data/processed/measurement/runs/jump/${stream}/${variant}__s0__seed0.json`);
      runCache.set(k, new Map(r.recordings.filter((x: { reps: unknown[] }) => x.reps.length === 1)
        .map((x: { recording: string; reps: { features: RepFeatures['values']; quality: RepFeatures['quality'] }[] }) =>
          [x.recording, { values: x.reps[0].features, quality: x.reps[0].quality }])));
    }
    return runCache.get(k)!;
  };
  const samples: { name: string; path: 'A' | 'B'; view: 'advised' | 'side'; participants: string[]; threePlusThree: boolean }[] = [];
  for (const path of ['B', 'A'] as const) {
    const adv = J.paths[path].views.advised.samples;
    samples.push({ name: 'primary', path, view: 'advised', participants: adv.primary_3_plus_3.participants, threePlusThree: true });
    samples.push({ name: 'same_participants', path, view: 'advised', participants: J.path_b_on_path_a_sample.participants, threePlusThree: true });
    samples.push({ name: 'at_least_2_plus_2', path, view: 'advised', participants: adv.at_least_2_plus_2.participants, threePlusThree: false });
    samples.push({ name: 'at_least_1_plus_1', path, view: 'advised', participants: adv.at_least_1_plus_1_person_means.participants, threePlusThree: false });
    samples.push({ name: 'side_3_plus_3', path, view: 'side', participants: J.paths[path].views.side.samples.primary_3_plus_3.participants, threePlusThree: true });
  }
  const out = [];
  for (const smp of samples) {
    const view = J.paths[smp.path].views[smp.view];
    const run = runFor(J.paths[smp.path].variant, view.stream);
    // Labelled trials per participant (actual, or shuffled within the participant).
    const people = smp.participants.map((s: string) => {
      const u = view.usable_trials_by_participant[s];
      const mk = (rid: string): Trial => {
        const r = refs[rid];
        const f = run.get(rid);
        if (!f) throw new Error(`${rid}: no single jump in ${view.stream}/${J.paths[smp.path].variant}`);
        return { rid, order: (r.condition === 'fatigued' ? 3 : 0) + r.trial - 1, f, comRise: r.com_rise_per_leg };
      };
      let groups: Trial[][] = [u.non_fatigued.map(mk), u.fatigued.map(mk)];
      if (labels === 'shuffled') {
        const sorted = groups.map((g) => [...g].sort((a, b) => a.order - b.order));
        groups = shuffleWithin(sorted, seed, s);
      }
      let [fresh, post] = groups.map((g) => [...g].sort((a, b) => a.order - b.order));
      if (inject) post = post.map((t) => ({ ...t, f: injected(t.f, INJECT_JUMP) }));
      return { subject: s, fresh, post };
    });
    const records = people.map((p, idx) => {
      const allTrials = [...p.fresh, ...p.post];
      const measures: Record<string, unknown> = {};
      for (const spec of specsFor('cmj')) {
        const vals = (ts: Trial[]) => ts.map((t) => t.f.values[spec.key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
        const fv = vals(p.fresh);
        const pv = vals(p.post);
        const m = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
        const delta = fv.length && pv.length ? (m(pv) as number) - (m(fv) as number) : null;
        const scale = appScale(fv, spec);
        const firstLast = (xs: number[]) => (xs.length >= 2 ? xs[xs.length - 1] - xs[0] : null);
        measures[spec.key] = {
          fresh: fv, post: pv, delta, scale, dz: delta !== null && scale ? delta / scale : null,
          within_fresh_last_minus_first: firstLast(fv), within_post_last_minus_first: firstLast(pv),
        };
      }
      const scores: Record<string, unknown> = {};
      for (const [label, remove] of Object.entries(JUMP_SCORES)) {
        const specs = specsFor('cmj', remove);
        const entry: Record<string, unknown> = {};
        if (smp.threePlusThree && p.fresh.length === 3 && p.post.length === 3) {
          const reps = allTrials.map((t) => t.f);
          const sr = personalSplits(reps, [0, 1, 2], specs, cfg);
          const valid = sr.splitMeans.filter((x): x is number => x !== null).sort((a, b) => a - b);
          entry.personal = {
            split_means: sr.splitMeans, true_split: sr.trueSplit, rank: rankOf(sr.splitMeans, sr.trueSplit),
            true_mean: sr.splitMeans[sr.trueSplit], median_of_20: valid.length ? valid[Math.floor((valid.length - 1) / 2)] / 2 + valid[Math.ceil((valid.length - 1) / 2)] / 2 : null,
          };
        }
        // Population baseline: every other participant's fresh trials in this sample.
        const others = people.filter((_, j) => j !== idx).flatMap((q) => q.fresh.map((t) => t.f));
        const popScores = scoreAgainst(others, allTrials.map((t) => t.f), specs, cfg);
        const fs = popScores.slice(0, p.fresh.length);
        const ps = popScores.slice(p.fresh.length);
        const mean = (xs: (number | null)[]) => {
          const v = xs.filter((x): x is number => x !== null);
          return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
        };
        const pop: Record<string, unknown> = {
          fresh_scores: fs, post_scores: ps,
          delta: mean(ps) !== null && mean(fs) !== null ? (mean(ps) as number) - (mean(fs) as number) : null,
          within_fresh_last_minus_first: fs.length >= 2 && fs[0] !== null && fs[fs.length - 1] !== null ? (fs[fs.length - 1] as number) - (fs[0] as number) : null,
          within_post_last_minus_first: ps.length >= 2 && ps[0] !== null && ps[ps.length - 1] !== null ? (ps[ps.length - 1] as number) - (ps[0] as number) : null,
        };
        if (smp.threePlusThree && p.fresh.length === 3 && p.post.length === 3) {
          // Same 20 splits under fixed population scores: mean score of the comparison set.
          const combos: number[][] = [];
          for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) for (let c = b + 1; c < 6; c++) combos.push([a, b, c]);
          const splitMeans = combos.map((ref) => mean([0, 1, 2, 3, 4, 5].filter((i) => !ref.includes(i)).map((i) => popScores[i])));
          const t = combos.findIndex((c) => c.join(',') === '0,1,2');
          pop.split_means = splitMeans;
          pop.rank = rankOf(splitMeans, t);
        }
        entry.population = pop;
        scores[label] = entry;
      }
      const meanRise = (ts: Trial[]) => ts.reduce((a, t) => a + t.comRise, 0) / ts.length;
      const fp = parts[p.subject];
      return {
        subject: p.subject, group: fp.group, sex: fp.sex,
        n_fresh: p.fresh.length, n_post: p.post.length,
        trials_fresh: p.fresh.map((t) => t.rid), trials_post: p.post.map((t) => t.rid),
        measures, scores,
        reference: {
          com_rise_delta: p.fresh.length && p.post.length ? meanRise(p.post) - meanRise(p.fresh) : null,
          forceplate_delta_cm: fp.jump_height_pre_cm != null && fp.jump_height_post_cm != null ? fp.jump_height_post_cm - fp.jump_height_pre_cm : null,
        },
      };
    });
    out.push({ sample: smp.name, path: smp.path, path_label: J.paths[smp.path].label, view: smp.view, stream: view.stream,
               three_plus_three: smp.threePlusThree, participants: records.length, records });
  }
  return out;
}

// ------------------------------------------------------------------------------------------- REHAB24-6
function rehabRecords() {
  const R = inc.rehab24_6;
  const sets: { name: string; key: string; exercise: ExerciseType; dropPersons: string[] }[] = [
    { name: 'squat_primary', key: 'ex6_squat/oblique35', exercise: 'squat', dropPersons: [] },
    { name: 'squat_without_person_2', key: 'ex6_squat/oblique35', exercise: 'squat', dropPersons: ['2'] },
    { name: 'squat_side', key: 'ex6_squat/side', exercise: 'squat', dropPersons: [] },
    { name: 'split_squat_side', key: 'ex5_lunge/side', exercise: 'lunge', dropPersons: [] },
  ];
  const out = [];
  for (const set of sets) {
    const [ex, view] = set.key.split('/');
    const index = read(`data/processed/landmarks/rehab/${ex}/${view}/index.json`);
    const runs = read(`data/processed/measurement/runs/rehab/${ex}/${view}/production__s0__seed0.json`);
    const byVideo = new Map(runs.recordings.map((r: { recording: string }) => [r.recording, r]));
    const eligible: string[] = R[set.key].eligible_for_personal_baseline.persons.filter((p: string) => !set.dropPersons.includes(p));
    const perPerson = new Map<string, { correct: RepFeatures[]; incorrect: RepFeatures[] }>();
    const linkedCount = new Map<string, { c: number; i: number }>();
    for (const m of index.recordings) {
      const person = String(m.person);
      const dets = (byVideo.get(m.recording) as { reps: { tStart: number; tEnd: number; features: RepFeatures['values']; quality: RepFeatures['quality'] }[] }).reps;
      const link = linkReps(dets, m.reps);
      m.reps.forEach((a: { mocap_error: boolean; correct: boolean }, j: number) => {
        if (a.mocap_error || !link.has(j)) return;
        const d = dets[link.get(j)!];
        const lc = linkedCount.get(person) ?? { c: 0, i: 0 };
        if (a.correct) lc.c++;
        else lc.i++;
        linkedCount.set(person, lc);
        if (!eligible.includes(person)) return;
        const g = perPerson.get(person) ?? { correct: [], incorrect: [] };
        (a.correct ? g.correct : g.incorrect).push({ values: d.features, quality: d.quality });
        perPerson.set(person, g);
      });
    }
    // Linking must reproduce the frozen inclusion counts exactly.
    for (const [p, v] of Object.entries(R[set.key].per_person) as [string, { linked_correct: number; linked_incorrect: number }][]) {
      const lc = linkedCount.get(p) ?? { c: 0, i: 0 };
      if (lc.c !== v.linked_correct || lc.i !== v.linked_incorrect) throw new Error(`${set.key} person ${p}: linking differs from the inclusion file`);
    }
    // Labels: actual, or shuffled within the person.
    const people = eligible.map((p) => {
      let { correct, incorrect } = perPerson.get(p)!;
      if (labels === 'shuffled') [correct, incorrect] = shuffleWithin([correct, incorrect], seed, `${set.name}:${p}`);
      if (inject) incorrect = incorrect.map((f) => injected(f, INJECT_REHAB));
      return { person: p, correct, incorrect };
    });
    const specs = specsFor(set.exercise);
    const records = people.map((p, idx) => {
      // Personal baseline, leave one correct rep out.
      const heldout: (number | null)[] = [];
      const incSum = p.incorrect.map(() => 0);
      const incN = p.incorrect.map(() => 0);
      p.correct.forEach((c, k) => {
        const ref = p.correct.filter((_, j) => j !== k);
        const s = scoreAgainst(ref, [c, ...p.incorrect], specs, cfg);
        heldout.push(s[0]);
        s.slice(1).forEach((v, j) => {
          if (v !== null) {
            incSum[j] += v;
            incN[j] += 1;
          }
        });
      });
      const others = people.filter((_, j) => j !== idx).flatMap((q) => q.correct);
      const pop = scoreAgainst(others, [...p.correct, ...p.incorrect], specs, cfg);
      const stddiff: Record<string, number | null> = {};
      for (const spec of specs) {
        const v = (fs: RepFeatures[]) => fs.map((f) => f.values[spec.key]).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
        const cv = v(p.correct);
        const iv = v(p.incorrect);
        const sc = appScale(cv, spec);
        const m = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
        stddiff[spec.key] = cv.length && iv.length && sc ? (m(iv) - m(cv)) / sc : null;
      }
      return {
        person: p.person, n_correct: p.correct.length, n_incorrect: p.incorrect.length,
        personal: { heldout_correct: heldout, incorrect_mean_over_folds: incSum.map((s, j) => (incN[j] ? s / incN[j] : null)) },
        population: { correct: pop.slice(0, p.correct.length), incorrect: pop.slice(p.correct.length) },
        stddiff,
      };
    });
    out.push({ set: set.name, key: set.key, exercise: set.exercise, persons: records.length, records });
  }
  return out;
}

const result = {
  generated_by: 'research/phase4b/compute.ts',
  labels, seed: labels === 'shuffled' ? seed : null, inject: inject ? { jump_post: INJECT_JUMP, rehab_incorrect: INJECT_REHAB } : null,
  jump: jumpRecords(),
  rehab: rehabRecords(),
};
mkdirSync(join(ROOT, outDir), { recursive: true });
writeFileSync(join(ROOT, outDir, 'records.json'), JSON.stringify(result));
console.log(`wrote ${outDir}/records.json (${labels}${labels === 'shuffled' ? `, seed ${seed}` : ''}${inject ? ', injected' : ''})`);
