// Every number the research panel shows about the original HiPerGator study must match
// the study's own files, and the real-world evaluation must show no numbers until it has
// results. Sources: results/VALIDATION_REPORT.md, results/hipergator_jobs.txt, the
// shipped config and hpc/*.slurm.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { HIPERGATOR_STUDY as S, PER_SCENARIO, RECOVERY_CHECK } from '../src/research/hipergatorStudy';
import { REAL_WORLD_REPORT, REAL_WORLD_SCOPE, REAL_WORLD_STUDIES } from '../src/research/realWorldStudies';
import { researchEvidence, studyHeadline } from '../src/research/studyHeadline';
import { parseDetectorConfig } from '../src/detection/config';
import { pct } from '../src/utils/format';

const report = readFileSync('results/VALIDATION_REPORT.md', 'utf8');
const config = JSON.parse(readFileSync('public/breakingpoint_detector_config.json', 'utf8'));
const v = config.validation;
const jobs = readFileSync('results/hipergator_jobs.txt', 'utf8')
  .split('\n')
  .slice(2)
  .map((l) => l.trim().split(/\s+/))
  .filter((r) => r.length >= 5);
const secs = (t: string) => t.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
const n = (x: number) => x.toLocaleString('en-US');

describe('HiPerGator study facts match the original files', () => {
  it('label and report date', () => {
    expect(S.label).toBe('Synthetic Validation | UF HiPerGator | October 2026');
    expect(report).toContain(`on ${S.reportGeneratedAt}.`);
    expect(config.generated_at).toBe(S.reportGeneratedAt);
  });

  it('sessions and configurations', () => {
    expect(report).toContain(
      `Simulated sessions: **${n(S.simulatedSessions)}** (${n(S.selectionSessions)} selection split / ${n(S.heldOutSessions)} held-out split)`,
    );
    expect(report).toContain(`Configurations evaluated: **${n(S.configurations)}** (${n(S.detectorSettings)} detector settings × ${S.scoreVariants} drift-score variants)`);
    expect([v.num_sessions, v.num_sessions_selection, v.num_sessions_holdout, v.num_configs_evaluated]).toEqual([
      S.simulatedSessions, S.selectionSessions, S.heldOutSessions, S.configurations,
    ]);
  });

  it('held-out headline numbers in the config read the same as the report', () => {
    expect(report).toContain(`| False-positive rate (no-change sessions A,B,E,F,G) | ${pct(v.false_positive_rate)} |`);
    expect(report).toContain(`| True-positive rate (drift sessions C,D,H) | ${pct(v.true_positive_rate)} |`);
    expect(report).toContain(`| Median detection delay (reps) | ${v.median_detection_delay.toFixed(1)} |`);
    expect([pct(v.false_positive_rate), pct(v.true_positive_rate), v.median_detection_delay]).toEqual(['2.2%', '89.6%', 4]);
    expect(report).toContain(`| B · Isolated bad rep | 6,200 | ${pct(v.per_scenario.B_isolated_bad_rep.false_positive_rate)} |`);
  });

  it('personal versus population baseline', () => {
    const p = S.personalVsPopulation;
    expect(report).toContain(
      `| Personal baseline (BreakingPoint) | ${pct(p.personal.falsePositiveRate)} | ${pct(p.personal.falsePositiveRateHighVariability)} | ${pct(p.personal.detectionRate)} |`,
    );
    expect(report).toContain(
      `| Population norm (universal rules) | ${pct(p.population.falsePositiveRate)} | ${pct(p.population.falsePositiveRateHighVariability)} | ${pct(p.population.detectionRate)} |`,
    );
    expect([pct(p.personal.falsePositiveRate), pct(p.population.falsePositiveRate)]).toEqual(['2.2%', '17.8%']);
    expect(readFileSync('hpc/finalize.slurm', 'utf8')).toContain(`EVAL_SESSIONS:-${p.evaluationSessions}`);
  });

  it('noise-after-calibration stress test', () => {
    const r = S.noiseRisesAfterCalibration;
    expect(report).toContain(`| noise_post_cal | ${r.noiseMultiplier} | ${pct(r.falsePositiveRate)} |`);
  });

  it('Slurm job records', () => {
    const sweep = jobs.filter((r) => new RegExp(`^${S.sweepJob.id}_\\d+$`).test(r[0]));
    expect(sweep).toHaveLength(S.sweepJob.tasks);
    expect(sweep.every((r) => r[2] === 'COMPLETED' && Number(r[4]) === S.sweepJob.cpusPerTask)).toBe(true);
    const el = sweep.map((r) => secs(r[3]));
    expect([Math.min(...el), Math.max(...el)]).toEqual([S.sweepJob.elapsedSecondsMin, S.sweepJob.elapsedSecondsMax]);
    const fin = jobs.find((r) => r[0] === S.finalizeJob.id)!;
    expect(fin[2]).toBe('COMPLETED');
    expect(secs(fin[3])).toBe(S.finalizeJob.elapsedSeconds);
    expect(v.compute_environment).toContain(S.finalizeJob.id);
  });

  it('allocation comes from the job scripts', () => {
    for (const f of ['hpc/sweep.slurm', 'hpc/finalize.slurm']) {
      const s = readFileSync(f, 'utf8');
      expect(s).toContain(`--account=${S.allocation}`);
      expect(s).toContain(`--qos=${S.allocation}`);
    }
  });

  it('links point at the study commit and at files that exist', () => {
    for (const [key, url] of Object.entries(S.links)) {
      expect(url.startsWith('https://github.com/ryukaishen/BreakingPoint'), key).toBe(true);
      if (key === 'repository') continue;
      expect(url, key).toContain('/blob/a30db5e4455dd4c83349e0c2fd2d2a138f0da9b0/');
      expect(existsSync(url.split('/a30db5e4455dd4c83349e0c2fd2d2a138f0da9b0/')[1])).toBe(true);
    }
  });

  it('per-scenario rows are the report lines, for every scenario in the config', () => {
    expect(PER_SCENARIO.map((r) => r.key).sort()).toEqual(Object.keys(v.per_scenario).sort());
    for (const r of PER_SCENARIO) {
      expect(report).toContain(`| ${[r.reportName, r.sessions, r.falseAlerts, r.detected, r.medianDelay].join(' | ')} |`);
      expect(n(v.per_scenario[r.key].n)).toBe(r.sessions);
    }
  });

  it('recovery check is the report text', () => {
    const r = RECOVERY_CHECK;
    expect(report).toContain(`- Sessions evaluated: ${r.sessions}`);
    expect(report).toContain(`- Spearman ρ (estimated vs true recovery): ${r.spearman}`);
    expect(report).toContain(`- Mean absolute error: ${r.meanAbsoluteErrorPoints} percentage points`);
    expect(report).toContain(`: ${r.statusAgreement}`);
  });

  it('confidence intervals the panel derives from the config read the same as the report', () => {
    const [f0, f1] = v.false_positive_rate_ci95;
    const [t0, t1] = v.true_positive_rate_ci95;
    expect(report).toContain(`| ${pct(v.false_positive_rate)} | ${pct(f0)} – ${pct(f1)} |`);
    expect(report).toContain(`| ${pct(v.true_positive_rate)} | ${pct(t0)} – ${pct(t1)} |`);
  });
});

