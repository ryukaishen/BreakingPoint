# Phase 4A.5: measurement validity and evaluation readiness

Status: complete. **This is for review.** Phase 4B has not been started, and nothing here goes into the app.

**Decisions after review (Adam, 2026-10-09).** They are recorded in `research/protocols/phase4b_preanalysis_checks.md`:

- **Jump 4B analysis:**
  - **Path B** (experimental P1 timing, research only) is the primary analysis.
  - **Path A** (unchanged production pipeline) runs alongside it as the comparison.
  - Path B is not independent validation, because P1 was developed on this same dataset.
- **P1:** research evaluation only. The production jump pipeline is unchanged.
- **P2 and P3:** run as experimental score ablations for the jump only. The shipped feature weights do not change, and squat and lunge weights are untouched.
- **P4 and P5:** deferred.
- **Revised scoring:** the original HiPerGator performance numbers are not attributed to any revised scoring.

## What this checks

This phase checks whether BreakingPoint's measurements mean what their names say before any fatigue-associated or correct-versus-incorrect comparison is run.

Method:
- Motion capture from the two public datasets is viewed through a virtual camera and run through the app's own code (smoothing, frame metrics, rep segmentation, rep measurements), imported unchanged.
- The results are checked against the datasets' laboratory measures.

Limits of the method:
- **Offline best case.** There is no MediaPipe tracking and no occlusion. Tracking noise appears only where it is added on purpose.
- **No outcomes compared.** Nothing here compares fresh with post-protocol jumps, or correct with incorrect reps, by any score or measurement. Condition and correctness appear only in the missing-data audit.

Every number below comes from:
- `research/reports/phase4a5_tables.md` (generated)
- `data/processed/qa/phase4a5_summary.json`

Code is in `research/measurement/`.

## Answers

### Validated measurements

A measurement passes when it is measured in at least 90% of trials and its within-person (repeated-measures) correlation with the lab criterion is at least 0.70, with a lower 95% bound of at least 0.50. "Robust" means it also passes in the pure side view and with added jitter.

**Countermovement jump, advised view (35°, 3.5 m), app as shipped:**
- These pass in the advised view, but none is robust, because the side view finds only 88% of jumps:

  | Measurement | Within-person r |
  |---|---|
  | jump height (hip rise) | 0.86 |
  | countermovement depth | 0.92 |
  | peak trunk lean | 0.96 |
  | landing knee flexion | 0.79 |
  | reactive strength index (modified) | 0.80 |
  | unweighting + braking duration | 0.79 |

- Unweighting + braking duration follows change but reads about 0.13 s shorter than the centre-of-mass definition.
- With the timing change proposed below (P1), the same six pass every robustness check. P1 was chosen after seeing these results on this same dataset, so this is not independent validation of P1.

**Squat (REHAB24-6), advised view, app as shipped:**

| Measurement | Within-person r |
|---|---|
| peak trunk lean | 0.99 |
| depth | 0.99 |
| hip range of motion | 0.84 |
| knee range of motion, camera side | 0.83 |

Squat segmentation (revised wording after review):
- **Strict, pre-specified metric (IoU >= 0.5): precision, recall and F1 0.76.** This is the segmentation accuracy figure.
- **Lenient linking diagnostic** (at least half of a found rep inside an annotated rep):
  - every one of the 191 scored annotated reps has exactly one linked found rep;
  - no found rep is left unlinked;
  - the count is right in every video;
  - this holds with jitter and in the side view.
- **What the lenient diagnostic shows.** It checks detection and counting only. It is not boundary accuracy, and not perfect segmentation.
- **Boundary offsets.** The app's rep boundaries differ from the annotators' by a median +0.77 s at the start and -0.64 s at the end.

### Measurements requiring correction

