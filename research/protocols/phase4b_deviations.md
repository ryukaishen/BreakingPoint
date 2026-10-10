# Phase 4B: deviations from the frozen protocols

This file logs every change to the Phase 4B analysis after the protocol freeze, which is commit `0fa32fe655381d97057042678792f8fe48c9ec89` (`phase4b_protocol_freeze.json`). It is not frozen itself: entries are added in date order.

The frozen protocol files are not edited.

**No deviation below was made with any knowledge of real-label results.** No analysis has used the real condition or correctness labels.

## Entry 1 (2026-10-09): interval calibration investigation, before any real-label run

### Trigger

The shuffled-label verification of analysis freeze v1 (`phase4b_analysis_freeze.json`, SHA-256 `396c3f35…`) showed that some percentile-bootstrap intervals for means covered their target in fewer than 95% of 60 shuffles:
- mean change: 87%;
- mean AUC: as low as 77%.

It also showed a slight downward bias in the personal-baseline squat AUC: null mean 0.476.

Adam asked for the cause to be found and corrected before any real-label evaluation.

### Rule fixed before the calibration replicates were run

**When an interval may be called "95%".** An interval is reported as a 95% confidence interval only if two conditions hold, both checked against the shuffled-label calibration (at least 2,000 replicates; Monte Carlo SE about 0.5 percentage points at 95%):
1. **Null coverage:** it covers the statistic's exact null expectation in at least 93.5% of replicates (95% minus about 3 Monte Carlo SE).
2. **Positive-control coverage:** it covers the injected true value in the positive controls at the same rate.

**Other outcomes:**
- An interval that only reaches a lower rate is reported with its calibrated coverage stated, for example "approximate interval, 91% coverage in calibration", and never as a 95% interval.
- An interval below 85% is not reported.

**Conservative intervals.** An exact or conservative interval, such as an order-statistic interval for a median, is reported with its exact coverage level.

**Null targets.** Each statistic's null target is computed exactly where possible:
- jump measurements: by enumerating all label-free splits of each participant's jumps;
- otherwise: the mean over replicates.

The target is never assumed to be 0 or 0.5 for a statistic whose construction could bias it.

### What the calibration did

Code: `research/phase4b/calibration.ts` and `calibration.py`. Outputs:
- per-statistic coverage tables: `research/reports/phase4b_interval_calibration_tables.md`;
- verdicts: `research/protocols/phase4b_interval_calibration.json`.

Every participant's trials (each person's reps) were pooled and ordered by a hash of their identifiers, so the real labelling was never carried into the calibration.

- **Jump statistics** (J-D changes, J-A personal ranks and scores): every label-free split of each participant's jumps was enumerated. Under random labelling each split is equally likely, so the null distribution and the null target of every mean are exact. 4,000 replicates drew one split per participant.
- **Population-baseline statistics** (J-B) and **REHAB24-6**: 2,000 replicates of random relabelling within each person, recomputed in full.
- **Positive controls:** the same, with known shifts injected:
  - jump height −0.03 and trunk lean +5° in the "post" jumps;
  - trunk lean +5° and depth +0.05 in the "incorrect" reps.
- **Bootstrap resamples:** 2,000.
- **Reproducibility:** re-running the harness with the final code gave byte-identical outputs (374 files).

### Findings

1. **The v1 coverage check was itself partly inappropriate.**
   - It used 60 shuffles, so its Monte Carlo SE was about 2.8 percentage points: "87%" could not be told apart from 92%.
   - It compared intervals with 0 or 0.5 for three statistics whose own null expectation is not 0 or 0.5 (findings 5 to 7). That mixed up bias with interval width.
   - The new check uses exact null targets and 2,000 to 4,000 replicates (Monte Carlo SE about 0.3 to 0.5 points).
