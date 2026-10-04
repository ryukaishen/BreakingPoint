# BreakingPoint

**Detect the rep where fatigue starts changing how you move and POINTS where you BREAK!**

**Your movement. Your baseline.** BreakingPoint is a personalized movement-monitoring platform for athletes. It uses
ordinary camera video to learn an athlete's personal movement baseline and applies sequential change-point detection to
identify the moment fatigue begins causing persistent biomechanical drift. Sports plug in through reusable movement
protocols.

> BreakingPoint doesn't ask whether you move like the ideal athlete. It asks whether you still move like yourself.

Built for the University of Florida Dream Team Engineering Designathon 2026 — Software Competition.

---

## Inspiration

In quantitative finance you don't wait for a portfolio to collapse before you act. You monitor it for a
**regime change**: the point where its behaviour has become statistically different from its own history, and the
risk starts compounding.

Athletes have the same problem. Fatigue doesn't make anyone forget how to squat. Their mechanics *drift*: a little
less depth, a little more trunk lean, a slower drive, a growing left/right difference. Every rep still "counts",
so coaches and athletes usually notice only once form has visibly broken down. We wanted to bring the
risk-monitoring mindset (personal baseline, anomaly score, sequential detection) to the athlete.

## The problem

- Most form-analysis apps compare you against universal rules or an "ideal" joint angle. But people move differently,
  and an athlete can be perfectly consistent with *their* technique while differing from any template.
- What matters for fatigue monitoring is **within-person change**: when does *this* athlete start moving differently
  from how *they* moved when fresh?
- Motion capture and force plates can measure this, but they are expensive, lab-bound, and inaccessible to most
  recreational and collegiate athletes.

## What it does

BreakingPoint turns a laptop or phone camera into a personalized movement-monitoring tool.

0. **What do you play?** The athlete picks a sport, and BreakingPoint recommends a repeatable movement protocol.
   Examples: Soccer → *Explosive Fatigue Screen* (repeated countermovement jump); Volleyball → *Jump Consistency*;
   Pickleball / Tennis / Badminton → *Forward Lunge Endurance*; Strength → *Bodyweight Squat*.
1. **Calibrate.** The athlete does 5–8 fresh reps of that protocol. BreakingPoint learns **their** baseline for every
   measurement: knee and hip range of motion, depth, trunk lean, rep / descent / ascent time, extension velocity, and
   left/right asymmetry (CMJ: jump height, RSI-mod, flight time, dip depth, landing flexion; lunge: step length, lunge
   depth, recovery time and velocity…).
2. **Monitor.** During the set, every rep is detected automatically and scored with a transparent **Movement Drift
   Score**: how many standard deviations, on average, this rep sits from the athlete's own baseline.
3. **Detect.** A sequential detector (EWMA with persistence; CUSUM tracks the onset) ignores one weird rep but fires
   when drift **persists**. The screen moves from STABLE to DRIFT EMERGING to **BREAKING POINT DETECTED — Rep 10**.
4. **Explain.** "Why did you flag me?" BreakingPoint ranks what changed, in the sport's own terms, and names the
   pattern. Soccer demo: **EXPLOSIVE FATIGUE**: *explosive velocity (RSI-mod) −4.6σ ↓, jump height −3.6σ ↓, push-off
   time +2.2σ ↑*. Pickleball demo: **RECOVERY SLOWING**: *push-back speed −3.8σ ↓, trunk lean +2.2σ ↑*. Pattern
   labels describe movement change and are never diagnoses. On the skeleton it highlights the segments that changed.
5. **Report and recover.** A session summary (stable reps, post-breaking-point reps, average drift before and after,
   largest mechanical drift), JSON/CSV export, and a **recovery check**: after rest, three reps are compared with the
   original baseline. Example: "Movement has returned 83 % toward baseline."

The centrepiece is the **Form Drawdown** chart, inspired by quant risk dashboards: per-rep drift bars, the athlete's
normal band, warning and breaking-point levels, a smoothed EWMA line, a CUSUM evidence strip, and vertical markers
for the estimated drift onset and the detected breaking point.

A deterministic **Demo Mode** (clearly labeled "Demo dataset · synthetic athlete") runs a synthetic athlete's
landmarks through the exact same pipeline, so the judging demo never depends on camera conditions. Demo contexts:
Soccer (repeated CMJ), Volleyball (repeated jump), Strength (squat) and Pickleball (forward lunge, beta), each with an
athlete card (sport · protocol · session).

### A platform: many sports, few primitives, one detector

