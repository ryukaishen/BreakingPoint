# Protocol (draft v03): exploratory comparison of fresh and post-protocol jumps

**Status: DRAFT, awaiting approval. Nothing in this protocol has been run.** It replaces draft v02 (`jump_fatigue_v02.md`, kept unchanged for the record) after the Phase 4A.5 measurement-validity checks (`research/reports/phase4a5_measurement_validity.md`). Once approved, its SHA-256 is recorded in every result file, and later changes are listed as deviations.

## What changed from v02, and why

| Change | Reason (Phase 4A.5) |
|---|---|
| Measurements are split into **validated** and **not validated**; only validated ones are interpreted | Flight time, left-right asymmetry and propulsion duration do not follow their lab criteria within a person (repeated-measures r 0.09, -0.10 and 0.73 with a lower bound below 0.5), so a change in them cannot be read as a change in movement |
| The Form Change Score is reported two ways: as the app computes it (all nine measurements) and restricted to the validated measurements | The shipped score includes the three measurements above; flight time's error also follows where the feet land (within-person r 0.76 with landing depth), so the full score can move when only landing position changes |
| Trials that start crouched are excluded (9 trials: sub15, sub32, sub34, sub40) | The app takes its standing reference from the first still frames; these trials start 6 to 27% lower than the same person's other trials, so every measurement in them is referenced to the wrong posture |
| Missing-data sensitivity analyses are required, and the primary sample is described by sex, size and jump height | With the app as it is, the jumps it misses are the higher ones (true flight 0.46 vs 0.40 s); participants with incomplete data are taller, heavier, mostly male and jump higher, and fresh jumps are missed more often than post-protocol ones in the ACL group |
| The measurement path is fixed before 4B starts: either the app as it is, or an approved production change, re-checked | The app's touchdown fires 0.37 s late because of its smoothing; a corrected timing path would change coverage, landing knee flexion and the sample |
| The side view is a coverage and robustness check only | With the app as it is, the side view finds a jump in only 88% of upright trials |

## Question

Measured with BreakingPoint's own rep measurements and Form Change Score, and compared with each person's own fresh jumps, how do a person's jumps after the fatigue protocol differ from their jumps before it?

This is an **exploratory offline biomechanics evaluation of fatigue-associated jump changes**. It is not a test of the app's sequential alert, not evidence that the app detects fatigue, and not a measure of webcam or MediaPipe accuracy.

## Decision needed before this protocol can run

Phase 4A.5 recommends a production change to how the app times jumps (report, section 9). This protocol runs on exactly one measurement path, named in every result file:

- **Path A, the app as shipped.** Primary sample: participants with three upright fresh and three upright post-protocol jumps found in the advised view.
- **Path B, the app after an approved change.** This applies only if Adam approves the change and it is implemented, tested, and re-checked with the Phase 4A.5 analysis. The validity table and the sample are then re-derived before any outcome is computed.

No result from one path is reported as if it came from the other.

## Data

