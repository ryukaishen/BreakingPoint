# BreakingPoint: 3-minute pitch

**Setup before you start**

- Tab 1: `http://localhost:5173/?demo=1&speed=2`, opened but **paused** (press `Space` as soon as it loads).
- Tab 2: `http://localhost:5173/?panel=lab` (Lab validation panel with figures).
- Optional Tab 3: live camera (`?live=1`), with a teammate ready to squat side-on. **Only use it if the room
  lighting and space are good. The demo dataset is the default.**
- Presenter keys (demo tab): `Space` pause/resume · `1` `2` `4` speed · `S` skip to the end of the stage.
- Timing at 2×: calibration ≈ 10 s, monitored set ≈ 25 s. Total ≈ 40 s of playback.

Spoken lines are in plain text; *[stage directions are in brackets]*. About 430 words, roughly 2:50 at a calm pace.

---

### 0:00–0:25 · Hook

*[Landing page on screen.]*

Most injury-prevention and form apps ask one question: *is your form correct?* But fatigue doesn't suddenly make an
athlete forget how to squat. Their mechanics **drift**: a little less depth, a little more trunk lean, a slower drive.
Every rep still counts, so nobody notices until form has already broken.

### 0:25–0:45 · Core insight

We don't ask, "Does this look like the perfect squat?" We ask, **"Does this still look like *your* squat?"**
BreakingPoint first learns how *you* move while fresh. Then it watches for the moment your movement becomes
*persistently* different from your own baseline.

### 0:45–1:45 · Demo

*[Switch to Tab 1, press `Space`.]*

This is our demo dataset: a synthetic athlete whose landmarks run through exactly the same pipeline as the live camera.

*[Calibration reps play; right panel says "Learning Adam's baseline…".]*

First, six fresh reps. For every rep we extract knee and hip range of motion, depth, trunk lean, tempo, velocity, and
left/right symmetry, and build *Adam's* baseline. *[Baseline table appears.]* Notice it says "your baseline", not
"ideal human form".

*[Monitored set starts; bars appear on the Form Drawdown chart.]*

Now the working set. Every rep gets a Movement Drift Score: how many standard deviations it sits from Adam's own
baseline. Reps one to six: stable. Seven and eight: drift starts rising, but one or two odd reps aren't enough.
*[Rep 9 turns amber.]* Rep nine: **drift emerging**. *[Rep 10: red flash.]* Rep ten: **breaking point detected**.

*[Point at the right panel.]* And it answers "why did you flag me?": right knee range of motion is down 4.5 standard
deviations, trunk lean is up 3.5, and velocity is down 3.5. *[Point at the chart.]* This is our **Form Drawdown**,
borrowed from quant risk dashboards. The dashed line marks where the drift actually began, rep seven, and the red
line marks where we became confident. Afterwards, a recovery check tells the athlete how far they've returned toward
baseline.

### 1:45–2:15 · Technical

*[Switch to Tab 2: Lab validation.]*

Under the hood: on-device pose estimation, rep segmentation, a personal baseline with robust statistics, a
multivariate drift score, and sequential EWMA and CUSUM change detection.

BreakingPoint's live inference runs locally, so athletes don't need specialized hardware or cloud connectivity.
But sequential detectors have a sensitivity problem. Make them too aggressive and a single bad rep creates a false
warning. Make them too conservative and real drift is caught too late. We treated that like a quantitative
backtesting problem.

> **Say version A only if the HiPerGator run has completed** (numbers from `results/VALIDATION_REPORT.md` of that run):
>
> Using UF's HiPerGator supercomputer, we simulated **[N_HPC]** individualized athlete sessions with known change
> points, varying drift severity, sensor noise, outliers, missing landmarks, and baseline variability. We swept the
> detector's EWMA and CUSUM parameters across **25,280** configurations and measured false-positive rate, miss rate,
> and detection delay. The configuration BreakingPoint uses was selected from those experiments, not chosen by hand.
> On held-out sessions it raised false alarms in **[FPR_HPC]** of no-change sessions and caught **[TPR_HPC]** of drift,
> a median of **[DELAY_HPC]** reps after it began.
>
> **Version B (true today, from the completed local run):**
>
> We built a simulator of individualized athlete sessions with known change points, varying drift severity, sensor
> noise, outliers, missing landmarks, and baseline variability, and swept **25,280** detector configurations. In a
> **50,000-session** backtest, the selected configuration had a **2.2 %** false-positive rate on held-out no-change
> sessions and caught **89 %** of drift, a median of **4 reps** after it began. The same pipeline is packaged as a Slurm
> array for UF's HiPerGator, so we can scale it to a million sessions. The configuration BreakingPoint uses came from
> these experiments, not from hand-tuning.

*[Point at the personal-vs-population figure.]* And this is why personalization matters: the same detector using
population norms instead of your own baseline had eight times more false alarms and caught less than half the drift.

### 2:15–2:40 · Impact

No force plate. No markers. No wearable. Any laptop or phone camera, and the video never leaves the device. That
puts within-athlete fatigue monitoring in reach of recreational and collegiate athletes, strength coaches, and
physical-therapy return-to-play settings. And we're careful about what we claim: BreakingPoint provides training
information, not a diagnosis, and it does not predict injuries.

### 2:40–3:00 · Close

Next, we combine movement with heart rate, training load, sleep, and RPE across sessions, so a coach can see that an
athlete is reaching their breaking point earlier than their two-week baseline.

In finance, we monitor systems for regime changes before risk compounds. **BreakingPoint applies the same principle
to the athlete: don't wait until form fails. Detect when it starts changing.**

---

## Q&A cheat sheet

| question | answer |
|---|---|
| Isn't this just MediaPipe? | MediaPipe extracts the signal. Our contribution is the individualized temporal model: personal baseline, LOO-calibrated drift score, and sequential detection, validated by simulation. |
| Why not a machine-learning classifier? | There are no labels for "this athlete's fatigue onset", and a classifier would compare you to other people. A transparent statistical model calibrated to *you* is explainable and needs only 6 reps. |
| How do you avoid false alarms from one bad rep? | Per-rep input is winsorized at 2.5σ and the alarm needs ≥ 2 consecutive elevated reps plus the smoothed drift above 2σ. In the backtest, isolated bad reps triggered in 3.9 % of sessions. |
| Why EWMA and not CUSUM? | We tested both, plus EWMA+CUSUM and a naive rule. Under our selection rule EWMA won narrowly; CUSUM is still used to estimate when drift began. |
| Monocular camera accuracy? | Not lab-grade, which is why we only compare an athlete with themselves from the same setup. Systematic projection bias cancels, and poor-quality reps are not scored. |
| What if the camera moves mid-session? | Our stress test shows false alarms rise if noise increases after calibration. That's why we show capture quality and advise recalibrating. |
| Injury prediction? | No. We detect fatigue-associated movement drift. Validating against force plates and real fatigue protocols is next. |
| Is the demo faked? | The demo athlete is synthetic, and labeled as such, but its landmarks go through the full real pipeline. When the breaking point fires is decided by the real detector at runtime. |
