# Phase 4B pre-analysis checks

Prepared on 2026-10-09. Finalized the same day after Adam approved the v04 direction and decided U1 to U10 (last section).

**No Phase 4B statistic has been computed with the real condition or correctness labels.** This document, `jump_fatigue_v04.md`, `rehab24_6_v04.md` and the inclusion file `phase4b_inclusion_v04.json` are frozen in `phase4b_protocol_freeze.json`. That file is committed before any outcome analysis.

Everything here is an **offline biomechanics evaluation**: motion capture is seen through a virtual camera and run through BreakingPoint's own code. It is kept separate from the synthetic UF HiPerGator study. None of its numbers will be combined with the HiPerGator results, attributed to them, or added to the public app until Adam has reviewed them.

## Decisions recorded (Adam, 2026-10-09)

| Item | Decision |
|---|---|
| Jump measurement paths | **Path B, the experimental timing pipeline**, is the primary analysis. **Path A, the unchanged production pipeline**, is run alongside it as the comparison. Every result carries its path label. Path B is never presented as independent validation: P1 was developed and chosen on this same motion-capture dataset. |
| P1 (6 Hz Butterworth timing, One Euro angles) | Research evaluation only. The production jump pipeline is not changed. |
| P2 (flight time) | Tested as an experimental ablation of the jump score. The shipped feature weights are unchanged. |
| P3 (left-right difference) | Tested as an experimental ablation of the jump score only. Squat and lunge weights are unchanged. |
| P4 (time-based standing reference) | Deferred. The finding and recommendation are kept in the Phase 4A.5 report, section 9. |
| P5 (camera-angle advice) | Deferred until the other measurements are settled. |
| Revised scoring | Any future production feature or scoring change is evaluated separately. The HiPerGator performance numbers are never attributed to a revised scoring pipeline. |

## 1. Inclusion and exclusion criteria, fixed before outcomes

The criteria are applied by `research/measurement/inclusion.py` and written to `phase4b_inclusion_v04.json`, with the SHA-256 of every input.

**What the script reads:**
- identifiers, condition labels, group and sex;
- the data-quality flags;
- whether each measurement path found a rep;
- the REHAB24-6 annotations.

It reads no measurement value and no score, and compares no conditions. The file's own SHA-256 goes into the freeze manifest (point 7).

### Jump-landing dataset

- **Population.** 43 participants and 256 trials with data. sub05 was excluded by the dataset's authors. sub44 has 2 + 2 trials, because its third trial in each condition is empty.
- **Data-quality exclusions** (path-independent, fixed):
  - No usable lab reference: none. One trial, sub39_CMJ_t3, uses the kinematic contact index because the force-plate index is wrong.
  - Starts crouched: 9 trials whose starting hip height is below 0.95 of the same person's highest start. They are sub15_f_t3; sub32_t1, f_t2 and f_t3; sub34_t1, f_t1 and f_t2; sub40_f_t2 and f_t3. The app takes its standing reference from these frames.
- **Measurement-path exclusions.** A trial is used by a path only if that path finds exactly one jump in it:
  - advised view: Path A loses 20 more trials, Path B none;
  - side view: Path A loses 30, Path B 2.
- **No other exclusions.** No trial or participant is removed because of any measurement value or score. There is no outlier deletion; robust summaries and bootstrap intervals are used instead.

**Samples** (advised view unless stated):

| Sample | Path A (production) | Path B (experimental timing) |
|---|---|---|
| Primary: 3 usable fresh + 3 usable post-protocol | 30 (16 control, 14 ACL; 21 women, 9 men) | 38 (20 control, 18 ACL; 22 women, 16 men) |
| Like-for-like: Path B on Path A's 30 | n/a | 30 (all 30 Path A participants are in Path B's 38) |
| At least 2 + 2 | 36 | 40 |
| At least 1 + 1, per-person means | 42 | 43 |
| Side view, 3 + 3 | 24 (13 control, 11 ACL; 21 women, 3 men) | 37 |
| Side view, at least 2 + 2 | 35 | 39 |

Missing trials by group and condition (advised view, after the data-quality exclusions; missing of trials):

| | ACL, fresh | ACL, post | Control, fresh | Control, post |
|---|---|---|---|---|
| Path A | 8 of 61 | 5 of 58 | 3 of 65 | 4 of 63 |
| Path B | 0 of 61 | 0 of 58 | 0 of 65 | 0 of 63 |

### REHAB24-6