- Countermovement jumps from the jump-landing dataset (Calisti, Mohr, Federolf 2025), measured through the app's code from motion capture seen by a virtual camera.
- **Primary view:** 35 degrees oblique, 3.5 m, hip height (the app's advice).
- **Exclusions, fixed:**
  - the 9 trials that start crouched (`starts_upright = false` in `data/processed/measurement/references/jump.json`);
  - trials with no lab reference (none at present).
- **Primary sample:** participants with all three fresh and all three post-protocol jumps measured and upright.
  - Path A (app as shipped): 30 participants.
  - Path B (if approved, the dual-path timing tested in 4A.5): 38 participants.
  - The final count is computed by the analysis code, not typed in.
- **Unit of analysis:** the participant. Every summary gives participants and jumps, by group and by sex.

## Measurements

Validated in Phase 4A.5, advised view, app as shipped. The checks are:

- coverage of at least 90% of trials;
- within-person correlation with the lab criterion of at least 0.70, with a lower 95% bound of at least 0.50.

| Measurement | Status for 4B | Note |
|---|---|---|
| Jump height (hip rise) | Interpreted | Its within-person error follows landing drift a little (see report). |
| Countermovement depth | Interpreted | |
| Peak trunk lean | Interpreted | |
| Landing knee flexion | Interpreted, with caveat | On Path A, read 0.37 to 0.87 s after contact, after the true landing peak. |
| Reactive strength index (modified) | Interpreted | |
| Unweighting + braking duration | Interpreted as a within-person change only | Its value is about 0.13 s shorter than the centre-of-mass definition. |
| Propulsion duration | Reported, not interpreted | Within-person agreement below the threshold. |
| Flight time | Reported, not interpreted | Does not follow true flight within a person under any tested smoothing. |
| Left-right difference | Reported, not interpreted | Does not follow the 3D left-right difference even in an ideal side view. |

## Design limits (from v02, still in force)

1. **Order.** All fresh jumps came before the fatigue protocol, so fatigue cannot be separated from time, warm-up, learning or marker drift. Results describe "after the protocol", not "fatigue".
2. **Exchangeability.** Because of the fixed order, the six jumps are not exchangeable. No permutation p-value is reported as evidence of a fatigue effect. Split-rank statistics are descriptive only.
3. **Few repetitions.** Three fresh jumps is below the app's 4-rep calibration minimum. The app's per-measurement baseline rule is used as written. The in-control reference falls back to the app's defaults. This is stated with every result.
4. **No alert test.** The shipped alert cannot fire within three post-protocol jumps (EWMA at most 1.96 against 2.0).
5. **Unilateral fatigue, bilateral jumps.**
6. **Group.** Control vs ACL results are descriptive. Nothing is said about injury.

## Analyses (as v02, with the changes above)

- **A. Separation under a personal baseline (descriptive).** All 20 three-versus-three splits per participant. Report the rank of the true split and its mean score:
  - (i) with the app's full score;
  - (ii) with the score restricted to the interpreted measurements, using the app's weights renormalised.
- **B. Same under a population baseline** (leave one participant out), for both scores.
- **C. Order probe.** Change from jump 1 to jump 3 within each block, against the between-block difference.
- **D. Which measurements changed.** For each interpreted measurement, the within-person change, in units and in the person's fresh spread, with bootstrap 95% intervals over participants. Holm-corrected Wilcoxon tests are labelled exploratory. Non-interpreted measurements appear in a separate table marked "not validated".
- **E. Sanity check against the dataset's own measures.** The app's jump-height change against the change in force-plate jump height (participant_log.xlsx), and against the change in centre-of-mass rise.
- **F. Between-person variability** by group and by sex, descriptive.

## Missing data and sensitivity analyses (new)

Every analysis is repeated on each of these sensitivity samples, and the report says where conclusions differ:

1. **Primary:** complete upright 3 + 3.
2. **Per-person means:** every participant with at least one upright jump found in each condition, analysed on their means. Path A: 42; Path B: 43.
3. **At least 2 + 2:** participants with two or more upright jumps found in each condition.
4. **Side view.** On Path A, a check of robustness to the camera angle, with its lower coverage stated.
5. **Weighted:** primary sample weighted by sex. On Path A, 21 of the 30 complete participants are women, against 2 of the other 13. Weights are descriptive and not used for inference.
6. **Path B only, if approved:** the full sample of 38, against Path A, to show what the missing high jumps change.

Missingness by group, condition, sex and jump height is reported as a table before any outcome is shown.

## Outputs

`results/real_data_v03/jump_fatigue/`:

- `summary.json`, `REPORT.md`, figures, and aggregate tables only.
- No per-trial raw data.

Every file states:

- dataset;
- evaluation type ("offline biomechanics evaluation, exploratory");
- measurement path (A or B);
- participants and jumps;
- view and method;
- protocol hash and limitations.

Nothing is added to the app until Adam has reviewed the results. Nothing is combined with the synthetic HiPerGator numbers.
