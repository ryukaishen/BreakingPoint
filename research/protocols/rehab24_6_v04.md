# Protocol v04 (final): correct vs incorrect form, REHAB24-6

**Status: final, approved by Adam on 2026-10-09 together with the decisions on U1 to U10. Nothing in it has been run with the real correctness labels.**

**Frozen with:**
- `phase4b_preanalysis_checks.md`
- the inclusion lists `phase4b_inclusion_v04.json`

Their SHA-256 values are in `phase4b_protocol_freeze.json`, committed before any outcome analysis. The analysis code is frozen separately, in `phase4b_analysis_freeze.json`, before the single run with real labels. Drafts v02 and v03 are kept for the record.

## What this is, and what it is not

This is an **exploratory offline motion-capture evaluation**.

- **"Incorrect"** means a technique error performed on purpose. **It is not fatigue**, and nothing here says anything about fatigue.
- **It is not a measure of MediaPipe or webcam accuracy.**
- **It is not independent validation.** The data and the Phase 4A.5 measurement checks were inspected first.
- **The squat score is not validated as a whole.** A good correct-vs-incorrect separation would not show that every squat measurement is valid: 57% of the shipped squat score's weight sits on measurements that failed the Phase 4A.5 agreement criteria or were not checked.

Nothing here is combined with, or attributed to, the synthetic UF HiPerGator study. No number goes into the app until Adam has reviewed it.

## Measurement path, score and measurements

**Path:** the unchanged production pipeline. The experimental P1 timing is for jumps only.

**Score:** the shipped squat Form Change Score, with shipped weights, unchanged (U3). There is no squat ablation.

**How the score's weight splits (total 5.75):**

| Status | Measurements | Weight |
|---|---|---|
| Passed Phase 4A.5 (within-person r ≥ 0.70, lower bound ≥ 0.50) | peak trunk lean (1.0), depth (0.5), hip range of motion (0.5), knee range of motion on the camera side (0.5) | 2.5 (43%) |
| Failed | rep duration (0.5), left-right difference (0.75) | 1.25 (22%) |
| Not checked | far-side knee range of motion (0.5), eccentric duration (0.5), concentric duration (0.5), peak velocity (0.5) | 2.0 (35%) |

This split is stated with every score result.

**Interpreted individually:** only the four that passed. The other six are reported, labelled "failed" or "not checked".

## Samples

Samples are fixed in `phase4b_inclusion_v04.json` (checks, points 1 and 2).

- **Squats, primary.**
  - 35° oblique view, 3 m.
  - 191 scored reps: 195 annotated, minus 4 flagged by the dataset as motion-capture errors (person 8, video PM_113, reps 19 to 22).
  - 9 people, all eligible.
  - Person 2 is kept and flagged: their AUC rests on a single incorrect rep. Person 4 has 3 incorrect reps.
- **Squats, side view:** camera-angle sensitivity only.
- **Squats without person 2** (fewer than 3 incorrect reps): sensitivity (U4).
- **Split squats, side view, descriptive only:**
  - persons 2, 4, 5, 6 and 8;
  - the app finds far fewer correct split squats than incorrect ones, so these results describe a biased subset, and this is stated next to every number.

**Linking.** A found rep's measurements are attached to an annotated rep when at least half of the found rep lies inside it, one-to-one, greedy by that share. This is the lenient linking rule. It is not a segmentation result. Segmentation accuracy is reported only by the strict IoU >= 0.5 metric (F1 0.76 for squats, Phase 4A.5).

## Analyses to be executed

**How repeated reps are handled.** Every summary is over people. Each person's repeated reps are first combined into their own AUC or standardized difference. Intervals resample people with replacement: 2,000 resamples, percentile intervals, seed 20261009.

### R-1. Separation by the shipped squat score

Primary sample.

- **Personal baseline:**
  1. Hold out each of the person's correct reps in turn.
  2. Build the baseline from their other correct reps with the app's functions (at least 3 values per measurement).
  3. Score the held-out correct rep and every incorrect rep.
  4. Each incorrect rep's score is its mean over the folds.
  5. Compute the person's AUC: the probability that an incorrect rep scores higher than a held-out correct rep, with ties counted as half.
- **Population baseline:** the baseline comes from all other eligible people's correct reps (leave one person out). It scores every rep of this person, and the AUC is computed the same way.
- **Reported:**
  - per-person AUCs (personal and population), with the person's counts of correct and incorrect reps;
  - median and mean AUC, each with a person-bootstrap 95% CI;
  - the per-person difference between personal and population AUC.

### R-2. Which measurements differ

Primary sample.

- **Per person and measurement:** (mean of incorrect reps − mean of correct reps) / the app's `scale` from that person's correct reps.
- **Reported:** the median and mean across people with bootstrap CI, for the 4 interpreted measurements. The other 6 appear in a separate table with their status.

### R-3. Sensitivity

R-1 and R-2:
- without person 2;
- in the side view (camera-angle sensitivity only).

### R-4. Split squats, descriptive

R-1 and R-2 with the shipped lunge score, side view, persons 2, 4, 5, 6 and 8.

- Every number carries:
  - the recall gap: correct reps 0.72 vs incorrect 0.93;
  - the measurement caveats: only trunk lean passed for split squats.
- No intervals are interpreted.

### Shown before any outcome

- reps per person by correctness;
- the excluded reps;
- the linking counts.

All of these come from the inclusion file.

**No hypothesis tests are run in this protocol.**

## Limits

- **Mistakes differ between people** by design.
- **Correct and incorrect reps were recorded in blocks,** so order and time go together with correctness.
- **Some people have few incorrect reps.**
- **A higher score** means "more different from this person's correct reps", never "worse" in general.
- **Best-case motion-capture input.**

## Development and the single real run

The code is developed and verified on shuffled labels: each person's correct and incorrect labels are randomly permuted among their own reps, keeping the counts.

This is not a genuinely blinded study, because the data were inspected first. The real run happens once, after Adam's final approval, with the frozen code verifying both freeze files. All results defined above are reported, whatever their direction.

## Outputs

`research/results/phase4b/rehab24_6/`:
- `summary.json` and `REPORT.md`;
- aggregate tables.

The results are CC BY-NC 4.0 derived, for non-commercial research use. Every file states:
- the dataset and evaluation type;
- people and reps;
- the view;
- the freeze commit and hash;
- the 57% weight note;
- the limitations.