| | status | what it means |
|---|---|---|
| **Bodyweight Squat** (`SQUAT`) | **IMPLEMENTED** · ready | reference protocol (Strength) |
| **Repeated Countermovement Jump** (`JUMP_AND_LAND`) | **IMPLEMENTED** · ready | Soccer · Basketball · Volleyball · Gymnastics · Field sports |
| **Forward Lunge** (`FORWARD_LUNGE`) | **BETA** | Pickleball · Tennis · Badminton · Fencing · Strength. Works end to end on deterministic data and in tests; real-camera reliability is still being validated |
| Single-leg hop / landing, change-of-direction, defensive shuffle, approach jump, landing screen, lateral & deep lunge, split-step, deadlift, kendo fumikomi / forward attack, repeated kick | **FUTURE** (coming soon) | listed in the protocol library; cannot be launched |
| Running gait (consistency, stride asymmetry, repeated steps) | **FUTURE** | needs longer continuous temporal modelling than discrete reps |
| **Create your own protocol** | **FUTURE** | a coach records clean reps of any repeatable movement; BreakingPoint learns the athlete's distribution |

The sport changes which repeatable movement is monitored, which metrics are featured, and what the UI calls things.
The personal baseline, drift score and sequential detector stay the same, with the same validated parameters.

## How we built it

### BreakingPoint Edge: real-time, on-device

- **React + TypeScript + Vite**, no backend. Video never leaves the device; only derived numbers are kept.
- **MediaPipe Pose Landmarker** (WASM/WebGL, GPU with CPU fallback). Model and runtime ship with the app, so it works
  offline.
- **One Euro filter** landmark smoothing; aspect-corrected 2D kinematics; per-frame capture quality.
- **Sport → protocol → primitive layer** (`src/protocols/`): centralized sport profiles, protocol definitions with
  READY / BETA / COMING_SOON / FUTURE status, and a single launch resolver that refuses roadmap protocols and never
  touches detector parameters.
- **Rep segmentation**: a debounced state machine on hip drop normalized by the athlete's own leg length
  (STANDING → DESCENDING → BOTTOM → ASCENDING). The forward lunge reuses it (READY → DESCENT → BOTTOM → RECOVERY,
  plus step tracking). CMJ adds takeoff/flight/landing detection.
- **Per-rep features with quality scores**; low-confidence features are dropped, and reps with too little usable
  signal are *not scored* rather than reported with false precision.
- **Personal baseline** (median + robust scale with camera noise floors) and an **athlete-specific in-control
  reference** from leave-one-out over the calibration reps.
- **Sequential detection** (EWMA / CUSUM / persistence), onset estimation, explanations, recovery check, export.
- Custom SVG visualizations (Form Drawdown, rep timeline) and canvas skeleton rendering.

### BreakingPoint Lab: HPC simulation and statistical validation

A sequential detector has a sensitivity problem. Make it aggressive, and one bad rep raises a false warning. Make it
conservative, and real drift is caught too late. Instead of hand-picking thresholds, we **backtested** it:

- A **synthetic athlete generator** (Python/numpy): each athlete gets their own baseline and natural variability,
  correlated feature noise, pose-estimation measurement noise, and a fatigue signature applied from a known change point.
- **Eight scenario classes**: no change, isolated bad reps, gradual drift, sudden change, camera noise, landmark
  dropout, high natural variability, and drift followed by recovery.
- A **sweep of 25,280 configurations**: EWMA α, CUSUM k and h, warning and breaking-point thresholds, persistence,
  outlier clipping, feature weighting, missing-feature handling, and detector families (EWMA-only, CUSUM-only,
  EWMA+CUSUM, naive consecutive-threshold) as an ablation.
- **Transparent selection** on a selection split; performance reported on a **held-out** split.
- **Built for UF HiPerGator**: a Slurm array where each task simulates its own seeded shard of sessions and writes
  mergeable counts atomically. A merge job selects the configuration, runs robustness experiments, renders
  publication-quality figures, and exports `breakingpoint_detector_config.json`, **which the web app loads at
  startup**. The same code runs 1,000 sessions on a laptop or 1,000,000 on the cluster.

## Technical architecture

The architecture deliberately separates **real-time inference** (on-device, low latency, private, no special
hardware or connectivity) from **large-scale offline validation** (HPC, CPU-parallel, reproducible).

```
Sport profile → movement protocol → movement primitive (selects segmenter + features; terminology for the UI)
Camera / Demo landmarks → One Euro smoothing → frame kinematics → rep segmentation → per-rep features (+quality)
      → personal baseline (median, robust scale, LOO reference) → Movement Drift Score → EWMA/CUSUM detector
      → state · movement pattern · explanations · Form Drawdown · summary · recovery

Synthetic athletes (8 scenarios) → vectorized baseline + drift → 25,280 detector configs (Slurm array shards)
      → merge · selection rule · held-out metrics · robustness · figures → breakingpoint_detector_config.json → app
```