- **Squats (exercise 6), primary.**
  - 195 annotated reps; the 4 flagged as motion-capture errors are excluded (point 2), leaving 191 scored.
  - A found rep is linked to an annotated rep when at least half of it lies inside it. All 191 are linked.
  - 9 people are eligible for the personal-baseline analysis. Eligibility needs at least 4 linked correct reps, so that 3 remain after one is held out, and at least 1 linked incorrect rep.
  - Person 2 has only 1 incorrect rep and person 4 only 3, so their per-person results are unstable. Both are kept and flagged, and a sensitivity analysis excludes people with fewer than 3 incorrect reps (person 2).
- **Split squats (exercise 5), descriptive only.**
  - 174 annotated reps; 145 have a linked found rep and 29 do not.
  - Eligible for a personal baseline: persons 2, 4, 5, 6 and 8.
  - Not eligible: person 3 (no correct reps in the data), person 7 (1 of 10 correct reps linked) and person 9 (2 of 12).
  - The app misses split-squat reps that do not return near standing, and those are mostly correct reps. The lunge results therefore describe a biased subset.

## 2. Why REHAB24-6 has 195 squat reps in Phase 4A and 191 in Phase 4A.5

The dataset annotates 195 squat repetitions. Four of them are flagged by the dataset itself as motion-capture errors: reps 19, 20, 21 and 22 of person 8 in video PM_113, all marked correct, covering 109.6 to 125.7 s.

- **Phase 4A** is a processing report, so it counted all 195 annotations and listed the 4 flags in its own table row. It also counted the 195 reps the app's segmenter found, which include those 4 sections.
- **Phase 4A.5** followed the v02 protocol ("Excluded: reps flagged with motion-capture errors (4 squats), reported in counts"). It scored 191, and did not count found reps on the flagged sections against the app.

Both numbers are correct for their purpose. After the exclusion, person 8 keeps 13 correct and 5 incorrect reps.

## 3. Strict segmentation metric vs lenient linking diagnostic

- **Strict metric, the segmentation accuracy result.** A found rep matches an annotated rep when their intervals overlap with intersection over union of at least 0.5, matched one-to-one (pre-specified in v02).
  - Squats, advised view, production: precision, recall and F1 **0.76**.
  - Split squats, side view: precision 0.64, recall 0.53, F1 0.58.
- **Lenient linking diagnostic, not an accuracy result.** A found rep is linked to an annotated rep when at least half of it lies inside it.
  - Squats: all 191 linked, none left over, counts right in every video.
  - Split squats: 145 linked, 29 not.
  - What it shows: whether each annotated rep was detected and counted, and which found rep to read measurements from. It does not show boundary accuracy.
  - The app's squat rep boundaries differ from the annotators' by a median +0.77 s at the start and -0.64 s at the end. The annotations include the standing pause around each rep; the app's rep begins once the hips have dropped 6% of leg length.
- **Use in Phase 4B.** The lenient rule is used only to attach the app's measurements to the annotated reps and their correct or incorrect labels.
- **Wording rule.** Segmentation accuracy is reported only with the strict metric. The lenient diagnostic is never called segmentation accuracy, "perfect", or "100%". The Phase 4A.5 report was reworded to follow this.

## 4. The order confound in the jump dataset

- **Fixed order.** All three fresh jumps were recorded before the fatigue protocol, and all three post-protocol jumps after it. Every participant did the protocol; no one repeated the jumps without it.
- **What is mixed with the protocol.** Any difference between the blocks is mixed with:
  - time and warm-up;
  - learning the task;
  - boredom or motivation;
  - marker or skin movement over the session;
  - the protocol's specific demands. It worked one leg (single-leg squats and step-ups), while the jumps use both legs.
- **Consequences:**
  - Every result describes changes **after the protocol**. None is a measured effect of **fatigue**.
  - The six jumps are not exchangeable under a "no fatigue effect" hypothesis, so no permutation p-value is reported as evidence of a fatigue effect. Split-rank statistics are descriptive.
  - Analysis C shows how much jumps change from first to third within each block, as a rough measure of what order alone can do.
  - Each person has only three jumps per block, below the app's 4-rep calibration minimum, and the shipped alert cannot fire within three post-protocol jumps.
  - The results stay **exploratory**. They describe fatigue-associated jump changes measured by the app's code; they do not validate the production sequential alert.

REHAB24-6 has the same structure: correct and incorrect reps were recorded in blocks, so order and time go together with correctness.

## 5. Virtual-camera motion capture is not a test of MediaPipe on webcam video