| Measurement | Problem | Evidence |
|---|---|---|
| Jump flight time | Does not follow true flight within a person under any smoothing tested; it reads about 0.41 s too long in the app | Within-person r 0.09 (app), at most 0.17 (any variant). The ankle-height rule fires on heel rise, about 0.1 s before take-off, and the smoothing adds 0.27 s. Even a foot-based rule that removes most of the bias reaches only r 0.30, because each person's flight times vary by about 28 ms (SD), about one frame at 30 fps. Its error also follows where the feet land (r 0.76) |
| Jump touchdown and everything timed from it | Fires 0.37 s after force-plate contact | Median 367 ms (IQR 337 to 406); 333 ms of it is the smoothing |
| Jump landing knee flexion | Read 0.37 to 0.87 s after contact, after the true landing peak | Within-person r 0.79 now; 0.86 with corrected timing (side view 0.84 to 0.91) |
| Jump propulsion duration | Within-person agreement just below the threshold | r 0.73, lower bound 0.498; no smoothing variant fixes it, because take-off timing is the problem |
| Left-right difference (jump, squat, lunge) | Does not follow the 3D left-right difference from one camera | Jump r -0.10 (advised), 0.15 (side); squat 0.03; lunge 0.35 |
| Squat rep duration | Weak within-person agreement with the app's own rule applied to the 3D skeleton | r 0.42 [0.08, 0.94]; the criterion itself may be at fault (section 7) |
| Lunge knee range of motion, depth, hip range of motion | Below threshold on the in-place split squat | r 0.67, 0.67, 0.68 |
| Jump coverage | The app drops the highest jumps | 22 of 256 trials give no jump; missed jumps have longer true flight (0.46 vs 0.40 s); see section 6 |

### Remaining limitations

1. **These are best-case numbers.** Real MediaPipe output adds tracking noise, occlusion and lost frames. The jitter tested here is white noise at assumed levels (0.002 and 0.004 image heights), not measured MediaPipe noise. Whether MediaPipe's VIDEO mode already smooths landmarks before the app does is unknown and must be checked; if it does, the live lag is larger than measured here.
2. **Reference measures have their own error.**
   - Take-off comes from the centre-of-mass velocity's free-fall line. Its landing estimate agrees with the force plate to +12 ms (IQR 4 to 16), so take-off may be about 10 ms early.
   - OpenSim angles are 3D, while the app's angles are 2D.
   - The REHAB criteria come from the skeleton's joint centres.
3. **Small samples.** 43 jumpers (42 with three jumps in each condition, sub44 with two); 9 squatters and 8 split-squatters.
4. **One camera height** (hip height) and synthetic visibility; no far-limb occlusion.
5. **The decision thresholds** (90% coverage, r 0.70, lower bound 0.50) are conventional choices. They were fixed in code before any variant result was computed. After the first run, the verdict labels were reworded to name the check that failed; the thresholds did not change.
6. **The foot-based flight rule is a prototype** outside the app's state machine.

### Recommended production changes (none implemented)

| # | Change | Main evidence | Decision |
|---|---|---|---|
| P1 | Time jumps from a separate, lightly filtered landmark stream (causal 2nd-order Butterworth, 6 Hz). Keep the One Euro filter for angles. Countermovement jump only | Touchdown 367 to 87 ms. All 256 jumps found (was 234). Participants with a usable 3 + 3: 30 to 38. Landing knee flexion r 0.79 to 0.86. Side-view coverage 88% to 99%. Robust to tested jitter. Chosen on this same dataset, so not independent validation | Research evaluation only (your decision, 2026-10-09) |
| P2 | Take flight time out of the jump Form Change Score (weight 0), and stop presenting it as flight time | No variant reaches r 0.2. The 30 fps resolution limit means no rule fixes it | Recommended |
| P3 | Take the jump left-right difference out of the score (weight 0). Keep the squat one for now, but do not interpret it | r near 0 in every view. The squat feature was part of the HiPerGator simulation, so changing it is a separate decision | Recommended for the jump; the squat is your call |
| P4 | Make the segmenter's standing-reference update time-based instead of per-frame | Breaks only at 250 fps (18 to 36 countermovements never seen); fine at 15 to 60 fps | Low priority |
| P5 | Setup advice: keep 30 to 45° for jumps; do not suggest more than 45° | Landing knee r 0.79 at 35°, 0.70 at 50°, 0.39 at 70° | Wording only, later |

Section 9 gives the before/after evidence, regression risks and required tests for each.

### Is Phase 4B scientifically ready?