One feature catalog (`shared/feature_catalog.json`) drives both languages, and a **cross-language parity test**
replays Lab sessions through the app's TypeScript and requires identical results, so the Lab validates exactly the
detector the athlete runs.

The detector is calibrated at the movement-signal level, while individual sport protocols determine which repeatable
movement and features are monitored. Current validation evaluates detector behaviour under controlled synthetic
movement drift; it does not clinically validate any listed sport. Sport-specific clinical validation is future work.

## Statistical methodology

**This is not simply pose estimation.** MediaPipe extracts the signal. BreakingPoint's contribution is the
**individualized temporal model** that operates on it. The question is not "is this frame abnormal?" but **"has this
athlete entered a persistently different movement regime?"**

- Robust per-feature z-scores against the personal baseline:
  `z_i = clip((x_i − median_i)/scale_i, ±6)`, `scale_i = max(SD, 1.4826·MAD, measurement floor)`.
- Movement Drift Score = weighted RMS of z (group weights × landmark confidence), a standardized Euclidean distance.
  We chose not to use a full Mahalanobis distance because the covariance of 10 features from 5–8 reps is singular.
- In-control reference μ₀, σ₀ from **leave-one-out** drift scores of the calibration reps. This calibrates the
  detector to how variable *this* athlete naturally is.
- `s_t = (D_t − μ₀)/σ₀`, winsorized; **EWMA** `Z_t = αs_t + (1−α)Z_{t−1}`; **CUSUM** `C_t = max(0, C_{t−1} + s_t − k)`;
  optional run-length (persistence) requirement; onset = first rep of the current CUSUM excursion.
- Selected operating point (on HiPerGator): **EWMA α = 0.4, warning 1.0σ, breaking point 2.0σ, winsorize at 2.5σ**,
  no extra run-length rule. One extreme rep can move the smoothed drift by at most 1σ, half the alarm level.
- Selection rule: false-positive rate ≤ 5 % in **every** no-change scenario → within 2 pp of the best miss rate → lowest
  median detection delay.

**Validation results: UF HiPerGator, 100,000 simulated sessions (50,000 held out).** Twenty-task Slurm array
(8 CPUs per task) plus a merge job; every number is from `results/VALIDATION_REPORT.md`.

- False-positive rate on no-change sessions: **2.2 %** (95 % CI 2.1–2.4 %), and ≤ 3.9 % in every nuisance scenario
  (isolated bad rep 3.9 %, camera noise 1.3 %, landmark dropout 2.5 %, high variability 1.6 %)
- Drift sessions detected: **89.6 %** (95 % CI 89.2–90.0 %), median delay **4 reps**, median onset error **1 rep**
- Naive "flag any rep above 2σ": **51.9 %** false-positive rate
- Same detector with population norms instead of a personal baseline (20,000-session evaluation set): false alarms rose
  from 2.2 % to **17.8 %** (30.5 % for high-variability athletes), and detection fell from 89.8 % to **40.0 %**. This is
  the quantitative case for personalization.

## Research rationale

- Fatigue can alter movement mechanics: depth, trunk inclination, tempo, and symmetry.
- Countermovement jumps are widely used to monitor neuromuscular fatigue (e.g. Claudino et al., 2017 meta-analysis).
- Markerless pose estimation can provide useful lower-extremity kinematic information, particularly in the sagittal
  plane from a consistent setup (BlazePose / MediaPipe).
- Monocular cameras have limits: out-of-plane measurement, occlusion, depth ambiguity.
- Therefore BreakingPoint focuses on **within-person change from the same setup**, and on persistent drift, not on
  precise absolute angles or injury prediction. The sequential methods come from statistical process control
  (Page's CUSUM, 1954; Roberts' EWMA, 1959).

## Challenges we ran into

- **Small calibration samples.** Five to eight reps give noisy SDs. We combined median/MAD, measurement-noise floors,
  and a leave-one-out in-control reference. The Lab confirmed the standardized drift is well calibrated
  (mean ≈ 0, SD ≈ 1.1 in no-change sessions).
- **"One bad rep" vs real drift.** EWMA and CUSUM can both be tripped by a single huge outlier. Winsorizing and a
  persistence rule fixed this, and the Lab chose how much.