**What the data are.** Both datasets are marker or skeleton motion capture. The positions are projected through a virtual pinhole camera (hip height, 3 to 3.5 m, the advised angles, 30 fps) and given synthetic visibility. They are then run through the app's smoothing, frame metrics, segmentation and measurement code.

**What this tests.** BreakingPoint's own measurement and scoring code on real human movement, under best-case input.

**What it does not test:**
- MediaPipe's detection, its landmark placement compared with markers, its jitter, and occlusion of the far limb;
- depth ambiguity, lost frames and low-confidence frames;
- lighting, clothing and backgrounds;
- real phone and laptop frame timing.

The jitter added in Phase 4A.5 is assumed white noise, not measured MediaPipe noise. Whether MediaPipe's VIDEO mode already smooths landmarks is unknown.

**The rule for reporting.** No Phase 4B number is reported as webcam, MediaPipe or real-world accuracy. That needs recorded camera footage run through MediaPipe, which is a separate, later evaluation.

## 6. Measurements that passed the predefined agreement criteria

**The criteria**, fixed in code before any variant result:
- coverage of at least 90% of trials;
- within-person (repeated-measures) correlation with the lab criterion of at least 0.70;
- a lower 95% bound of at least 0.50;
- "robust": the same in the side view and with 0.002 jitter.

**Jump**, advised view:

| Measurement | Path A (production) | Path B (experimental timing) | Supports Phase 4B comparisons? |
|---|---|---|---|
| Jump height (hip rise) | passes advised view; side-view coverage 88% fails robustness | passes, robust | Yes, interpreted. Its error also follows landing drift a little. |
| Countermovement depth | as above | passes, robust | Yes |
| Peak trunk lean | as above | passes, robust | Yes |
| Landing knee flexion | as above; read 0.37 to 0.87 s after contact | passes, robust | Yes. Path A's value is read after the landing peak. |
| Reactive strength index (mod.) | as above | passes, robust | Yes |
| Unweighting + braking duration | as above; reads 0.13 s short | passes, robust; reads 0.13 s short | Yes, as within-person change only |
| Propulsion duration | fails (r 0.73, lower bound 0.498) | fails (r 0.70) | **No.** Reported, not interpreted. |
| Flight time | fails (r 0.09) | fails (r 0.13) | **No.** Reported, not interpreted. Ablation P2. |
| Left-right difference | fails (r -0.10) | fails (r -0.10) | **No.** Reported, not interpreted. Ablation P3. |

Path B's "passes" were measured on the same data on which P1 was chosen, so they are optimistic.

**The shipped jump score.** Its nine measurements carry total weight 6.25. The three that fail (flight time, propulsion duration, left-right difference) carry 1.5 of it, 24%. The shipped score is reported as it is, with the ablations beside it.

**Squats** (REHAB24-6), advised view, production:

| Measurement | Within-person r [95% CI] | Status |
|---|---|---|
| Peak trunk lean | 0.987 [0.977, 0.994] | Passes |
| Depth | 0.992 [0.981, 0.996] | Passes |
| Hip range of motion | 0.84 [0.67, 0.93] | Passes |
| Knee range of motion, camera side | 0.83 [0.74, 0.92] | Passes |
| Rep duration | 0.42 [0.08, 0.94] | **Fails**. The criterion itself is uncertain. |
| Left-right difference | 0.03 [-0.19, 0.26] | **Fails** |
| Knee range of motion, far side; eccentric and concentric duration; peak velocity | not checked | Not interpreted |

The four that pass carry 2.5 of the squat score's total weight of 5.75 (43%). The squat score is used with its shipped weights, unchanged, per the decision above, so 57% of its weight sits on measurements that failed or were not checked. This is stated with every squat score result.

**Split squats.** Only trunk lean passes (0.97). Knee range of motion (0.67), depth (0.67), hip range of motion (0.68) and the timing measures do not. Split-squat analyses are descriptive only.

## 7. How the evaluation avoids changing hypotheses or thresholds after seeing outcomes

1. **Everything that shapes the analysis is fixed before any outcome is computed:**
   - the questions, samples, measurement paths, measurement sets, ablations, analyses and reporting order (protocols v04);
   - the inclusion lists (`phase4b_inclusion_v04.json`);
   - this document.

   There are two freeze files:
   - `phase4b_protocol_freeze.json` holds the SHA-256 of the protocols, this document, the inclusion file and the measurement code. It is committed and pushed before any outcome analysis; that commit identifies the protocol freeze.
   - `phase4b_analysis_freeze.json` holds the protocol-freeze commit, the SHA-256 of the analysis code (frozen after shuffled-label development), the input data files, the seeds and the shuffled-label verification.

   The real-label run checks every hash in both files and refuses to run if any differs.
