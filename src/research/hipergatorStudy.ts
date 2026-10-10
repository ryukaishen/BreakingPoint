// The original synthetic validation study (UF HiPerGator, October 2026).
//
// The detector config (public/breakingpoint_detector_config.json) carries the held-out
// results the app shows: false-positive rate, detection rate, delays and per-scenario
// numbers. This file holds the remaining facts the research panel needs. Each is copied
// from results/VALIDATION_REPORT.md, results/hipergator_jobs.txt or results/provenance.json,
// and tests/study_constants.test.ts checks every value against those files.

/** Commit where the study's report, config and job records were finalised on GitHub. */
const STUDY_COMMIT = 'a30db5e4455dd4c83349e0c2fd2d2a138f0da9b0';
const REPO_URL = 'https://github.com/ryukaishen/BreakingPoint';
const permalink = (path: string) => `${REPO_URL}/blob/${STUDY_COMMIT}/${path}`;

export const HIPERGATOR_STUDY = {
  label: 'Synthetic Validation | UF HiPerGator | October 2026',
  /** VALIDATION_REPORT.md header. */
  reportGeneratedAt: '2026-10-04T11:16:01',
  cluster: 'UF HiPerGator',
  /** Slurm account and QOS, from the #SBATCH lines in hpc/sweep.slurm and hpc/finalize.slurm. */
  allocation: 'ai-workshop',
  sweepJob: { id: '44695919', tasks: 20, cpusPerTask: 8, elapsedSecondsMin: 30, elapsedSecondsMax: 59 },
  finalizeJob: { id: '44695920', elapsedSeconds: 37 },
  simulatedSessions: 100_000,
  selectionSessions: 50_000,
  heldOutSessions: 50_000,
  detectorSettings: 5_056,
  scoreVariants: 5,
  configurations: 25_280,
  /**
   * "Personal baseline vs population norm" table of the report. It was run on a separate
   * 20,000-session simulated set, so its detection rate (89.8%) differs from the held-out 89.6%.
   */
  personalVsPopulation: {
    evaluationSessions: 20_000,
    personal: { falsePositiveRate: 0.022, falsePositiveRateHighVariability: 0.017, detectionRate: 0.898 },
    population: { falsePositiveRate: 0.178, falsePositiveRateHighVariability: 0.305, detectionRate: 0.4 },
  },
  /** Robustness table, "noise_post_cal" row: measurement noise doubles after calibration. */
  noiseRisesAfterCalibration: { noiseMultiplier: 2, falsePositiveRate: 0.173 },
  links: {
    report: permalink('results/VALIDATION_REPORT.md'),
    config: permalink('results/breakingpoint_detector_config.json'),
    jobs: permalink('results/hipergator_jobs.txt'),
    repository: REPO_URL,
  },
} as const;

export interface ScenarioRow {
  /** Key in the config's validation.per_scenario. */
  key: string;
  /** Plain name shown in the app. */
  name: string;
  /** Name as printed in the report. */
  reportName: string;
  sessions: string;
  falseAlerts: string;
  detected: string;
  medianDelay: string;
}

/**
 * Held-out results per simulated scenario, exactly as printed in the report. The config
 * stores these rates rounded to four decimals, which can shift the last printed digit
 * (H: 0.9125 would print as 91.3%; the report prints 91.2%), so the app shows the report's text.
 */
export const PER_SCENARIO: readonly ScenarioRow[] = [
  { key: 'A_no_change', name: 'A · No change', reportName: 'A · No change', sessions: '6,200', falseAlerts: '1.9%', detected: '', medianDelay: '' },
  { key: 'B_isolated_bad_rep', name: 'B · One isolated bad rep', reportName: 'B · Isolated bad rep', sessions: '6,200', falseAlerts: '3.9%', detected: '', medianDelay: '' },
  { key: 'C_gradual_drift', name: 'C · Gradual change', reportName: 'C · Gradual fatigue drift', sessions: '6,300', falseAlerts: '', detected: '87.1%', medianDelay: '5.0' },
  { key: 'D_sudden_change', name: 'D · Sudden change', reportName: 'D · Sudden change', sessions: '6,300', falseAlerts: '', detected: '90.5%', medianDelay: '3.0' },
  { key: 'E_camera_noise', name: 'E · Camera noise', reportName: 'E · Camera noise', sessions: '6,200', falseAlerts: '1.3%', detected: '', medianDelay: '' },
  { key: 'F_landmark_dropout', name: 'F · Missing landmarks', reportName: 'F · Landmark dropout', sessions: '6,200', falseAlerts: '2.5%', detected: '', medianDelay: '' },
  { key: 'G_high_variability', name: 'G · High natural variability', reportName: 'G · High natural variability', sessions: '6,300', falseAlerts: '1.6%', detected: '', medianDelay: '' },
  { key: 'H_recovery', name: 'H · Change, then recovery', reportName: 'H · Drift then recovery', sessions: '6,300', falseAlerts: '', detected: '91.2%', medianDelay: '4.0' },
];

/** Recovery check (scenario H), exactly as printed in the report. */
export const RECOVERY_CHECK = { sessions: '2,259', spearman: '0.82', meanAbsoluteErrorPoints: '14.0', statusAgreement: '82.6%' } as const;
