// Real-world evaluation: external human-movement datasets, kept separate from the
// synthetic HiPerGator study. This file describes what is being evaluated. It holds no
// results: numbers appear here only after an analysis is complete and has been reviewed,
// and they are never combined with the synthetic study's numbers.
// tests/study_constants.test.ts enforces that.

export type StudyStatus = 'planned' | 'in progress' | 'complete';

export interface RealWorldStudy {
  id: string;
  name: string;
  source: string;
  url: string;
  licence: string;
  /** What the dataset contains, as described by its authors. */
  contents: string;
  /** What BreakingPoint uses from it. */
  uses: string;
  question: string;
  limits: string;
  status: StudyStatus;
  statusNote: string;
  /** Present only once the analysis is complete and reviewed. */
  results: null;
}

export const REAL_WORLD_STUDIES: readonly RealWorldStudy[] = [
  {
    id: 'jump-fatigue',
    name: 'Fatigued and non-fatigued jump-landing motion capture',
    source: 'Calisti, Mohr and Federolf, figshare (2025); described in Scientific Data (2025)',
    url: 'https://doi.org/10.6084/m9.figshare.28890545.v1',
    licence: 'CC BY 4.0',
    contents: 'Marker-based motion capture of six jump-landing tasks, recorded before and after a fatigue protocol, from 43 participants.',
    uses: 'The countermovement jumps: 3 fresh and 3 fatigued jumps per person.',
    question:
      "Scored against each person's own fresh jumps, do BreakingPoint's jump measurements separate the same person's fatigued jumps from their fresh ones?",
    limits:
      'Each person has only 3 fresh jumps, fewer than the 4 the app needs to learn your usual form, so the app’s alert cannot be tested here. Fresh jumps were always recorded first, so fatigue and the order of the jumps cannot be told apart. The analysis is exploratory.',
    status: 'in progress',
    statusNote: 'Data downloaded and its file structure inspected. Analysis not run yet.',
    results: null,
  },
  {
    id: 'rehab24-6',
    name: 'REHAB24-6',
    source: 'Černek, Sedmidubsky and Budikova, Zenodo (2024); SISAP 2024',
    url: 'https://zenodo.org/records/13305826',
    licence: 'CC BY-NC 4.0 (non-commercial research only)',
    contents: 'Motion capture and video of 10 people doing 6 rehabilitation exercises, with every repetition marked as correct or incorrect.',
    uses: 'The squats and lunges, from the 3D joint positions and the repetition annotations.',
    question:
      "How well does BreakingPoint's rep counting find the annotated reps, and do incorrect reps score further from a person's usual form than their correct ones?",
    limits: 'Incorrect reps were performed on purpose with technique errors. They are not fatigue, and the results say nothing about fatigue.',
    status: 'in progress',
    statusNote: 'Data downloaded and its file structure inspected. Analysis not run yet.',
    results: null,
  },
];

/** What both evaluations can and cannot show. */
export const REAL_WORLD_SCOPE =
  'Both datasets are run through BreakingPoint’s own measurement and scoring code, using motion-capture positions in place of camera tracking. That tests the measurements and the scoring offline. It does not test how well MediaPipe tracks people in real video; that needs a separate evaluation on recorded camera footage, which is planned next.';