2. **Nothing that defines the analysis was based on a fatigue or correctness comparison.** Phase 4A.5 computed agreement with lab criteria by pooling all trials, and used condition and correctness only to count missing data. That can be checked in `research/measurement/analyze.py`. The measurement sets, Path B and the ablations come from Phase 4A.5 and are frozen now.

   One disclosure: the Phase 4A.5 missingness table lists participant_log.xlsx's force-plate jump heights before and after the protocol, as participant descriptors. They show the dataset's own pre-to-post drop (medians 11.2 to 7.8 cm in complete participants). That drop is the dataset's fatigue criterion working as designed (the protocol continued until jump height fell), not an app measurement. No app measurement or score was compared between conditions.
3. **Path B is fixed as implemented.** It is `dual_butter6` in `research/measurement/variants.ts`, recorded in `phase4b_protocol_freeze.json`, with no further tuning. That file records only quality values beside the measurements; the measurement values are byte-identical to Phase 4A.5's. The ablations are fixed as S-P2, S-P3, S-P2P3 and S-valid (U1, U2).
4. **The code is developed on shuffled labels.** This is not genuine blinding: the data and some reference outcomes were inspected beforehand (U8). It only keeps the code from being tuned on the real comparison. The Phase 4B analysis code is written and tested on a copy of the data in which:
   - each participant's fresh and post-protocol labels are randomly swapped among their own trials;
   - each person's correct and incorrect labels are permuted.

   The real labels are used once, in a single final run of the frozen code.
5. **Results are reported whatever their direction.** Every pre-specified analysis is reported, for both paths, for the shipped score and every ablation, and for every sensitivity sample. Results are never selected by their direction or size.
6. **No new thresholds are introduced.** The analyses are descriptive, with medians and bootstrap intervals. The only tests, the Wilcoxon tests in jump analysis D, are labelled exploratory and Holm-corrected within a family fixed in the protocol.
7. **Any change after the freeze is a logged deviation**, with its reason and date. Any analysis not in the protocol is labelled post hoc and reported separately.

## Decisions on U1 to U10 (Adam, 2026-10-09)

| # | Decision |
|---|---|
| U1 | All three jump ablations run: without flight time (S-P2), without the left-right difference (S-P3), and without both (S-P2P3). |
| U2 | Add S-valid, the six measurements that passed Phase 4A.5 only. It is labelled exploratory, because its selection used Phase 4A.5 results on this same dataset. |
| U3 | The primary REHAB analysis uses the unchanged shipped squat score. Production squat weights are not changed, and there is no squat ablation. |
| U4 | REHAB person 2 is kept, and their single incorrect rep is flagged. A sensitivity analysis excludes people with fewer than 3 incorrect reps. |
| U5 | The side-view samples are used only for camera-angle sensitivity. Their make-up and selection limits are reported; no subgroup performance comparisons are made from them. |
| U6 | Phase 4B results go under `research/results/phase4b/`, separate from the HiPerGator results in `results/`. |
| U7 | The force-plate jump heights in participant_log.xlsx are a descriptive direction check only, and their unverified provenance is disclosed. |
| U8 | The code is developed on shuffled labels before the real comparison. The reports say plainly that this is not a fully independent or genuinely blinded study: the datasets and some reference outcomes were inspected beforehand. |
| U9 | A separate research-only commit and push covers the Phase 4A.5 findings, the final v04 protocols, the frozen inclusion lists, the protocol freeze and the supporting tests. It includes no Stage 2 work, no raw or processed data, and no application changes. |
| U10 | Holm correction applies to the six pre-specified primary Path B measurement comparisons (jump analysis J-D). Path A, the ablations, the camera-angle comparison and every other sensitivity analysis are supporting exploratory evidence, reported with effect sizes, intervals and sample sizes and without hypothesis tests. Every pre-specified result is reported. |

Also required by Adam:
- Path A and Path B are compared on the same participants (Path A's 30) as well as on their full samples.
- Results are reported per participant, and repeated jumps and reps are combined within each person before any summary.
- Every squat score result states that 57% of the shipped squat score's weight sits on measurements that failed or were not covered by the Phase 4A.5 checks. A good classification result is never presented as validating every feature.
- Every original HiPerGator artifact and the production detector stay unchanged.
- No public-facing real-world claim changes until Adam has reviewed the Phase 4B results.