- **Jump (fatigue-associated, exploratory): not as drafted in v02.** It is ready under draft v03 once you choose the measurement path:
  - **Path A: the app as shipped.** Six measurements are interpreted, 30 participants.
  - **Path B: after P1.** 38 participants, with P1 approved, implemented, and these checks re-run.

  I recommend Path B. Path A's missing jumps are systematic: the incomplete participants are taller, heavier, mostly male and jump higher, and in the ACL group fresh jumps are missed more often than post-protocol ones. Path A also reads landing knee flexion after the landing peak.
- **REHAB24-6 squats (correct vs incorrect): ready under draft v03.** Four measurements are interpreted, and found reps are linked to annotations by the "inside" rule instead of IoU >= 0.5.
- **REHAB24-6 split squats: descriptive only.** The app's lunge rule misses correct reps more often than incorrect ones (recall 0.72 vs 0.93), and its measurements fall below threshold on this exercise.

Neither dataset can validate the production sequential alert. The v03 drafts say so.

---

## 1. What was checked and how

**References (jump dataset).** All are derived independently of the app.

| Reference | How it is derived |
|---|---|
| Contact | The force-plate contact index |
| Take-off | Where the centre-of-mass vertical velocity joins its free-fall line (v = c − g·t, fitted ±80 ms around the apex). The dataset's COM acceleration is a constant −9.807, so it cannot be used |
| Flight | Median 0.408 s |
| Jump height | Centre-of-mass rise per 3D leg length |
| Depth | Centre-of-mass drop per 3D leg length |
| Durations | From centre-of-mass movement onset, lowest point and take-off |
| Trunk inclination | Sagittal, from the 3D markers |
| Landing knee flexion | OpenSim peak in the 0.5 s after contact, camera-side leg |
| Left-right difference | OpenSim |

Two checks on these references:
- The free-fall landing agrees with the force plate to +12 ms (IQR 4 to 16).
- One trial's force-plate index is wrong (sub39_CMJ_t3); its kinematic index is used instead.

**Trials that start crouched.** In 9 trials the person stands still but already crouched, with starting hip height 6 to 27% below their own highest start:
- sub15_f_t3
- sub32_t1, sub32_f_t2, sub32_f_t3
- sub34_t1, sub34_f_t1, sub34_f_t2
- sub40_f_t2, sub40_f_t3

The app takes its standing reference from those frames, so all their measurements are mis-referenced. They are excluded, leaving 247 trials in scope.

**Camera set-ups.**
- 35° (advised) and 0°, 20°, 50°, 70° at 3.5 m.
- 35° at 2.5 m and 4.5 m.
- The advised camera at 15 and 60 fps.
- An ideal orthographic side view at 30 and 250 fps.

The rebuilt 35° and 0° streams reproduce Phase 4A exactly (256 of 256 recordings each).

**Signal-chain variants.** These were fixed before results; all use the app's own segmenter and measurement code:

| Variant | Timing | Angles |
|---|---|---|
| App as shipped | One Euro | One Euro |
| None | no smoothing | no smoothing |
| Causal 6 Hz Butterworth | Butterworth | Butterworth |
| Dual: unsmoothed timing | unsmoothed | One Euro |
| Dual: Butterworth timing | Butterworth | One Euro |

`tests/measurement_variants.test.ts` checks that the "app as shipped" variant reproduces the app's offline path exactly.

**Jitter.** White Gaussian noise of 0.002 and 0.004 image heights (about 1.4 and 2.9 px at 720p) on every landmark, three seeds each, advised views.

**Statistics.**
- Repeated-measures correlation (Bakdash and Marusich 2017), with participant-clustered bootstrap 95% intervals (2,000 resamples) and leave-one-participant-out ranges.
- Medians and IQRs across trials, and across participants' own medians.

## 2. Why the app's touchdown is late

Each step adds one part of the app's chain. Errors are app minus reference, in ms, over the in-scope trials. The change columns are paired, trial by trial.

| Step | Take-off | Touchdown | Flight | Touchdown change | Flight change |
|---|---|---|---|---|---|
| 0. App thresholds on the true 3D ankle height, 250 Hz | -119 | +40 | +162 | | |
| 1. + app segmenter, 30 fps, ideal side view, no smoothing | -102 | +56 | +165 | +18 | +1 |
| 2. + perspective camera at the advised place | -93 | +53 | +145 | 0 (range -200 to +133) | 0 |
| 3. + the app's One Euro smoothing (the app) | -44 | +367 | +411 | +333 | +267 |