- **Choosing the selection rule honestly.** In a 50,000-session local run, our first rule (pooled FPR ≤ 5 %) picked a detector with 9.4 % false
  alarms on isolated bad reps. We tightened it to "≤ 5 % in every no-change scenario", accepting about +2 pp miss
  rate and +1 rep delay.
- **Camera noise after calibration.** The stress test showed false alarms rise if capture quality degrades after the
  baseline is learned. We report it, gate on capture quality, and advise recalibrating when the camera moves.
- **Keeping two languages identical.** A parity fixture generated by Python and replayed in TypeScript caught every
  divergence.
- **A demo that can't fail.** We built a procedural synthetic athlete that emits real landmark streams, so the demo
  exercises the full pipeline deterministically.
- **Going multi-sport without faking it.** A sport list is easy to fake. We built a configuration layer where only
  READY/BETA protocols on implemented primitives can launch (tested), kept detector parameters out of sport profiles
  (tested), and added the forward lunge as a real primitive. Its synthetic athlete uses inverse kinematics on a separate
  code path, so the existing squat/CMJ demos stayed byte-identical.

## Accomplishments that we're proud of

- A working end-to-end product: live camera → reps → personal baseline → drift → sequential detection → explanation
  → report → recovery check, entirely in the browser.
- Detector parameters selected by a reproducible Monte-Carlo backtest with a held-out split, not by hand, and loaded by
  the app automatically.
- The personal-versus-population result: same detector, same sessions, about 8× fewer false alarms and twice the
  detection rate with a personal baseline.
- Exact, mergeable HPC shards (counts and integer histograms), seeded per Slurm array index, which tolerate task
  failures.
- One validated detector serving three movement primitives and over a dozen sport contexts, with no per-sport models.
- 70 automated tests (53 TypeScript + 17 Python), including cross-language parity, end-to-end demo stories for squat, jump
  and lunge, and guards that roadmap protocols cannot launch.
- Scientific restraint: clear limits on what we do and don't claim.

## What we learned

- Personalization is a statistical requirement as well as a UX feature: universal norms confuse "different" with
  "changed".
- Sequential detection is about trade-offs. Plotting false-positive rate against delay for 25,280 configurations made
  that concrete.
- Validation infrastructure (simulation, held-out splits, confidence intervals) changes design decisions. Our
  selection rule, detector family, and missing-data strategy all came from data.
- Stating limitations clearly makes a health-adjacent project more credible.

## What's next

- **More primitives** for the roadmap protocols: lateral movement / change-of-direction, single-leg hop and landing,
  gait cycle (running), hip hinge (deadlift), strike step (kendo), kick (kickboxing). Also: harden the forward lunge
  from beta to ready with real recordings.
- **Create your own protocol:** a coach records several clean reps of any repeatable movement; BreakingPoint segments
  them, learns the athlete's movement distribution, and monitors for persistent drift.
- **Longitudinal fatigue model:** combine movement with wearable HR/HRV, training load, sleep, athlete-reported RPE,
  and prior sessions.
- **Team / coach dashboard:** "Adam is reaching his breaking point significantly earlier than his 14-day baseline."
- **Prospective validation** against motion capture, force plates, and real fatigue protocols with S&C and PT partners.
- Shrinkage-covariance (Mahalanobis) drift once more calibration data per athlete exists; more movements (lunges,
  hops, landing tasks); multi-camera capture.

## Safety and limitations

BreakingPoint provides training information and is **not a medical diagnosis**. It does **not** diagnose injuries,
predict ACL tears or any injury risk, replace coaches, physical therapists, or medical professionals, or provide
laboratory-grade kinematics or force measurements. Validation so far is on synthetic sessions that test the
detector's statistical behaviour under controlled conditions. Video never leaves the device.

## How to run locally

```bash
npm install            # installs deps, copies the MediaPipe runtime, downloads the pose model
npm run dev            # http://localhost:5173  (demos: ?demo=soccer | volleyball | strength | pickleball)
npm test               # 53 TypeScript tests (detector, parity, demo stories, sport/protocol layer, lunge)
```

BreakingPoint Lab:

```bash
python hpc/run_experiment.py --sessions 1000 --seed 42      # laptop: sweep → selection → figures → config
cd lab && python -m unittest discover -s tests               # 17 Lab tests
# HiPerGator: bash hpc/submit_all.sh   (see hpc/README_HIPERGATOR.md)
```

## Built with

TypeScript · React · Vite · MediaPipe Tasks Vision (Pose Landmarker) · WebAssembly · Canvas/SVG · Python · NumPy ·
Matplotlib · Slurm · UF HiPerGator · Vitest
