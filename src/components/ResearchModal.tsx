import { useEffect, useState } from 'react';
import { exerciseLabel, featureSpecs } from '../biomechanics/catalog';
import type { DetectorConfig } from '../detection/config';
import { HIPERGATOR_STUDY, PER_SCENARIO, RECOVERY_CHECK } from '../research/hipergatorStudy';
import { REAL_WORLD_SCOPE, REAL_WORLD_STUDIES } from '../research/realWorldStudies';
import { fmt, pct } from '../utils/format';
import { useDialog } from '../utils/hooks';
import { Close } from './Icons';

export type ResearchTab = 'method' | 'lab' | 'realworld' | 'science' | 'privacy';

interface Props {
  config: DetectorConfig;
  initialTab?: ResearchTab;
  onClose: () => void;
}

/** Figures shown straight away: the easiest evidence to read. */
const MAIN_FIGURES: [string, string][] = [
  ['personal_vs_population', 'False alerts and detection with a personal baseline vs one population norm (separate 20,000-session simulated set)'],
  ['scenario_examples', 'Example simulated sessions: where the change really started, and where the detector alerted'],
  ['detection_tradeoff', 'Every tested configuration: false-alert rate against detection delay'],
];

/** Figures for readers who want the detail. */
const TECHNICAL_FIGURES: [string, string][] = [
  ['detection_by_severity', 'Detection rate by the size of the simulated change'],
  ['noise_robustness', 'Effect of camera measurement noise'],
  ['noise_shift_stress_test', 'Stress test: measurement noise rises after calibration'],
  ['outlier_robustness', 'Effect of isolated bad reps'],
  ['dropout_robustness', 'Effect of missing or low-confidence landmarks'],
  ['changepoint_accuracy', 'Estimated vs true start of the change (CUSUM estimate)'],
  ['parameter_heatmap', 'EWMA and CUSUM parameter heatmaps'],
  ['ablation', 'Detector families and score variants compared'],
];

const ExternalLink = ({ href, children }: { href: string; children: string }) => (
  <a className="link-btn" href={href} target="_blank" rel="noopener noreferrer">
    {children}
  </a>
);

const MOVEMENTS = ['squat', 'cmj', 'lunge'] as const;