- **Rule and landmark (step 0).** The take-off threshold (ankle 3.5% of leg length above standing) is crossed while the heel lifts, about 0.12 s before the feet leave the ground. Touchdown (back below 1.5%) comes about 40 ms after contact, when the heel settles. Even with perfect tracking, the app's "flight time" therefore runs about 0.16 s long.
- **Frames (step 1).** Sampling at 30 fps delays each event by about half a frame (+18 ms touchdown). Flight is unchanged, because both ends shift.
- **Perspective (step 2).** No delay in most trials. The tails come from where the feet land (section 5).
- **Smoothing (step 3).** The One Euro filter is effectively a fixed 1.2 Hz first-order low-pass:
  - Its speed term barely acts. Landmark speeds are in image heights per second, so beta 0.05 lifts the cutoff only to 1.25 Hz (median in flight; below 1.31 Hz in every trial).
  - With a 133 ms time constant, the smoothed ankle is still 21% of leg length above standing at true contact. It needs another 356 ms (median) to fall below the 1.5% threshold.
  - The same filter on the 250 Hz ideal stream gives +308 ms. The lag is the filter's, not the frame rate's.
- **Per participant.**
  - Touchdown error: median of participant medians 361 ms (range 311 to 459).
  - The delay is present for every participant, not driven by a few.

## 3. Smoothing alternatives

Advised view, no added jitter.

| Variant | Jumps found (of 256) | Touchdown error, ms | Flight error, ms | Touchdown error by participant, ms (median, range) |
|---|---|---|---|---|
| App as shipped (One Euro 1.2 Hz) | 234 | 367 (337 to 406) | 411 | 361 (311 to 459) |
| No smoothing | 255 | 53 (36 to 67) | 145 | 55 (10 to 105) |
| Causal 6 Hz Butterworth | 256 | 87 (73 to 100) | 153 | 88 (53 to 134) |
| Dual: unsmoothed timing, One Euro angles | 255 | 53 | 145 | 55 |
| Dual: 6 Hz timing, One Euro angles | 256 | 87 | 153 | 88 |

With jitter, three seeds each:

| Variant | Jumps found, 0.002 | Jumps found, 0.004 | Trials with a spurious second jump, 0.004 |
|---|---|---|---|
| App as shipped | 234 to 236 | 234 to 235 | none |
| No smoothing | 254 to 255 | 252 to 253 | 1, 1, 0 |
| 6 Hz Butterworth | 255 to 256 | 255 to 256 | 0, 1, 0 |

Touchdown error barely moves with jitter. No smoothing is fragile: with jitter, its jump-height agreement fell to r 0.50 in one seed. The Butterworth variants stayed at 0.84 or above. That is why P1 uses 6 Hz timing rather than none.

**Candidate flight rule (prototype).** This prototype keeps the same thresholds but uses the lowest point of each foot (heel or toe landmark) instead of the ankle.

Advised view, unsmoothed:

| | Ankle (current) | Foot (prototype) |
|---|---|---|
| Touchdown error, ms | +39 | -2 |
| Flight error, ms | +150 | +58 |
| Within-person r | 0.21 | 0.30 |

The within-person spread of the foot rule's error (27 ms SD) equals the spread of true flight itself (28 ms SD). Flight time cannot follow a person's changes at 30 fps with any of these rules.

## 4. Jump measurements against their criteria

Advised view.