describe('the landing page figures are the frozen study results', () => {
  const frozenRaw = readFileSync('results/breakingpoint_detector_config.json', 'utf8');
  const shippedRaw = readFileSync('public/breakingpoint_detector_config.json', 'utf8');
  const headline = studyHeadline(parseDetectorConfig(config).validation)!;

  it('the shipped config is the frozen study output, unchanged', () => {
    expect(shippedRaw.replace(/\r\n/g, '\n')).toBe(frozenRaw.replace(/\r\n/g, '\n'));
    expect(JSON.parse(frozenRaw).validation.reported_on).toBe('held-out evaluation split');
  });

  it('prints the held-out rates exactly as the report does', () => {
    const [sessions, falseAlerts, detected, delay] = headline.figures.map((f) => f.value);
    expect(report).toContain(`Simulated sessions: **${sessions}**`);
    expect(report).toContain(`| False-positive rate (no-change sessions A,B,E,F,G) | ${falseAlerts} |`);
    expect(report).toContain(`| True-positive rate (drift sessions C,D,H) | ${detected} |`);
    expect(report).toContain(`| Median detection delay (reps) | ${delay.replace(' reps', '.0')} |`);
    expect(report).toContain(`**${falseAlerts}** of no-change sessions and detected **${detected}** of drift sessions, with a median delay of **${delay.replace(' reps', '.0')} reps**`);
    expect(headline.figures.map((f) => f.value)).toEqual(['100,000', '2.2%', '89.6%', '4 reps']);
  });

  it('says the rates come from the held-out half', () => {
    expect(headline.heldOutSessions).toBe(S.heldOutSessions);
    expect(report).toContain(`${n(S.heldOutSessions)} held-out split`);
  });

  it('shows nothing until a config with the study has loaded', () => {
    expect(studyHeadline(undefined)).toBeNull();
    expect(studyHeadline({ numSessions: NaN })).toBeNull();
  });
});