function Method({ c }: { c: DetectorConfig }) {
  const clip = c.outlierClip;
  const oneRepRise = clip !== null ? c.ewmaAlpha * clip : null;
  const oneRepTrigger = oneRepRise !== null ? (c.breakpointThreshold - oneRepRise) / (1 - c.ewmaAlpha) : null;
  const perScenario = (c.validation?.per_scenario ?? {}) as Record<string, { false_positive_rate?: number }>;
  const isolatedBadRep = perScenario.B_isolated_bad_rep?.false_positive_rate;
  return (
    <div className="prose">
      <h3 style={{ marginTop: 0 }}>In plain words</h3>
      <p>
        BreakingPoint learns how you move when you're fresh, then tracks how your form changes during a workout. For each rep it measures things such as depth,
        joint angles, tempo and trunk lean, compares them with your usual form, and combines the differences into one <b>Form Change Score</b>. A higher score
        means the rep is more different from your usual form, in either direction. It does not mean worse form, and it does not measure fatigue or injury risk.
        When high scores keep coming, the app triggers an alert and names the measurements that changed.
      </p>

      <h3>1 · Sport, protocol, movement</h3>
      <p>
        A sport picks a repeatable movement to track: a squat, a countermovement jump, or a forward lunge (beta). Only rep detection and the measurements depend
        on the movement. Learning your usual form, the score and the alert rules are the same for every sport.
      </p>
      <h3>2 · Pose to rep measurements</h3>
      <p>
        MediaPipe Pose Landmarker finds 33 body landmarks in each video frame, on your device. A One Euro filter smooths them. Reps are found from the hip's drop,
        measured in units of your own leg length. Every measurement carries a quality score from how clearly the camera saw the landmarks behind it.
      </p>
      <ul>
        {MOVEMENTS.map((ex) => (
          <li key={ex}>
            <b>{exerciseLabel(ex)}</b>: {featureSpecs(ex).map((s) => s.label).join(', ')}.
          </li>
        ))}
      </ul>
      <h3>3 · Your usual form (personal baseline)</h3>
      <code className="formula">{`center_i = median(calibration reps)
scale_i  = max( SD_i , 1.4826·MAD_i , absFloor_i , relFloor_i·|median_i| )`}</code>
      <p>The floors stand for the smallest change a single camera can measure reliably, so a very consistent athlete is not flagged for tiny wobbles.</p>
      <h3>4 · Form Change Score (technical name: drift score)</h3>
      <code className="formula">{`z_i   = clip( (x_i − center_i) / scale_i , ±${c.zClip} )
score = sqrt( Σ w_i·z_i² / Σ w_i )      w_i = group weight × landmark confidence`}</code>
      <p>
        The score is a root mean square, so a change in either direction raises it: a deeper squat counts as much as a shallower one. Measurements with
        confidence below {c.qualityMin} are{' '}
        {c.missingHandling === 'drop' ? 'left out' : c.missingHandling === 'impute' ? 'treated as unchanged (z = 0)' : 'reason enough to skip the rep'}. A rep
        covering less than {pct(c.minCoverage, 0)} of the measurement weight is <i>not scored</i>, rather than reported with false precision.
      </p>
      <h3>5 · How much your fresh reps vary</h3>
      <p>
        Leave-one-out over the calibration reps measures how far your own fresh reps fall from your usual form: μ₀ is the mean and σ₀ the standard deviation of
        those scores, within sanity bounds. Each new rep is standardized, <code>s = (score − μ₀)/σ₀</code>, and capped at ±{c.outlierClip ?? '∞'}.
      </p>
      <h3>6 · Sequential change detection</h3>
      <code className="formula">{`EWMA   Z_t = α·s_t + (1−α)·Z_{t−1}            α = ${c.ewmaAlpha}
CUSUM  C_t = max(0, C_{t−1} + s_t − k)         k = ${c.cusumK}, h = ${c.cusumH}
mode   ${c.mode}   ·   warning ${c.warningThreshold}σ   ·   alert ${c.breakpointThreshold}σ   ·   ${
        c.minimumPersistentReps > 0 ? `persistence ≥ ${c.minimumPersistentReps} reps` : 'no persistence rule (m = 0)'
      }`}</code>
      <p>
        {c.mode === 'ewma'
          ? 'In the active settings the alert uses the EWMA alone. The CUSUM runs alongside it only to estimate when the change began.'
          : c.mode === 'cusum'
            ? 'In the active settings the alert uses the CUSUM.'
            : c.mode === 'combined'
              ? 'In the active settings the alert needs both the EWMA and the CUSUM.'
              : 'In the active settings the alert needs consecutive reps above the line.'}{' '}
        That start estimate is the first rep of the current CUSUM run (Page's classic change-point estimator). So the app reports both when it became confident
        (the alert) and roughly when the change started. The start is an estimate, never a measured fact.
      </p>
      {oneRepRise !== null && oneRepTrigger !== null && (
        <p>
          <b>One unusual rep.</b> Each rep's standardized score is capped at ±{clip} before smoothing. From a settled trend (Z = 0), one rep can lift the EWMA by at
          most α × {clip} = {fmt(oneRepRise, 2)}, which is below the alert line at {c.breakpointThreshold}. If the trend is already raised above about{' '}
          {fmt(oneRepTrigger, 2)}, a single extreme rep can push it over. So one bad rep rarely triggers an alert on its own, but it can.
          {isolatedBadRep !== undefined &&
            ` In the synthetic study, sessions with one isolated bad rep ended in a false alert ${pct(isolatedBadRep)} of the time (held-out set, scenario B).`}
        </p>
      )}
      <h3>Where the settings come from</h3>
      <p>
        The settings were chosen in the synthetic study described in the next tab and are loaded from <code>breakingpoint_detector_config.json</code>. Active
        settings: <code>{c.configId ?? c.mode}</code>.
      </p>
    </div>
  );
}

function Science() {
  return (
    <div className="prose">
      <h3 style={{ marginTop: 0 }}>Why compare you with yourself?</h3>
      <ul>
        <li>
          When athletes tire, their movement often changes gradually: depth, trunk angle, tempo and symmetry can shift. BreakingPoint measures those changes. It
          does not measure fatigue itself, and a change can have other causes.
        </li>
        <li>
          Countermovement jumps are widely used to monitor neuromuscular status; jump height and strategy measures such as contraction time and RSI-modified are
          common in practice.
        </li>
        <li>Camera-based pose estimation gives useful lower-body joint information, especially for side-on movement filmed from a consistent setup.</li>
        <li>
          A single camera has real limits: rotation out of the camera plane, the far limb hidden from view, and no true depth. Its joint angles are not
          laboratory-grade.
        </li>
        <li>
          So BreakingPoint compares each athlete <b>with themselves, filmed from the same setup</b>. Much of the camera's systematic error cancels out in that
          comparison, and the detector looks for changes that repeat rather than a single odd frame or rep.
        </li>
      </ul>
      <div className="two-col" style={{ marginTop: 14 }}>
        <div className="does">
          <h4>WHAT BREAKINGPOINT DOES</h4>
          <ul>
            <li>Learns your usual form from your fresh reps</li>
            <li>Flags changes from your usual form that keep coming over several reps</li>
            <li>Shows which measurements changed and by how much</li>
            <li>Keeps a record of how your form changed, to help you and your coach plan training</li>
          </ul>
        </div>
        <div className="doesnt">
          <h4>WHAT BREAKINGPOINT DOES NOT DO</h4>
          <ul>
            <li>Measure fatigue, or tell good form from bad form</li>
            <li>Diagnose injuries or medical conditions</li>
            <li>Predict ACL tears or any other injury</li>
            <li>Replace coaches, physical therapists or medical professionals</li>
            <li>Provide laboratory-grade 3D kinematics or force measurements</li>
          </ul>
        </div>
      </div>
      <h3>Key methodological references</h3>
      <ul>
        <li>Page, E. S. (1954). Continuous inspection schemes. <i>Biometrika</i>, 41, 100–115. (CUSUM)</li>
        <li>Roberts, S. W. (1959). Control chart tests based on geometric moving averages. <i>Technometrics</i>, 1(3), 239–250. (EWMA)</li>
        <li>Montgomery, D. C. <i>Introduction to Statistical Quality Control</i>. Wiley. (statistical process control)</li>
        <li>Bazarevsky, V. et al. (2020). BlazePose: On-device real-time body pose tracking. arXiv:2006.10204.</li>
        <li>Casiez, G., Roussel, N., Vogel, D. (2012). 1€ filter: a simple speed-based low-pass filter for noisy input. <i>CHI '12</i>.</li>
        <li>Claudino, J. G. et al. (2017). The countermovement jump to monitor neuromuscular status: a meta-analysis. <i>J Sci Med Sport</i>, 20(4), 397–402.</li>
      </ul>
      <div className="disclaimer">BreakingPoint provides training information and is not a medical diagnosis.</div>
    </div>
  );
}

function FigureGrid({ figures, available, onZoom }: { figures: [string, string][]; available: string[]; onZoom: (f: string) => void }) {
  const shown = figures.filter(([f]) => available.includes(`${f}.png`));
  if (!shown.length) return null;
  return (
    <div className="fig-grid">
      {shown.map(([f, cap]) => (
        <figure key={f}>
          <button className="fig-btn" onClick={() => onZoom(f)} aria-label={`Enlarge: ${cap}`}>
            <img src={`/lab/figures/${f}.png`} alt={cap} loading="lazy" />
          </button>
          <figcaption>{cap}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function Lab({ c }: { c: DetectorConfig }) {
  const v = c.validation as Record<string, unknown> | undefined;
  const S = HIPERGATOR_STUDY;
  const [zoom, setZoom] = useState<string | null>(null);
  // Escape closes the zoomed figure before the dialog (capture phase runs first).
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setZoom(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [zoom]);
  if (!v || !Number.isFinite(c.validation?.numSessions)) {
    return (
      <div className="prose">
        <p>
          The study's results are not attached to the active detector settings ({c.source}), so the app may be running on its built-in defaults. The study itself
          is unchanged in <code>results/VALIDATION_REPORT.md</code>.
        </p>
      </div>
    );
  }
  const ci = (k: string) => (Array.isArray(v[k]) ? (v[k] as number[]) : null);
  const fprCi = ci('false_positive_rate_ci95');
  const tprCi = ci('true_positive_rate_ci95');
  const figs = (v.figures as string[] | undefined) ?? [];
  const pvp = S.personalVsPopulation;
  const rec = RECOVERY_CHECK;
  const isolatedBadRep = PER_SCENARIO.find((r) => r.key === 'B_isolated_bad_rep')!;
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="prose" style={{ marginTop: 6 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          {S.label}
        </div>
        <p style={{ marginTop: 0 }}>
          BreakingPoint's detector was tested on {S.simulatedSessions.toLocaleString()} simulated athlete sessions, not on real people. In each session the
          simulation knew whether, and at which rep, the athlete's movement changed. The study tried {S.configurations.toLocaleString()} combinations of
          detector settings, picked one with a fixed rule using half of the sessions, and measured it on the other half, which played no part in the choice.
        </p>
        <p>
          The chosen settings are the ones the app uses. They are saved in <code>breakingpoint_detector_config.json</code>, so the app runs entirely in your
          browser and does not need HiPerGator.
        </p>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="k">Simulated sessions</div>
          <div className="v">{Number(v.num_sessions ?? c.validation?.numSessions).toLocaleString()}</div>
          <div className="s">
            {Number(v.num_sessions_selection ?? S.selectionSessions).toLocaleString()} to choose, {Number(v.num_sessions_holdout ?? S.heldOutSessions).toLocaleString()}{' '}
            held out to test
          </div>
        </div>
        <div className="kpi">
          <div className="k">Configurations evaluated</div>
          <div className="v">{Number(v.num_configs_evaluated ?? S.configurations).toLocaleString()}</div>
          <div className="s">
            {S.detectorSettings.toLocaleString()} detector settings × {S.scoreVariants} score variants
          </div>
        </div>
        <div className="kpi">
          <div className="k">False-positive rate</div>
          <div className="v">{pct(c.validation?.falsePositiveRate)}</div>
          <div className="s">{fprCi ? `held-out, 95% CI ${pct(fprCi[0])}–${pct(fprCi[1])}` : 'held-out'}</div>
        </div>
        <div className="kpi">
          <div className="k">Detection rate</div>
          <div className="v">{pct(c.validation?.truePositiveRate)}</div>
          <div className="s">{tprCi ? `held-out, 95% CI ${pct(tprCi[0])}–${pct(tprCi[1])}` : 'held-out'}</div>
        </div>
      </div>
      <div className="kpis">
        <div className="kpi">
          <div className="k">Median detection delay</div>
          <div className="v">{fmt(c.validation?.medianDetectionDelay, 0)} reps</div>
          <div className="s">from the simulated change to the alert</div>
        </div>
        <div className="kpi">
          <div className="k">Personal baseline</div>
          <div className="v">{pct(pvp.personal.falsePositiveRate)}</div>
          <div className="s">false alerts, each athlete vs their own usual form</div>
        </div>
        <div className="kpi">
          <div className="k">Population baseline</div>
          <div className="v">{pct(pvp.population.falsePositiveRate)}</div>
          <div className="s">false alerts, everyone vs one shared norm</div>
        </div>
        <div className="kpi">
          <div className="k">One isolated bad rep</div>
          <div className="v">{isolatedBadRep.falseAlerts}</div>
          <div className="s">of those sessions ended in a false alert</div>
        </div>
      </div>

      <div className="prose">
        <h3 style={{ marginTop: 4 }}>What the numbers mean</h3>
        <ul>
          <li>
            <b>False-positive rate:</b> how often the detector reported a change when the simulated athlete's movement was actually stable.
          </li>
          <li>
            <b>Detection rate:</b> how often the system detected a simulated movement change.
          </li>
          <li>
            <b>Detection delay:</b> how many repetitions passed between the simulated change and the detector's alert.
          </li>
          <li>
            <b>Personal versus population baseline:</b> a comparison showing whether monitoring each athlete against their own usual movement reduces false
            alarms. It ran on a separate set of {pvp.evaluationSessions.toLocaleString()} simulated sessions with the same detector, which is why its detection
            rate ({pct(pvp.personal.detectionRate)} personal, {pct(pvp.population.detectionRate)} population) differs slightly from the held-out{' '}
            {pct(c.validation?.truePositiveRate)}.
          </li>
          <li>
            <b>Held out:</b> the {Number(v.num_sessions_holdout ?? S.heldOutSessions).toLocaleString()} sessions used for these numbers were never used to choose
            the settings.
          </li>
        </ul>
      </div>

      <p className="dim" style={{ fontSize: 12.5, margin: 0 }}>
        These are the study's original figures, unchanged. Their labels use its technical terms: "drift" means a change in form, and the scenario labelled
        "gradual fatigue drift" simulates a gradual change in movement, not fatigue.
      </p>
      <FigureGrid figures={MAIN_FIGURES} available={figs} onZoom={setZoom} />

      <div className="two-col">
        <div className="does">
          <h4>WHAT THIS STUDY SHOWS</h4>
          <ul className="prose" style={{ fontSize: 13.5, paddingLeft: 18, margin: 0 }}>
            <li>How the detector behaves on simulated squat-like movement sessions where the true change is known</li>
            <li>That the chosen settings kept false alerts under 5% in every simulated scenario without a real change, including camera noise, missing landmarks and very variable athletes</li>
            <li>That, in simulation, a personal baseline gave far fewer false alerts than one shared population norm</li>
            <li>
              That false alerts climb when the camera view gets worse after calibration: {pct(S.noiseRisesAfterCalibration.falsePositiveRate)} when measurement noise
              doubles. Recalibrate when your setup changes.
            </li>
          </ul>
        </div>
        <div className="doesnt">
          <h4>WHAT IT DOES NOT SHOW</h4>
          <ul className="prose" style={{ fontSize: 13.5, paddingLeft: 18, margin: 0 }}>
            <li>How the app performs with real athletes or real camera footage</li>
            <li>Results for jumps, lunges or any particular sport: only squat-like movement was simulated</li>
            <li>Anything about fatigue, injury or health</li>
          </ul>
        </div>
      </div>

      <div className="panel prose" style={{ fontSize: 13.5 }}>
        <b>Original files:</b> <ExternalLink href={S.links.report}>validation report</ExternalLink> ·{' '}
        <ExternalLink href="/breakingpoint_detector_config.json">detector settings the app uses</ExternalLink> (
        <ExternalLink href={S.links.config}>as published</ExternalLink>) · <ExternalLink href={S.links.jobs}>Slurm job records</ExternalLink> ·{' '}
        <ExternalLink href={S.links.repository}>source code on GitHub</ExternalLink>
        <br />
        Run on {S.cluster} (allocation <code>{S.allocation}</code>): sweep job {S.sweepJob.id}, {S.sweepJob.tasks} tasks × {S.sweepJob.cpusPerTask} CPUs, finalize
        job {S.finalizeJob.id}. Report generated {S.reportGeneratedAt.slice(0, 10)}.
      </div>

      <details className="panel">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Technical details: all figures, per-scenario results, settings and provenance</summary>
        <div className="col" style={{ gap: 14, marginTop: 14 }}>
          <FigureGrid figures={TECHNICAL_FIGURES} available={figs} onZoom={setZoom} />

          <table className="baseline-table">
            <caption className="dim" style={{ textAlign: 'left', fontSize: 12.5, paddingBottom: 6 }}>
              Held-out results per simulated scenario. A, B, E, F and G have no real change, so any alert is false. C, D and H have a change to detect.
            </caption>
            <thead>
              <tr>
                <th>Scenario</th>
                <th style={{ textAlign: 'right' }}>Sessions</th>
                <th style={{ textAlign: 'right' }}>False alerts</th>
                <th style={{ textAlign: 'right' }}>Detected</th>
                <th style={{ textAlign: 'right' }}>Median delay</th>
              </tr>
            </thead>
            <tbody>
              {PER_SCENARIO.map((r) => (
                <tr key={r.key}>
                  <td>{r.name}</td>
                  <td className="num">{r.sessions}</td>
                  <td className="num">{r.falseAlerts}</td>
                  <td className="num">{r.detected}</td>
                  <td className="num">{r.medianDelay && `${r.medianDelay} reps`}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="prose" style={{ fontSize: 13.5 }}>
            <p style={{ marginTop: 0 }}>
              <b>Selected settings:</b> <code>{c.configId ?? c.mode}</code> (mode {c.mode}, α {c.ewmaAlpha}, CUSUM k {c.cusumK} and h {c.cusumH}, warning{' '}
              {c.warningThreshold}σ, alert {c.breakpointThreshold}σ,{' '}
              {c.minimumPersistentReps > 0 ? `persistence ${c.minimumPersistentReps} reps` : 'no persistence rule'}, cap {c.outlierClip ?? 'none'},{' '}
              {c.featureWeighting} weighting, missing measurements {c.missingHandling === 'drop' ? 'left out' : c.missingHandling}).
            </p>
            <p>
              <b>Selection rule:</b> {c.selectionRule}
            </p>
            <p>
              <b>Recovery check</b> (scenario H, {rec.sessions} sessions): the estimated recovery tracked the true recovery with a Spearman correlation of{' '}
              {rec.spearman} and a mean absolute error of {rec.meanAbsoluteErrorPoints} percentage points; the "recovered" label matched the truth in{' '}
              {rec.statusAgreement} of sessions.
            </p>
            <p>
              <b>Provenance:</b> {S.sweepJob.tasks} sweep tasks, each {S.sweepJob.elapsedSecondsMin}–{S.sweepJob.elapsedSecondsMax} s of elapsed time on{' '}
              {S.sweepJob.cpusPerTask} CPUs; finalize {S.finalizeJob.elapsedSeconds} s. The report's "564 CPU-process seconds" is summed wall-clock time measured
              inside Python, not CPU time. The run's per-configuration CSVs and shards were not copied off the cluster before access ended. The report, figures,
              settings and job records above are the original outputs. Checksums for every file are in <code>results/provenance.json</code>.
            </p>
          </div>
        </div>
      </details>

      {zoom && (
        <div className="modal-backdrop" onClick={() => setZoom(null)} style={{ zIndex: 70 }}>
          <img src={`/lab/figures/${zoom}.png`} alt={zoom} style={{ maxWidth: '96vw', maxHeight: '92vh', borderRadius: 6, background: '#fff' }} />
        </div>
      )}
    </div>
  );
}

function RealWorld() {
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="prose" style={{ marginTop: 6 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Real-world evaluation · in progress
        </div>
        <p style={{ marginTop: 0 }}>
          The study in the previous tab used simulated athletes. This work moves to recorded human movement from public research datasets. It is separate from
          the HiPerGator study: its results will be reported on their own, never combined with the synthetic numbers.
        </p>
        <p>
          <b>No results yet.</b> Numbers will appear here only once an analysis is complete and has been reviewed, each with its dataset, sample size, method and
          limits.
        </p>
      </div>
      {REAL_WORLD_STUDIES.map((s) => (
        <div key={s.id} className="panel prose" style={{ fontSize: 13.5, maxWidth: 'none' }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <b style={{ fontSize: 15 }}>{s.name}</b>
            <span className="status-badge beta">{s.status}</span>
          </div>
          <p style={{ margin: '6px 0' }}>
            {s.contents} <span className="dim">Source: {s.source}. Licence: {s.licence}.</span>{' '}
            <ExternalLink href={s.url}>Dataset page</ExternalLink>
          </p>
          <ul style={{ margin: '6px 0' }}>
            <li>
              <b>Used:</b> {s.uses}
            </li>
            <li>
              <b>Question:</b> {s.question}
            </li>
            <li>
              <b>Limits:</b> {s.limits}
            </li>
            <li>
              <b>Status:</b> {s.statusNote}
            </li>
          </ul>
        </div>
      ))}
      <div className="prose" style={{ fontSize: 13.5 }}>
        <p style={{ margin: 0 }}>{REAL_WORLD_SCOPE}</p>
      </div>
    </div>
  );
}

function Privacy() {
  return (
    <div className="prose">
      <h3>Video never leaves your device.</h3>
      <ul>
        <li>Pose estimation runs in your browser (WebAssembly / WebGL). No frames are uploaded; there is no backend.</li>
        <li>Video is not recorded. Only derived numeric movement features (angles, durations, quality scores) are kept in memory.</li>
        <li>
          Athlete profiles, baselines and set history are stored only in this browser (localStorage), separately for each athlete. "Reset baseline"
          deletes that athlete's baseline for the current protocol; saved sets are kept.
        </li>
        <li>The sample athlete is synthetic example data held in memory. Nothing done while exploring it is saved or affects real records.</li>
        <li>Exports (JSON / CSV) are generated locally and contain numbers only.</li>
        <li>The pose model and runtime are bundled with the app, so live mode also works offline.</li>
      </ul>
    </div>
  );
}

export function ResearchModal({ config, initialTab = 'method', onClose }: Props) {
  const [tab, setTab] = useState<ResearchTab>(initialTab);
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal sys-window" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="research-title" tabIndex={-1} ref={dialogRef}>
        <div className="modal-header">
          <div>
            <div className="eyebrow">Research, evidence and limits</div>
            <h2 id="research-title">How BreakingPoint works, and what it doesn't claim</h2>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </div>
        <div className="tabs" role="tablist" aria-label="Research sections">
          {(
            [
              ['method', 'How it works'],
              ['lab', 'HiPerGator study (synthetic)'],
              ['realworld', 'Real-world evaluation'],
              ['science', 'Limits & sources'],
              ['privacy', 'Privacy'],
            ] as [ResearchTab, string][]
          ).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
        <div className="modal-body" style={{ paddingTop: 14 }}>
          {tab === 'method' && <Method c={config} />}
          {tab === 'lab' && <Lab c={config} />}
          {tab === 'realworld' && <RealWorld />}
          {tab === 'science' && <Science />}
          {tab === 'privacy' && <Privacy />}
        </div>
      </div>
    </div>
  );
}