| Measurement | Coverage, app | r (app) [95% CI] | r (dual 6 Hz) | Side-view r (app) | r with 0.002 jitter (app, 3 seeds) | Verdict (app as shipped) |
|---|---|---|---|---|---|---|
| Jump height | 227/247 | 0.86 [0.81, 0.90] | 0.86 | 0.87 | 0.85 to 0.86 | advised view only |
| Countermovement depth | 227/247 | 0.92 [0.88, 0.94] | 0.92 | 0.92 | 0.91 to 0.92 | advised view only |
| Peak trunk lean | 227/247 | 0.96 [0.94, 0.97] | 0.96 | 0.97 | 0.95 to 0.96 | advised view only |
| Landing knee flexion | 227/247 | 0.79 [0.71, 0.86] | 0.86 | 0.84 | 0.79 | advised view only |
| Reactive strength index (mod.) | 227/247 | 0.80 [0.61, 0.92] | 0.80 | 0.81 | 0.80 | advised view only |
| Unweighting + braking duration | 227/247 | 0.79 [0.51, 0.98] | 0.81 | 0.80 | 0.79 to 0.81 | advised view only; reads 0.13 s short |
| Propulsion duration | 227/247 | 0.73 [0.498, 0.86] | 0.70 | 0.77 | 0.70 to 0.73 | not validated |
| Flight time | 227/247 | 0.09 [-0.03, 0.20] | 0.13 | 0.08 | 0.09 | not validated |
| Left-right difference | 227/247 | -0.10 [-0.29, 0.13] | -0.10 | 0.15 | -0.14 to -0.05 | not validated |

Notes on the table:
- **What "advised view only" means.** Every one of these passes the correlation checks in the side view and with jitter. They fail robustness only because the side view finds 217 of 247 jumps (88%). With dual 6 Hz timing they are all "validated" (99% side-view coverage).
- **Unweighting + braking duration.** Its wide interval comes from one participant: the leave-one-out range is 0.74 to 0.98.
- **Landing position.** Within a person, two measurements' errors follow how far the feet land from where they stood, measured along the camera's line of sight:
  - Flight time: r 0.76. A one-SD change in landing position moves it by 0.77 of its own within-person SD.
  - Jump height (hip rise in the image): r -0.45, with an effect of 0.22 SD. Drifting away from the camera makes the rise look smaller.

  Dual timing removes the flight-time effect (0.17) but not the jump-height one (-0.40, 0.19 SD). That is perspective, not timing.
- **Per participant.** Per-participant timing errors are in the tables file.

## 5. Camera angle, distance and frame rate

Advised distance 3.5 m unless stated.

| Camera | Jumps found: app / dual 6 Hz | Landing knee r: app / dual | Trunk lean r (app) | Depth r (app) | Jump height r (app) |
|---|---|---|---|---|---|
| 0° (side) | 223 / 254 | 0.84 / 0.91 | 0.97 | 0.92 | 0.87 |
| 20° | 231 / 256 | 0.84 / 0.90 | 0.97 | 0.92 | 0.86 |
| 35° (advised) | 234 / 256 | 0.79 / 0.86 | 0.96 | 0.92 | 0.86 |
| 50° | 237 / 256 | 0.70 / 0.76 | 0.93 | 0.92 | 0.86 |
| 70° | 236 / 256 | 0.39 / 0.44 | 0.82 | 0.92 | 0.86 |
| 35°, 2.5 m | 234 / 254 | 0.79 / 0.85 | 0.96 | 0.91 | 0.85 |
| 35°, 4.5 m | 235 / 256 | 0.80 / 0.86 | 0.95 | 0.92 | 0.87 |

- **Angle.** Angles (knee, trunk) degrade beyond about 45°. Depth and jump height do not depend on the angle. Distance between 2.5 and 4.5 m makes little difference.
- **Frame rate** (advised camera, upright trials):

  | | 15 fps | 30 fps | 60 fps |
  |---|---|---|---|
  | App: jumps found | 209/247 | 227/247 | 235/247 |
  | App: touchdown error, ms | +412 | +367 | +343 |
  | Dual 6 Hz: jumps found | 246/247 | 247/247 | 247/247 |
  | Dual 6 Hz: touchdown error, ms | +86 | +87 | +86 |

  A slow device running MediaPipe at 15 fps would miss more jumps with the app as shipped.
- **Per-frame constants.** The segmenter's standing reference moves a fixed share per frame. At 250 fps it follows the hips down during the countermovement, and 36 dips (app) or 18 (no smoothing) are never seen. This does not occur at 15 to 60 fps.

## 6. Missing jumps: who and why (app as shipped, advised view)

**Why trials are missing.** 22 trials are missing:

| Reason | Trials |
|---|---|
| Detected flight longer than the 1.0 s limit | 15 |
| Touchdown never detected | 5 |
| Crouched start | 2 |

