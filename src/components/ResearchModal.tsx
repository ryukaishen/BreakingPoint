import { useEffect, useState } from 'react';
import type { DetectorConfig } from '../detection/config';
import { fmt, pct } from '../utils/format';
import { useDialog } from '../utils/hooks';
import { Close } from './Icons';

export type ResearchTab = 'method' | 'science' | 'lab' | 'privacy';

interface Props {
  config: DetectorConfig;
  initialTab?: ResearchTab;
  onClose: () => void;
}

const FIGURES: [string, string][] = [
  ['detection_tradeoff', 'Detection trade-off: false-positive rate vs detection delay for every tested configuration'],
  ['scenario_examples', 'Example sessions with true and detected change points'],
  ['personal_vs_population', 'Same detector, personal baseline vs population norm'],
  ['noise_robustness', 'Robustness to pose-measurement noise'],
  ['outlier_robustness', 'Robustness to isolated bad reps'],
  ['dropout_robustness', 'Robustness to missing / low-confidence landmarks'],
  ['changepoint_accuracy', 'True vs estimated change point'],
  ['parameter_heatmap', 'EWMA / CUSUM parameter heatmaps'],
  ['ablation', 'Detector family and drift-score ablation'],
  ['detection_by_severity', 'Detection vs drift severity'],
  ['noise_shift_stress_test', 'Stress test: capture noise increases after calibration'],
];

function Method({ c }: { c: DetectorConfig }) {
  return (
    <div className="prose">
      <p>
        BreakingPoint is not a form classifier. MediaPipe extracts the signal; BreakingPoint's contribution is the <b>individualized temporal model</b>{' '}
        operating on that signal. The question is not "is this frame abnormal?" but <b>"has this athlete entered a persistently different movement regime?"</b>
      </p>
      <h3>0 · Sport → protocol → primitive</h3>
      <p>
        A sport selects a repeatable movement protocol built on a reusable movement primitive — squat, jump-and-land (countermovement jump) or forward lunge
        (beta). Only segmentation and feature extraction depend on the primitive; the baseline, drift score and detector below are shared by every sport.
      </p>
      <h3>1 · Pose → per-rep features</h3>
      <p>
        33 body landmarks per frame (MediaPipe Pose Landmarker, on-device), smoothed with a One Euro filter. Reps are segmented from hip drop normalized by
        the athlete's own leg length. Each rep yields knee/hip range of motion, depth, peak trunk lean, rep / eccentric / concentric duration, peak knee
        extension velocity and L/R asymmetry, each with a landmark-confidence quality score.
      </p>
      <h3>2 · Personal baseline</h3>
      <code className="formula">{`center_i = median(calibration reps)
scale_i  = max( SD_i , 1.4826·MAD_i , absFloor_i , relFloor_i·|median_i| )`}</code>
      <p>The floors encode the minimum detectable change of a monocular camera, so a very consistent athlete is not flagged for sub-noise wobble.</p>
      <h3>3 · Movement Drift Score (per rep)</h3>
      <code className="formula">{`z_i   = clip( (x_i − center_i) / scale_i , ±${c.zClip} )
drift = sqrt( Σ w_i·z_i² / Σ w_i )      w_i = group weight × landmark confidence`}</code>
      <p>
        Features with confidence &lt; {c.qualityMin} are {c.missingHandling === 'drop' ? 'dropped' : c.missingHandling === 'impute' ? 'imputed as z = 0' : 'treated as a skipped rep'}; a rep
        covering &lt; {pct(c.minCoverage, 0)} of the feature weight is <i>not scored</i> rather than reported with false precision.
      </p>
      <h3>4 · Athlete-specific in-control reference</h3>
      <p>
        Leave-one-out over the calibration reps measures how far this athlete's <i>fresh</i> reps naturally fall from their own baseline: μ₀ = mean, σ₀ = SD
        of the LOO drift scores (with sanity bounds). Each new rep is standardized: <code>s = (drift − μ₀)/σ₀</code>, winsorized at ±{c.outlierClip ?? '∞'}.
      </p>
      <h3>5 · Sequential change detection</h3>
      <code className="formula">{`EWMA   Z_t = α·s_t + (1−α)·Z_{t−1}            α = ${c.ewmaAlpha}
CUSUM  C_t = max(0, C_{t−1} + s_t − k)         k = ${c.cusumK}, h = ${c.cusumH}
mode   ${c.mode}   ·   warning ${c.warningThreshold}σ   ·   breaking point ${c.breakpointThreshold}σ   ·   persistence ≥ ${c.minimumPersistentReps} reps`}</code>
      <p>
        One weird rep cannot trigger a breaking point: each rep's input is winsorized and smoothed by the EWMA
        {c.minimumPersistentReps > 0 ? ', and the alarm also requires a run of elevated reps' : ', so a single extreme rep moves the smoothed drift by at most α × clip'}. Once fired, the onset is estimated as the
        first rep of the current CUSUM excursion (the classic CUSUM change-point estimator), so BreakingPoint reports both <i>when it became sure</i> and{' '}
        <i>when the drift likely began</i>.
      </p>
      <h3>Where the parameters come from</h3>
      <p>
        Active configuration: <b>{c.source}</b>. These values are exported by BreakingPoint Lab, a Monte-Carlo backtest of the same detector on simulated
        athlete sessions with known change points — see the <b>Lab validation</b> tab.
      </p>
    </div>
  );
}

