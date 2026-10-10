# Protocol (draft): exploratory comparison of fresh and post-fatigue jumps

**Status: DRAFT, awaiting approval. Nothing in this protocol has been run.** Once approved, its SHA-256 is recorded in every result file, and changes after that point are listed as deviations.

## Question

Measured with BreakingPoint's own rep measurements and Form Change Score, and compared with each person's own fresh jumps, how do a person's jumps after the fatigue protocol differ from their jumps before it?

This is an **exploratory offline biomechanics evaluation**. It is not a test of the app's alert, not evidence that the app detects fatigue, and not a measure of webcam or MediaPipe accuracy.

## Data (from Phase 4A)

- Countermovement jumps from the jump-landing dataset, measured through the app's code from motion capture seen by a virtual camera.
- **Primary view:** 35 degrees oblique (the app's setup advice). The side view is a sensitivity analysis.
- **Primary sample:** participants with all three fresh and all three post-protocol jumps measured in the primary view: **32** (18 control, 14 ACL). Participants with three fresh jumps and at least one post-protocol jump (34) are a sensitivity analysis.
- Unit of analysis: the participant. Every summary gives the number of participants and jumps.

## Design limits, stated up front

1. **Order.** All fresh jumps came before the fatigue protocol, and all post-protocol jumps after it. Fatigue cannot be separated from time, warm-up, learning or marker drift. Every result is about "after the protocol", not "fatigue".
2. **Exchangeability.** Because of that fixed order, the six jumps are not exchangeable under a "no fatigue effect" hypothesis. **No permutation p-value is reported as evidence of a fatigue effect.** Split-rank statistics (analysis A) are descriptive only.
3. **Few repetitions.** Three fresh jumps is below the app's 4-rep calibration minimum. The app's per-measurement baseline rule (median and robust spread, with its noise floors, from at least 3 values) is used as written. The in-control reference (μ0, σ0) falls back to the app's defaults, as the app does with too few reps. This deviation is stated with every result.
4. **No alert test.** The shipped alert cannot fire within three post-protocol jumps (the EWMA reaches at most 2.5 × (1 − 0.6³) = 1.96 against a 2.0 line), and the jumps were not one continuous set. The alert is not evaluated.
5. **Unilateral fatigue, bilateral jumps.** The fatigue protocol worked one leg; the jumps used both.
6. **App measures with known biases (Phase 4A).** The app's "flight time" and "landing knee flexion" are shifted by its smoothing. They are reported as the app's measures, under the app's names, with that caveat.
7. **Group.** Results by group (control vs ACL) are descriptive. Nothing is said about injury.

## Analyses

- **A. Separation under a personal baseline (descriptive).** For each participant, consider all 20 ways to split their six jumps into a three-jump reference and a three-jump comparison set. Score each split with the app's baseline and Form Change Score. Report where the true split (fresh as reference, post-protocol as comparison) ranks among the 20, and its mean score, as distributions across participants. Ranks are descriptive, for the reason in limit 2.
- **B. Separation under a population baseline.** Same as A, but the per-measurement baseline comes from all *other* participants' fresh jumps (leave one participant out). Comparing A with B shows, descriptively, whether a personal baseline separates the blocks more clearly than a population one in these data. There is no false-alarm rate, because fresh jumps can't be held out within a person.
- **C. Order probe.** Within the fresh block and within the post-protocol block, how much do scores and measurements change from jump 1 to jump 3? Compare that with the between-block difference, to show how much time and order alone could plausibly explain.
- **D. Which measurements changed.** For each app measurement, the within-person difference (post-protocol minus fresh mean) in measurement units and in units of the person's fresh spread, with bootstrap 95% intervals over participants. Holm-corrected Wilcoxon signed-rank tests are reported as exploratory only.
- **E. Sanity check against the dataset's own measures.** The direction and size of the change in the app's jump-height proxy against the change in force-plate jump height recorded in `participant_log.xlsx` (pre and post fatigue). This also checks whether the "fatigued" label went with a performance drop in these jumps.
- **F. Between-person variability.** The distribution of per-participant effects, overall and by group, descriptive only.

No onset timing is evaluated anywhere: the data contain none.

## Outputs

`results/real_data_v02/jump_fatigue/`: `summary.json`, `REPORT.md`, figures, and aggregate tables only (no per-trial raw data). Every file states: dataset, evaluation type ("offline biomechanics evaluation, exploratory"), participants, jumps, view, method, protocol hash and limitations. Nothing is added to the app until you have reviewed the results. Nothing is combined with the synthetic HiPerGator numbers.