The smoothing lag pushes detected flight to the true flight plus about 0.41 s, so the 1.0 s limit removes the highest jumps. Landing a few centimetres farther from the camera makes the unsmoothed ankle look raised after landing:

| | Missed jumps | Found jumps |
|---|---|---|
| Landing position, m (+ = farther from the camera) | +0.029 | -0.017 |
| Apparent ankle lift after landing, % leg | +0.66 | -0.65 |

Through a 1.2 Hz filter, that small offset keeps the smoothed ankle above 1.5% for a long time. Unsmoothed, only 2 trials stay above 1.5%.

**Missing trials (of trials) by group and condition:**

| | Fresh | Post-protocol |
|---|---|---|
| ACL | 9/62 | 6/62 |
| Control | 3/66 | 4/66 |

**Who is incomplete.** Participants without all 3 + 3 jumps (11 of 43), compared with the complete 32:

| Measure | Complete (32) | Incomplete (11) | Standardized difference | p (Mann-Whitney) |
|---|---|---|---|---|
| Height, m | 1.69 | 1.83 | 1.15 | 0.004 |
| Mass, kg | 62 | 80 | 1.06 | 0.004 |
| Leg length, m | 0.91 | 0.99 | 1.06 | 0.004 |
| Force-plate jump height before the protocol, cm | 11.2 | 13.9 | 1.06 | 0.003 |
| True flight time (mean of all trials), s | 0.39 | 0.47 | 1.24 | 0.002 |
| COM rise per leg length (mean of all trials) | 0.42 | 0.54 | 1.72 | < 0.001 |
| Men | 10 of 32 | 10 of 11 | | Fisher 0.001 |
| ACL group | 14 of 32 | 7 of 11 | | Fisher 0.31 |

At the trial level, missed jumps had longer true flight (0.464 vs 0.404 s, p 0.004) and higher COM rise (0.57 vs 0.44 per leg).

**Consequence.** A complete-case analysis with the app as shipped over-represents women and lower jumpers. In the ACL group it also loses more fresh jumps than post-protocol ones, which would shrink any fresh-versus-post difference.

**Sample size by path** (upright trials only):

| | App as shipped | Dual 6 Hz timing |
|---|---|---|
| 3 + 3 | 30 (16 control, 14 ACL; 21 women, 9 men) | 38 (20 control, 18 ACL; 22 women, 16 men) |
| At least 2 + 2 | 36 | 40 |
| At least 1 + 1 | 42 | 43 |

**Sensitivity analyses.** Draft v03 plans these, all reported side by side:
- complete upright 3 + 3 (primary);
- per-person means for everyone with at least 1 + 1;
- at least 2 + 2;
- side view;
- sex-weighted;
- if P1 is approved, the full 38 against the app-as-shipped 30.

Missingness is tabled by group, condition, sex and jump height before any outcome.

## 7. REHAB24-6: segmentation and measurements

**Matching rules.** Matching is one-to-one by highest score, with the 4 mocap-error squat reps excluded. Three rules are reported:
- IoU >= 0.5, the v02 protocol's rule;
- IoU >= 0.3;
- "inside >= 0.5": at least half of the found rep lies inside the annotated one.

**Segmentation, app as shipped:**

| | Squat, 35° (advised) | Squat, side | Split squat, side (advised) | Split squat, 35° |
|---|---|---|---|---|
| IoU >= 0.5: precision / recall / F1 | 0.76 / 0.76 / 0.76 | 0.75 / 0.75 / 0.75 | 0.64 / 0.53 / 0.58 | 0.68 / 0.56 / 0.61 |
| Lenient linking diagnostic (inside >= 0.5), not boundary accuracy: TP / FP / FN | 191 / 0 / 0 | 191 / 0 / 0 | 145 / 0 / 29 | 143 / 0 / 31 |
| Lenient linking diagnostic: precision / recall / F1 | 1.0 / 1.0 / 1.0 | 1.0 / 1.0 / 1.0 | 1.0 / 0.83 / 0.91 | 1.0 / 0.82 / 0.90 |
| Lenient linking diagnostic, F1 by person, median (range) | 1.0 (1.0 to 1.0) | 1.0 | 0.95 (0.69 to 1.0) | 0.94 (0.67 to 1.0) |
| Count error per video, median (range) | 0 (0 to 0) | 0 | -3 (-9 to 0) | -4 (-10 to 0) |
| Start / end vs annotation, s (median) | +0.77 / -0.64 | +0.78 / -0.64 | +0.89 / -0.68 | +0.87 / -0.67 |
| Recall of correct / incorrect reps (inside) | 1.0 / 1.0 | 1.0 / 1.0 | 0.72 / 0.93 | 0.68 / 0.94 |

