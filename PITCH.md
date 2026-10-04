# BreakingPoint: 3-minute pitch

**Setup before you start**

- Tab 1: `http://localhost:5173/?demo=soccer&speed=2`, opened but **paused** (press `Space` as soon as it loads).
  This is the one primary demo: **Soccer · Explosive Fatigue Screen** (repeated countermovement jump).
- Tab 2: `http://localhost:5173/?panel=library` (movement protocol library), used for ~10 seconds to show scale.
- Tab 3: `http://localhost:5173/?panel=lab` (Lab validation panel with figures).
- Backup demo if needed: `?demo=strength` (squat) or `?demo=pickleball` (forward lunge, beta).
- Optional live camera (`?sport=soccer` → Start live camera), with a teammate ready. **Only use it if the room
  lighting and space are good. The demo dataset is the default.**
- Presenter keys (demo tab): `Space` pause/resume · `1` `2` `4` speed · `S` skip to the end of the stage.
- Timing at 2×: calibration ≈ 12 s, monitored set ≈ 30 s.

Spoken lines are in plain text; *[stage directions are in brackets]*. About 450 words, roughly 2:55 at a calm pace.
**Don't navigate ten sports on stage. Demo one protocol well, then use the library to show scale.**

---

### 0:00–0:20 · Hook

*[Landing page: "Your movement. Your baseline."]*

Most training and form apps ask: *do you move like the ideal athlete?* But fatigue doesn't suddenly make an athlete
forget how to jump or squat. Their mechanics **drift**: a little less height, a slower push-off, a little more trunk
lean. Every rep still counts, so nobody notices until form has already broken.

### 0:20–0:35 · Core insight

BreakingPoint asks a different question: **are you still moving like yourself?** It learns how *you* move while fresh,
then watches for the moment your movement becomes *persistently* different from your own baseline.

### 0:35–1:30 · Demo: Soccer, Explosive Fatigue Screen

*[Switch to Tab 1, press `Space`. Point at the athlete card: Adam · Soccer · Repeated CMJ · Late-training screen.]*

This is a soccer explosive-fatigue screen on our demo dataset: a synthetic athlete whose landmarks run through exactly
the same pipeline as the live camera.

*[Calibration jumps play; "Learning Adam's baseline…".]* Six fresh jumps. For each one we measure jump height, explosive
velocity, flight time, push-off time, landing depth, trunk lean and left/right differences. That becomes *Adam's*
baseline. It's his baseline, not "ideal form".

*[Monitored set; bars fill the Form Drawdown chart.]* Now the set. Every jump gets a Movement Drift Score: how far it
sits from Adam's own baseline. Jumps one to seven: stable, even when one jump is a little off.
*[Reps 8–9 amber.]* Eight and nine: **drift emerging**, and it keeps building. *[Rep 10: red flash.]* Ten: **breaking
point**.

*[Point at the state card and contributors.]* It names the pattern, **explosive fatigue**, and says why: explosive
velocity is down four and a half standard deviations, jump height is down three and a half, and push-off time is
slower by two.
*[Point at the chart.]* This is our Form Drawdown, borrowed from quant risk dashboards. The dashed line marks where
drift actually began, rep seven, and the red line marks where we became confident.

### 1:30–1:55 · One platform, many sports

*[Switch to Tab 2: protocol library. Gesture at the primitive map.]*

We started with squats and repeated jumps because they're reliable movements to capture from a single camera. But
BreakingPoint isn't a squat classifier. Underneath the interface, sports map onto reusable movement protocols. Soccer,
basketball and volleyball can all use our jump-and-land primitive. Pickleball, tennis and badminton share a lunge
protocol, which is in beta today. The sport changes which movement we monitor and which metrics matter. The personal
baseline and the sequential change detector stay the same.

### 1:55–2:25 · Technical and validation

*[Switch to Tab 3: Lab validation.]*

Under the hood: on-device pose estimation, rep segmentation, a robust personal baseline, a multivariate drift score,
and sequential EWMA and CUSUM change detection. A detector like this has a sensitivity problem: too aggressive and one
bad rep is a false alarm, too conservative and real drift is caught late. So we treated it like a backtesting problem.

On UF's HiPerGator supercomputer we simulated **100,000** individualized athlete sessions with known change points,
varying drift, sensor noise, outliers, missing landmarks and natural variability, and swept **25,280** detector
configurations. The detector BreakingPoint uses was selected from those experiments, not chosen by hand. On held-out
sessions it raised false alarms in **2.2 %** of no-change sessions and caught **about 90 %** of drift, a median of
**four reps** after it began. The detector is calibrated at the movement-signal level and shared by every protocol;
sport-specific validation is next.

*(Every number here is from `results/VALIDATION_REPORT.md` of HiPerGator jobs 44695919/44695920: 89.6 % detection,
95 % CI 89.2–90.0 %.)*

### 2:25–2:45 · Impact

No force plate. No markers. No wearable. Any laptop or phone camera, and the video never leaves the device. That
puts within-athlete fatigue monitoring in reach of recreational and collegiate athletes, coaches, and return-to-play
settings. We're careful about what we claim: this is training information, not a diagnosis, and it does not predict
injuries.

### 2:45–3:00 · Close

Long term, a coach could define any repeatable movement and BreakingPoint could learn that athlete's movement signature.
In finance, we monitor systems for regime changes before risk compounds. **BreakingPoint doesn't ask whether you move
like the ideal athlete. It asks whether you still move like yourself.**

---

## Q&A cheat sheet

| question | answer |
|---|---|
| Isn't this just MediaPipe? | MediaPipe extracts the signal. Our contribution is the individualized temporal model: personal baseline, LOO-calibrated drift score, and sequential detection, validated by simulation. |
| Do you train a model per sport? | No. Fatigue detection here is change detection against your own baseline, so there's nothing sport-specific to train. A sport picks a protocol on a reusable primitive (squat, jump-and-land, lunge) plus terminology and featured metrics. |
| Is every sport in the library working? | No, and the UI says so. Squat and repeated jump are ready, forward lunge is beta, and everything else is roadmap and cannot be launched. Tests enforce that. |
| Did the HPC study validate soccer / pickleball? | No. The Lab validates the detector's statistical behaviour under controlled synthetic drift. It's calibrated at the movement-signal level; sport-specific clinical validation is future work. |
| Does the sport change the detector? | No. Sport profiles contain no detector parameters, and a test checks that every protocol runs with the identical exported config. |
| How do you avoid false alarms from one bad rep? | Each rep's input is capped at 2.5σ and smoothed by the EWMA, so one extreme rep can move the smoothed drift by at most 1σ, half the 2σ alarm level. It takes several elevated reps in a row to cross it. In the 100,000-session HiPerGator backtest, isolated bad reps triggered in 3.9 % of sessions; for the lunge, a test shows one malformed rep doesn't trigger. |
| What do labels like "explosive fatigue" mean? | They name the movement family with the largest standardized changes (explosive output, recovery speed, range of motion, asymmetry…). They describe movement change and are never diagnoses. |
| Monocular camera accuracy? | Not lab-grade, which is why we only compare an athlete with themselves from the same setup. Poor-quality reps are not scored. |
| Is the demo faked? | The demo athlete is synthetic, and labeled as such, but its landmarks go through the full real pipeline. When the breaking point fires is decided by the real detector at runtime. |