function Science() {
  return (
    <div className="prose">
      <h3>Why within-person change?</h3>
      <ul>
        <li>Fatigue does not make an athlete forget how to squat — it gradually changes how they move: depth, trunk angle, tempo and symmetry drift.</li>
        <li>
          Countermovement jumps are widely used to monitor neuromuscular fatigue; variables such as jump height and strategy metrics (e.g. contraction
          time, RSI-modified) are common in practice.
        </li>
        <li>
          Markerless, camera-based pose estimation can provide useful lower-limb kinematic information, especially for sagittal-plane movement captured
          from a consistent setup.
        </li>
        <li>
          Monocular cameras have real limits — out-of-plane rotation, occlusion of the far limb, and depth ambiguity — so absolute joint angles are not
          laboratory-grade.
        </li>
        <li>
          Therefore BreakingPoint compares each athlete <b>with themselves, from the same camera setup</b>. Systematic camera bias largely cancels in
          within-person comparisons, and the detector looks for persistent change rather than single-frame abnormality.
        </li>
      </ul>
      <div className="two-col" style={{ marginTop: 14 }}>
        <div className="does">
          <h4>WHAT BREAKINGPOINT DOES</h4>
          <ul>
            <li>Learns a personalized movement baseline from fresh reps</li>
            <li>Detects persistent departures from that baseline (movement drift)</li>
            <li>Explains which measurements changed and by how much</li>
            <li>Provides a fatigue-associated movement-change signal for training decisions</li>
          </ul>
        </div>
        <div className="doesnt">
          <h4>WHAT BREAKINGPOINT DOES NOT DO</h4>
          <ul>
            <li>Diagnose injuries or medical conditions</li>
            <li>Predict ACL tears or any specific injury risk</li>
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

function Lab({ c }: { c: DetectorConfig }) {
  const v = c.validation as Record<string, unknown> | undefined;
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
          No Lab validation is attached to the active configuration ({c.source}). Run <code>python hpc/run_experiment.py --sessions 1000 --seed 42</code> locally
          or <code>sbatch hpc/sweep.slurm</code> on HiPerGator to generate one.
        </p>
      </div>
    );
  }
  const ci = (k: string) => (Array.isArray(v[k]) ? (v[k] as number[]) : null);
  const fprCi = ci('false_positive_rate_ci95');
  const tprCi = ci('true_positive_rate_ci95');
  const figs = (v.figures as string[] | undefined) ?? [];
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="prose" style={{ marginTop: 6 }}>
        <p style={{ marginTop: 0 }}>
          <b>BreakingPoint Lab</b> treats detector tuning like quantitative strategy backtesting: simulate many individualized athlete sessions with known
          change points (no change, isolated bad reps, gradual and sudden drift, camera noise, landmark dropout, high variability, recovery), sweep the
          detector's hyper-parameters, and pick the operating point with a transparent rule. Synthetic sessions test the detector's <i>statistical</i> behaviour
          — they are not clinical data.
        </p>
        <p>
          The detector is calibrated at the movement-signal level, while individual sport protocols determine which repeatable movement and features are
          monitored. The same validated detector engine is shared by every protocol (squat, jump-and-land, forward lunge).
        </p>
        <p className="dim" style={{ fontSize: 12.5 }}>
          Scope: current validation evaluates detector behaviour under controlled synthetic movement drift. It does not clinically validate any listed sport;
          sport-specific clinical validation is future work.
        </p>
      </div>
      <div className="kpis">
        <div className="kpi">
          <div className="k">Simulated sessions</div>
          <div className="v">{Number(v.num_sessions ?? c.validation?.numSessions).toLocaleString()}</div>
          <div className="s">{String(v.compute_environment ?? '')}</div>
        </div>
        <div className="kpi">
          <div className="k">False-positive rate</div>
          <div className="v">{pct(c.validation?.falsePositiveRate)}</div>
          <div className="s">{fprCi ? `95% CI ${pct(fprCi[0])}–${pct(fprCi[1])}, held-out` : 'held-out'}</div>
        </div>
        <div className="kpi">
          <div className="k">Drift detected</div>
          <div className="v">{pct(c.validation?.truePositiveRate)}</div>
          <div className="s">{tprCi ? `95% CI ${pct(tprCi[0])}–${pct(tprCi[1])}, ` : ''}miss {pct(c.validation?.missRate)}</div>
        </div>
        <div className="kpi">
          <div className="k">Median delay</div>
          <div className="v">{fmt(c.validation?.medianDetectionDelay, 0)} reps</div>
          <div className="s">after the true change point</div>
        </div>
      </div>
      <div className="panel prose" style={{ fontSize: 13 }}>
        <b>Configurations evaluated:</b> {Number(v.num_configs_evaluated ?? 0).toLocaleString()}. <b>Selected:</b> <code>{c.configId ?? c.mode}</code>{' '}
        (mode {c.mode}, α {c.ewmaAlpha}, k {c.cusumK}, h {c.cusumH}, warning {c.warningThreshold}σ, breaking point {c.breakpointThreshold}σ, persistence{' '}
        {c.minimumPersistentReps}, clip {c.outlierClip ?? 'none'}, {c.featureWeighting}, missing → {c.missingHandling})
        <br />
        <b>Selection rule:</b> {c.selectionRule}
      </div>
      {figs.length > 0 && (
        <div className="fig-grid">
          {FIGURES.filter(([f]) => figs.includes(`${f}.png`)).map(([f, cap]) => (
            <figure key={f}>
              <button className="fig-btn" onClick={() => setZoom(f)} aria-label={`Enlarge: ${cap}`}>
                <img src={`/lab/figures/${f}.png`} alt={cap} loading="lazy" />
              </button>
              <figcaption>{cap}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {zoom && (
        <div className="modal-backdrop" onClick={() => setZoom(null)} style={{ zIndex: 70 }}>
          <img src={`/lab/figures/${zoom}.png`} alt={zoom} style={{ maxWidth: '96vw', maxHeight: '92vh', borderRadius: 6, background: '#fff' }} />
        </div>
      )}
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
        <li>Your baseline is stored only in this browser (localStorage) so you can skip calibration next time. "Reset baseline" deletes it.</li>
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
            <div className="eyebrow">Research, validation and limitations</div>
            <h2 id="research-title">How BreakingPoint works, and what it doesn't claim</h2>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Close">
            <Close />
          </button>
        </div>
        <div className="tabs" role="tablist" aria-label="Research sections">
          {(
            [
              ['method', 'Method'],
              ['science', 'Science & limits'],
              ['lab', 'Lab validation (HPC)'],
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
          {tab === 'science' && <Science />}
          {tab === 'lab' && <Lab c={config} />}
          {tab === 'privacy' && <Privacy />}
        </div>
      </div>
    </div>
  );
}