- **Squats.** The strict metric, IoU >= 0.5, gives F1 0.76: a quarter of the found reps overlap their annotated rep by less than half of the combined interval. The main reason is the convention: the annotations include the standing pause before and after each rep, while the app's rep starts once the hips have dropped 6% of leg length. The lenient diagnostic shows every scored annotated rep has one found rep mostly inside it, with exact counts, and it stays that way under jitter. It does not show that the boundaries are right; they are not, by the convention above.
- **Squat boundaries against the app's own rule on the 3D skeleton** (F1 0.98):

  | | App as shipped | Unsmoothed | 6 Hz |
  |---|---|---|---|
  | Start, ms | +198 | +84 | +117 |
  | End, ms | +68 | -66 | -33 |

  The smoothing delays squat rep boundaries by about 0.1 s too. It shifts start and end alike, so rep duration changes little.
- **Split squats.** The app's lunge rule needs the hip to come back near standing height between reps. In this in-place split squat it often does not, so reps merge (count error -3 per video). Correct reps are missed more often than incorrect ones.
- **App definition on split squats.** The app's definition applied to the 3D skeleton with an upright standing reference does not separate split-squat reps either (F1 0.22). It is not a usable criterion for this exercise.
- **Squat measurements against the 3D skeleton** (within-person r [95% CI], advised view):

  | Measurement | r [95% CI] | Status |
  |---|---|---|
  | Trunk lean | 0.99 [0.98, 0.99] | passes |
  | Depth | 0.99 [0.98, 1.00] | passes |
  | Hip range of motion | 0.84 [0.67, 0.93] | passes |
  | Knee range of motion, camera side | 0.83 [0.74, 0.92] | passes |
  | Rep duration | 0.42 [0.08, 0.94] | does not pass |
  | Left-right difference | 0.03 [-0.19, 0.26] | does not pass |

  The rep-duration criterion uses a fixed standing height while the app's adapts, so this check is weak in both directions. Split squats: trunk lean 0.97 passes; knee 0.67, depth 0.67 and hip 0.68 do not.

## 8. Corrections to the Phase 4A report

The Phase 4A report (`phase4a_dataset_integration.md`) is left as it was; these corrections apply to it:

1. "Every trial starts with the participant standing still." True, but 9 trials start still and crouched (section 1).
2. "Flight time from the foot markers, about 450 ms." This overstates true flight: the toe marker rises about 68 ms (median) before take-off as the foot rolls. The free-fall reference gives 408 ms.
3. "Both still change consistently with the true quantities, which is what comparing an athlete with their own baseline needs." True for landing knee flexion (within-person r 0.79), not for flight time (0.09).
4. The explanation for missed jumps (smoothing lag plus landing farther from the camera) is confirmed. Add the 1.0 s flight limit, which removes the highest jumps.

## 9. Production change proposals (not implemented; each needs your approval)

### P1. Separate, lightly filtered timing for the countermovement jump

**Change.**
- In the jump path only, feed the segmenter a copy of the landmarks filtered by a causal 2nd-order Butterworth at 6 Hz.
- Measure angles from the existing One Euro stream, read at the same instants.
- Squat and lunge are unchanged.

The research version is `research/measurement/variants.ts` (`dual_butter6`).

**Before / after** (advised view):

| | Before | After |
|---|---|---|
| Touchdown error, ms | 367 | 87 |
| Jumps found (of 256) | 234 | 256 |
| Usable 3 + 3 participants | 30 | 38 |
| Side-view coverage | 88% | 99% |
| Coverage at 15 fps | 209/247 | 246/247 |
| Landing knee flexion r, advised | 0.79 | 0.86 |
| Landing knee flexion r, side | 0.84 | 0.91 |
| Flight error, ms | +411 | +153 (still invalid, see P2) |
| Jitter: jumps found | | 255 to 256 |
| Jitter: trials with a spurious second jump | | at most 1 per 256 |