describe('the research Overview figures are the frozen study results', () => {
  const figures = researchEvidence(parseDetectorConfig(config).validation)!;
  // The report's per-scenario rows: "| A · No change | 6,200 | 1.9% |  |  |". A row with a detection rate is a change scenario.
  const rows = [...report.matchAll(/^\| ([A-H]) · [^|]+\| ([\d,]+) \| ([^|]*)\| ([^|]*)\|/gm)].map((m) => ({
    id: m[1],
    n: Number(m[2].replace(/,/g, '')),
    changed: m[4].trim() !== '',
  }));
  const sum = (changed: boolean) => rows.filter((r) => r.changed === changed).reduce((a, r) => a + r.n, 0);

  it('shows the five held-out headline values, as the report prints them', () => {
    expect(figures.map((f) => f.value)).toEqual(['100,000', '50,000', '89.6%', '2.2%', '4 reps']);
    expect(report).toContain(`Simulated sessions: **${figures[0].value}** (${n(S.selectionSessions)} selection split / ${figures[1].value} held-out split)`);
    expect(report).toContain(`| True-positive rate (drift sessions C,D,H) | ${figures[2].value} |`);
    expect(report).toContain(`| False-positive rate (no-change sessions A,B,E,F,G) | ${figures[3].value} |`);
    expect(report).toContain(`| Median detection delay (reps) | ${figures[4].value.replace(' reps', '.0')} |`);
  });

  it('counts the change and no-change sessions as the report scenario rows add up', () => {
    expect(rows.map((r) => r.id).join('')).toBe('ABCDEFGH');
    expect(rows.filter((r) => r.changed).map((r) => r.id).join('')).toBe('CDH');
    expect(sum(true)).toBe(v.num_drift_sessions_holdout);
    expect(sum(false)).toBe(v.num_no_change_sessions_holdout);
    expect(sum(true) + sum(false)).toBe(S.heldOutSessions);
    expect(figures[2].detail).toContain(`Of the ${n(sum(true))} held-out sessions with a change`);
    expect(figures[3].detail).toContain(`Of the ${n(sum(false))} held-out sessions with no change`);
  });

  it('gives the report confidence intervals', () => {
    const [t0, t1] = v.true_positive_rate_ci95;
    const [f0, f1] = v.false_positive_rate_ci95;
    expect(figures[2].detail).toContain(`95% CI ${pct(t0)} to ${pct(t1)}`);
    expect(figures[3].detail).toContain(`95% CI ${pct(f0)} to ${pct(f1)}`);
    expect(report).toContain(`| ${figures[2].value} | ${pct(t0)} – ${pct(t1)} |`);
    expect(report).toContain(`| ${figures[3].value} | ${pct(f0)} – ${pct(f1)} |`);
  });

  it('shows nothing until a config with the study has loaded', () => {
    expect(researchEvidence(undefined)).toBeNull();
    expect(researchEvidence({ numSessions: 100_000 })).toBeNull();
  });
});

describe('real-world evaluation shows no results yet', () => {
  it('links its exploratory report at a pinned commit, and the report exists', () => {
    expect(REAL_WORLD_REPORT).toMatch(/^https:\/\/github\.com\/ryukaishen\/BreakingPoint\/blob\/[0-9a-f]{40}\/research\/results\/phase4b\/README\.md$/);
    expect(existsSync(REAL_WORLD_REPORT.split(/\/blob\/[0-9a-f]{40}\//)[1])).toBe(true);
    for (const s of REAL_WORLD_STUDIES) expect(s.status).toBe('exploratory');
  });

  it('has no results, and no study is marked complete', () => {
    for (const s of REAL_WORLD_STUDIES) {
      expect(s.results).toBeNull();
      expect(s.status).not.toBe('complete');
    }
  });

  it('contains no percentages or accuracy figures', () => {
    const text = JSON.stringify(REAL_WORLD_STUDIES) + REAL_WORLD_SCOPE;
    expect(text).not.toMatch(/\d\s?%|accuracy|AUC|sensitivity|specificity|F1/i);
  });

  it('keeps the two datasets and their licences apart', () => {
    const [jump, rehab] = REAL_WORLD_STUDIES;
    expect(jump.url).toBe('https://doi.org/10.6084/m9.figshare.28890545.v1');
    expect(jump.licence).toBe('CC BY 4.0');
    expect(rehab.url).toBe('https://zenodo.org/records/13305826');
    expect(rehab.licence).toMatch(/^CC BY-NC 4\.0/);
    expect(rehab.limits).toMatch(/not fatigue/);
  });
});