2. **Bootstrap method (main cause of the undercoverage).** The v1 percentile-bootstrap intervals for means were too narrow:
   - jump means (30–43 participants): null coverage as low as 91.6%, median 93.2%;
   - REHAB24-6 means (5–9 people): about 83–91%.

   BCa was no better: jump means as low as 85.3%, median 92.5%. Percentile intervals use the plug-in spread and normal-type quantiles; they ignore the extra uncertainty of estimating the spread from few people (the small-sample effect that Student's t accounts for). Student t intervals over people gave:
   - jump means: at least 93.7% (medians 94.7–96.6% by kind of statistic);
   - REHAB mean AUCs: 94.2–96.4%;
   - REHAB mean standardized differences: at least 93.5% (medians 94.7–95.5%).
3. **Small participant counts.** The shortfall was largest for REHAB24-6 (9, 8 and 5 people). With t intervals it disappears for 8 and 9 people. Split squats (5 people) remain at the edge: four of their median intervals reach only 93%.
4. **Unequal repetitions and correlated observations, both tested.** Neither breaks the t intervals over people:
   - unequal repetitions: per-person AUCs rest on 1 to 21 incorrect reps;
   - shared population baselines: the J-B and REHAB population analyses reuse other people's data.

   t coverage stayed at 94.0–96.4% (J-B and REHAB AUC means).
5. **Personal-baseline construction: v1 AUC bias.** The v1 personal AUC averaged each incorrect rep's score over folds before comparing it with the held-out correct reps. With no effect it averaged 0.483–0.486 for squats instead of 0.5.
6. **v1 Δz bias.** The v1 standardized change (Δz, divided by the fresh jumps' spread) is not centred on 0 with no effect: its exact null means reach +0.125 (unweighting + braking duration) and +0.067 (trunk lean). Its denominator depends on which jumps carry the label "fresh".
7. **v1 REHAB standardized-difference bias.** The v1 REHAB24-6 standardized differences (divided by the correct reps' spread) had null means up to +0.196.
8. **Unit of analysis.** Every summary takes exactly one value per participant (person). This is checked in code (`stats.one_per_person`) and in tests. The 20 splits, the leave-one-out folds and the repeated reps or jumps are combined within the person and never counted as people. Every interval is over people.
9. **Hypothesis tests, no change needed.**
   - Null: the Holm-corrected Wilcoxon family (six primary Path B comparisons) had a family-wise error rate of 4.45% over 4,000 replicates, and 0.5–1% per test.
   - Positive control: 100% power for the two injected measurements, and 1–1.7% false rejections of the other four.

### Changes (analysis v2)

| # | Change |
|---|---|
| D1 | **Reported intervals:** Student t for means, exact order-statistic (binomial) intervals for medians with their exact level stated, Wilson for proportions, always over people. The bootstrap is no longer used for any reported interval. |
| D2 | **Interval labels come from the calibration.** "95% CI" requires at least 93.5% coverage under no effect and in the positive control. Otherwise the calibrated coverage is stated, and below 85% no interval is shown (`phase4b_interval_calibration.json`). |
| D3 | **Jump Δz:** the change divided by the mean of the app's spread in the fresh and post jumps. Swapping the labels flips its sign exactly, so it is centred on 0 with no effect. (Protocol J-D said "units of the person's own spread"; this keeps that meaning, symmetrically.) |
| D4 | **REHAB24-6 personal AUC:** fold-paired. Within each leave-one-out fold, the held-out correct rep is compared only with the incorrect reps scored against the same baseline, and comparisons are pooled over folds. Given the baseline, the held-out rep and each incorrect rep are exchangeable under random labels, so the null expectation is exactly 0.5. A test checks this over every labelling, and the calibration gives 0.499–0.501. |
| D5 | **REHAB24-6 standardized differences:** divided by the person's pooled spread (label-free), so they are centred on 0 with no effect. |
| D6 | **J-A and J-B interval coverage.** The J-A mean true-split score now has a calibrated interval. The per-participant difference between personal and population ranks is descriptive only, with no interval. |

Nothing else changed: questions, samples, inclusion lists, measurement paths, measurements, scores and ablations, the analysis list and the hypothesis tests are as frozen in `0fa32fe`.

### Results (analysis v2)

- **Calibration verdicts** (`phase4b_interval_calibration.json`), 643 statistics:

  | Label | Count |
  |---|---|
  | 95% CI | 467 |
  | Exact order-statistic interval with its stated level | 165 |
  | Approximate (93% or 90%) | 11 |
  | Not reported | 0 |

  The approximate ones:
  - four Wilson intervals for the share of participants at rank 1 in the same-participants samples (93%);
  - four split-squat median standardized-difference intervals (93%);
  - three split-squat entries for the superseded v1 differences (90–93%), which are not reported.
- **Full pipeline, 200 shuffled-label runs:**

  | Check | Result |
  |---|---|
  | Holm, any false rejection | 4.0% of runs |
  | Mean-change t intervals covering 0 | 94.5–98.0% |
  | REHAB mean-AUC t intervals covering 0.5 | 92.5–97.5% (Monte Carlo SE about 1.6) |
  | Mean personal true-split rank | 10.47 (expected 10.5) |
  | Personal squat AUC | 0.494–0.506 |
- **Full pipeline, 40 positive-control runs:**

  | Check | Result |
  |---|---|
  | Holm rejections | exactly the two injected measurements, every run |
  | Mean change recovered | −0.0301 for −0.03 jump height; +5.12° for +5° trunk lean |
  | Intervals covering the injected truth | 92.5–97.5% (Monte Carlo SE about 3.4) |
  | Mean personal rank | 7.36 |
  | Personal squat AUC | 0.56 |

### Limits of the calibration

- **People are held fixed and only the labels vary.** This tests the intervals against labelling noise when every person's true value is the same. It cannot test coverage when true effects differ between people, or the sampling of people from a wider population.
- **Split squats** (5 people) remain at the edge of the rule.
- **With 8 or 9 people,** intervals are calibrated but wide.

### Provenance

- **Analysis v1** (the code and `phase4b_analysis_freeze.json`, SHA-256 `396c3f35…`) is committed unchanged in `479939e2c606502e9391de2cba70794d0e38d100`. It was never run with real labels.
- **Analysis v2** is frozen in `phase4b_analysis_freeze_v2.json`. That file records this log's hash and the calibration file's hash.