**Regression risks.**
- Live MediaPipe noise is unknown, may be larger, and is correlated rather than white. More false take-off or touchdown events are possible.
- MediaPipe's own smoothing in VIDEO mode is uncharacterized.
- The jump demo's synthetic athlete goes through the same path, so jump demo numbers change. Tests that use the jump demo may need reviewed updates (`tests/explain.test.ts`, `tests/research_pipeline.test.ts`, `tests/sports.test.ts`), and the demo files belong to the other session's Stage 2 work.
- Saved jump baselines (per-athlete storage) were measured on the old timing. Comparing new reps with them would look like a large change, so they need a version mark and recalibration.
- The detector, the shipped config and the HiPerGator study are untouched.

**Tests required.**
- This harness as a regression check. Advised view:
  - coverage at least 98%;
  - touchdown median at most 120 ms;
  - landing knee r at least 0.80;
  - no more than one jump per trial without jitter;
  - at most 1% of trials with a second jump at 0.004 jitter.
- Unit tests for the filter (exist in research).
- 15, 30 and 60 fps runs.
- The app's test suite, with any changed expectation reviewed.
- A stored-baseline version test.
- `parity`, `parity_shipped` and `detector_shipped` tests unchanged.
- Then the real-footage MediaPipe check before release.

### P2. Flight time out of the jump score

**Change.** Set its weight to 0 in the jump feature set, and do not show it as "flight time".

**Evidence.**
- Within-person r is at most 0.17 under any smoothing, and 0.30 with the foot-based prototype.
- True within-person spread (28 ms SD) is about one frame at 30 fps.
- Its error follows landing position (r 0.76).

**Risks.**
- The jump score's composition changes; the other weights renormalise.
- `shared/feature_catalog.json` changes, so the catalog guard in `tests/copy.test.ts` needs a deliberate update.
- The HiPerGator study is unaffected; it simulated squat-like features only.

**Tests.**
- The catalog guard, updated on purpose.
- Jump demo expectations, reviewed.

### P3. Left-right difference

**Change.** Weight 0 for the jump left-right difference.

**Evidence.**
- Jump: r -0.10 advised, 0.15 side.
- Squat: 0.03. Lunge: 0.35.
- Nothing tested follows the 3D difference from one camera.

**The squat is a separate decision.** The squat version was part of the HiPerGator simulation, so changing it is yours to make. It should at least not be interpreted.

**Risks and tests.** As for P2.

### P4. Time-based standing reference

**Change.** Convert the per-frame update shares to per-second rates that give identical results at 30 fps.

**Evidence.** It fails only at 250 fps here.

**Tests.** Byte-identical results at 30 fps on the demos and these data; coverage at 60 and 120 fps.

### P5. Camera advice

**Evidence.** Angles degrade beyond about 45°.

**Change.** Advice wording only, through the Stage 2 handoff, later.

## 10. Phase 4B: readiness and protocol drafts

New drafts:
- `research/protocols/jump_fatigue_v03.md`
- `research/protocols/rehab24_6_v03.md`

The v02 drafts are kept unchanged.

The jump draft:
- treats the dataset as an exploratory analysis of fatigue-associated jump changes, not as validation of the production alert;
- interprets only validated measurements;
- reports the Form Change Score both as the app computes it and restricted to validated measurements;
- excludes crouched starts;
- requires the missing-data sensitivity analyses;
- runs on one named measurement path.

The REHAB draft:
- drops segmentation (done here);
- links reps by the "inside" rule;
- makes squats primary and split squats descriptive;
- interprets four squat measurements.

Both need your approval, and the jump draft needs the Path A or B decision first.

## Reproduce

Data preparation as in Phase 4A, then:

```bash
python -I research/measurement/build_streams.py
npx vite-node research/measurement/run_variants.ts
python -I research/measurement/analyze.py
python -I -m unittest discover -s research/tests
npx vitest run tests/measurement_variants.test.ts
```

Everything under `data/processed/measurement/` is regenerated; nothing is committed from it.
