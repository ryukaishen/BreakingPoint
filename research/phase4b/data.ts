// Phase 4B inputs, loaded exactly as fixed by the protocol freeze: the inclusion lists, the Phase 4A.5
// runs they hash (measurement values plus the app's quality values), and the lab references.
// Shared by compute.ts (the analysis) and calibration.ts (shuffled-label calibration).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExerciseType, RepFeatures } from '../../src/biomechanics/catalog';
import { linkReps } from './scoring';

const read = (root: string, p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));

export interface JumpTrial { rid: string; order: number; f: RepFeatures; comRise: number }
export interface JumpPerson { subject: string; group: string; sex: string; fresh: JumpTrial[]; post: JumpTrial[]; forceplateDeltaCm: number | null }
export interface JumpSample {
  name: string; path: 'A' | 'B'; pathLabel: string; view: 'advised' | 'side'; stream: string; threePlusThree: boolean; people: JumpPerson[];
}

/** The jump samples of protocol v04, with each participant's usable trials as labelled in the inclusion file. */
export function loadJumpSamples(root: string): JumpSample[] {
  const inc = read(root, 'research/protocols/phase4b_inclusion_v04.json');
  const refs: Record<string, { com_rise_per_leg: number; condition: string; trial: number }> = Object.fromEntries(
    read(root, 'data/processed/measurement/references/jump.json').trials.map((t: { recording: string }) => [t.recording, t]),
  );
  const parts = read(root, 'data/processed/measurement/references/participants.json');
  const J = inc.jump_fatigue;
  const runCache = new Map<string, Map<string, RepFeatures>>();
  const runFor = (variant: string, stream: string) => {
    const k = `${stream}/${variant}`;
    if (!runCache.has(k)) {
      const r = read(root, `data/processed/measurement/runs/jump/${stream}/${variant}__s0__seed0.json`);
      runCache.set(k, new Map(r.recordings.filter((x: { reps: unknown[] }) => x.reps.length === 1)
        .map((x: { recording: string; reps: { features: RepFeatures['values']; quality: RepFeatures['quality'] }[] }) =>
          [x.recording, { values: x.reps[0].features, quality: x.reps[0].quality }])));
    }
    return runCache.get(k)!;
  };
  const defs: { name: string; path: 'A' | 'B'; view: 'advised' | 'side'; participants: string[]; threePlusThree: boolean }[] = [];
  for (const path of ['B', 'A'] as const) {
    const adv = J.paths[path].views.advised.samples;
    defs.push({ name: 'primary', path, view: 'advised', participants: adv.primary_3_plus_3.participants, threePlusThree: true });
    defs.push({ name: 'same_participants', path, view: 'advised', participants: J.path_b_on_path_a_sample.participants, threePlusThree: true });
    defs.push({ name: 'at_least_2_plus_2', path, view: 'advised', participants: adv.at_least_2_plus_2.participants, threePlusThree: false });
    defs.push({ name: 'at_least_1_plus_1', path, view: 'advised', participants: adv.at_least_1_plus_1_person_means.participants, threePlusThree: false });
    defs.push({ name: 'side_3_plus_3', path, view: 'side', participants: J.paths[path].views.side.samples.primary_3_plus_3.participants, threePlusThree: true });
  }
  return defs.map((d) => {
    const view = J.paths[d.path].views[d.view];
    const run = runFor(J.paths[d.path].variant, view.stream);
    const people = d.participants.map((s: string) => {
      const u = view.usable_trials_by_participant[s];
      const mk = (rid: string): JumpTrial => {
        const r = refs[rid];
        const f = run.get(rid);
        if (!f) throw new Error(`${rid}: no single jump in ${view.stream}/${J.paths[d.path].variant}`);
        return { rid, order: (r.condition === 'fatigued' ? 3 : 0) + r.trial - 1, f, comRise: r.com_rise_per_leg };
      };
      const byOrder = (a: JumpTrial, b: JumpTrial) => a.order - b.order;
      const fp = parts[s];
      return {
        subject: s, group: fp.group, sex: fp.sex,
        fresh: u.non_fatigued.map(mk).sort(byOrder), post: u.fatigued.map(mk).sort(byOrder),
        forceplateDeltaCm: fp.jump_height_pre_cm != null && fp.jump_height_post_cm != null ? fp.jump_height_post_cm - fp.jump_height_pre_cm : null,
      };
    });
    return { name: d.name, path: d.path, pathLabel: J.paths[d.path].label, view: d.view, stream: view.stream, threePlusThree: d.threePlusThree, people };
  });
}

export interface RehabPerson { person: string; correct: RepFeatures[]; incorrect: RepFeatures[] }
export interface RehabSet { name: string; key: string; exercise: ExerciseType; people: RehabPerson[] }

/** The REHAB24-6 sets of protocol v04: linked, non-excluded reps of eligible people, labelled as annotated. */
export function loadRehabSets(root: string): RehabSet[] {
  const R = read(root, 'research/protocols/phase4b_inclusion_v04.json').rehab24_6;
  const defs: { name: string; key: string; exercise: ExerciseType; dropPersons: string[] }[] = [
    { name: 'squat_primary', key: 'ex6_squat/oblique35', exercise: 'squat', dropPersons: [] },
    { name: 'squat_without_person_2', key: 'ex6_squat/oblique35', exercise: 'squat', dropPersons: ['2'] },
    { name: 'squat_side', key: 'ex6_squat/side', exercise: 'squat', dropPersons: [] },
    { name: 'split_squat_side', key: 'ex5_lunge/side', exercise: 'lunge', dropPersons: [] },
  ];
  return defs.map((set) => {
    const [ex, view] = set.key.split('/');
    const index = read(root, `data/processed/landmarks/rehab/${ex}/${view}/index.json`);
    const runs = read(root, `data/processed/measurement/runs/rehab/${ex}/${view}/production__s0__seed0.json`);
    const byVideo = new Map(runs.recordings.map((r: { recording: string }) => [r.recording, r]));
    const eligible: string[] = R[set.key].eligible_for_personal_baseline.persons.filter((p: string) => !set.dropPersons.includes(p));
    const perPerson = new Map<string, RehabPerson>();
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
        const g = perPerson.get(person) ?? { person, correct: [], incorrect: [] };
        (a.correct ? g.correct : g.incorrect).push({ values: d.features, quality: d.quality });
        perPerson.set(person, g);
      });
    }
    // Linking must reproduce the frozen inclusion counts exactly.
    for (const [p, v] of Object.entries(R[set.key].per_person) as [string, { linked_correct: number; linked_incorrect: number }][]) {
      const lc = linkedCount.get(p) ?? { c: 0, i: 0 };
      if (lc.c !== v.linked_correct || lc.i !== v.linked_incorrect) throw new Error(`${set.key} person ${p}: linking differs from the inclusion file`);
    }
    return { name: set.name, key: set.key, exercise: set.exercise, people: eligible.map((p) => perPerson.get(p)!) };
  });
}
