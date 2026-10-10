# Phase 4B: correct vs incorrect form, REHAB24-6 (exploratory)

Exploratory offline motion-capture evaluation: motion capture seen through a virtual camera and measured by BreakingPoint's own code. Not independent validation (the data and the Phase 4A.5 checks were inspected first), not a test of the production alert, and not a measure of MediaPipe or webcam accuracy. Kept separate from the synthetic UF HiPerGator study; nothing here is attributed to it.

Intervals: Student t for means, exact order-statistic intervals for medians, Wilson for proportions, each over people. Each carries the label its shuffled-label calibration earned (phase4b_interval_calibration.json): '95% CI' only where coverage was at least 93.5% under no effect and in the positive control; otherwise the calibrated coverage is stated, and below 85% no interval is shown. Calibration holds the people fixed and varies only the labels, so it cannot test coverage under between-person differences in true effects.

Protocol-freeze commit `0fa32fe655381d97057042678792f8fe48c9ec89`; analysis freeze (v2) SHA-256 `d7442a63212a0be865d689193abf111b76443feb3f46b68eceeb609603d3a4f5`. Deviations: research/protocols/phase4b_deviations.md.

'Incorrect' means a technique error performed on purpose; **it is not fatigue**. Unchanged production pipeline; shipped scores with shipped weights.

## Samples (shown before any outcome)

- ex6_squat/oblique35 (primary): annotated 195, excluded 4 (motion-capture errors), without a linked found rep 0; eligible persons 1, 2, 3, 4, 5, 6, 7, 8, 9.
- ex6_squat/side (sensitivity view): annotated 195, excluded 4 (motion-capture errors), without a linked found rep 0; eligible persons 1, 2, 3, 4, 5, 6, 7, 8, 9.
- ex5_lunge/side (secondary, descriptive only): annotated 174, excluded 0 (motion-capture errors), without a linked found rep 29; eligible persons 2, 4, 5, 6, 8.

Reps are linked to annotations by the lenient rule (at least half of the found rep inside the annotation). That is not a segmentation result; segmentation accuracy is the strict IoU >= 0.5 metric (squat F1 0.76, Phase 4A.5).

Personal-baseline AUC (analysis v2): each held-out correct rep is compared with the incorrect reps scored against the same baseline (fold-paired); with no effect it is centred on 0.5. Standardized differences divide by the person's pooled spread.

## squat_primary (ex6_squat/oblique35): 9 persons, 130 correct and 61 incorrect reps

> 57% of the shipped squat score's weight (3.25 of 5.75) sits on measurements that failed the Phase 4A.5 agreement criteria (rep duration, left-right difference) or were not checked (far-side knee range of motion, eccentric and concentric duration, peak velocity). A separation result is not validation of every measurement.

| Baseline | Mean AUC, interval | Median AUC, interval | n persons |
|---|---|---|---|
| Personal (leave one correct rep out, fold-paired) | 0.920 [0.833, 1.007] (95% CI) | 0.952 [0.815, 1.000] (96.1% exact interval) | 9 |
| Population (leave one person out) | 0.626 [0.309, 0.943] (95% CI) | 0.863 [0.092, 1.000] (96.1% exact interval) | 9 |
| Personal minus population, per person | mean 0.295 | median 0.000 | 9 |

Per person: 1: correct 21, incorrect 6, AUC personal 0.952 / population 0.476; 2: correct 21, incorrect 1 (flag: single incorrect rep), AUC personal 0.905 / population 0.952; 3: correct 10, incorrect 10, AUC personal 1.000 / population 0.080; 4: correct 17, incorrect 3, AUC personal 0.667 / population 0.863; 5: correct 10, incorrect 10, AUC personal 1.000 / population 1.000; 6: correct 10, incorrect 11, AUC personal 1.000 / population 1.000; 7: correct 10, incorrect 10, AUC personal 1.000 / population 0.190; 8: correct 13, incorrect 5, AUC personal 0.815 / population 0.092; 9: correct 18, incorrect 5, AUC personal 0.944 / population 0.978.

| Measurement | Status (Phase 4A.5) | Interpreted | Median standardized difference (incorrect - correct), interval | n |
|---|---|---|---|---|
| kneeRomL | passed | yes | 1.230 [0.889, 1.608] (96.1% exact interval) | 9 |
| kneeRomR | not checked | no | 0.944 [0.649, 1.646] (96.1% exact interval) | 9 |
| hipRom | passed | yes | 1.228 [0.937, 1.391] (96.1% exact interval) | 9 |
| depth | passed | yes | 1.127 [0.552, 1.692] (96.1% exact interval) | 9 |
| trunkLean | passed | yes | 1.200 [0.252, 1.595] (96.1% exact interval) | 9 |
| repDuration | failed | no | -0.962 [-1.457, 0.406] (96.1% exact interval) | 9 |
| eccentricDuration | not checked | no | -0.917 [-1.290, 0.388] (96.1% exact interval) | 9 |
| concentricDuration | not checked | no | -0.235 [-1.495, 0.127] (96.1% exact interval) | 9 |
| peakVelocity | not checked | no | 1.426 [1.143, 1.554] (96.1% exact interval) | 9 |
| asymmetry | failed | no | -0.355 [-1.387, 0.936] (96.1% exact interval) | 9 |

## squat_without_person_2 (ex6_squat/oblique35): 8 persons, 109 correct and 60 incorrect reps

> 57% of the shipped squat score's weight (3.25 of 5.75) sits on measurements that failed the Phase 4A.5 agreement criteria (rep duration, left-right difference) or were not checked (far-side knee range of motion, eccentric and concentric duration, peak velocity). A separation result is not validation of every measurement.

| Baseline | Mean AUC, interval | Median AUC, interval | n persons |
|---|---|---|---|
| Personal (leave one correct rep out, fold-paired) | 0.922 [0.821, 1.023] (95% CI) | 0.976 [0.667, 1.000] (99.2% exact interval) | 8 |
| Population (leave one person out) | 0.623 [0.301, 0.945] (95% CI) | 0.709 [0.160, 1.000] (99.2% exact interval) | 8 |
| Personal minus population, per person | mean 0.299 | median 0.198 | 8 |

Per person: 1: correct 21, incorrect 6, AUC personal 0.952 / population 0.556; 3: correct 10, incorrect 10, AUC personal 1.000 / population 0.160; 4: correct 17, incorrect 3, AUC personal 0.667 / population 0.863; 5: correct 10, incorrect 10, AUC personal 1.000 / population 1.000; 6: correct 10, incorrect 11, AUC personal 1.000 / population 1.000; 7: correct 10, incorrect 10, AUC personal 1.000 / population 0.250; 8: correct 13, incorrect 5, AUC personal 0.815 / population 0.169; 9: correct 18, incorrect 5, AUC personal 0.944 / population 0.989.

| Measurement | Status (Phase 4A.5) | Interpreted | Median standardized difference (incorrect - correct), interval | n |
|---|---|---|---|---|
| kneeRomL | passed | yes | 1.098 [0.445, 1.690] (99.2% exact interval) | 8 |
| kneeRomR | not checked | no | 0.834 [0.585, 1.646] (99.2% exact interval) | 8 |
| hipRom | passed | yes | 1.130 [0.804, 1.656] (99.2% exact interval) | 8 |
| depth | passed | yes | 1.097 [-0.099, 1.692] (99.2% exact interval) | 8 |
| trunkLean | passed | yes | 1.342 [-1.028, 1.674] (99.2% exact interval) | 8 |
| repDuration | failed | no | -0.829 [-1.519, 0.887] (99.2% exact interval) | 8 |
| eccentricDuration | not checked | no | -0.806 [-1.459, 0.699] (99.2% exact interval) | 8 |
| concentricDuration | not checked | no | -0.334 [-1.496, 0.820] (99.2% exact interval) | 8 |
| peakVelocity | not checked | no | 1.430 [0.850, 1.557] (99.2% exact interval) | 8 |
| asymmetry | failed | no | -0.037 [-1.446, 0.965] (99.2% exact interval) | 8 |

## squat_side (ex6_squat/side): 9 persons, 130 correct and 61 incorrect reps

> 57% of the shipped squat score's weight (3.25 of 5.75) sits on measurements that failed the Phase 4A.5 agreement criteria (rep duration, left-right difference) or were not checked (far-side knee range of motion, eccentric and concentric duration, peak velocity). A separation result is not validation of every measurement.

| Baseline | Mean AUC, interval | Median AUC, interval | n persons |
|---|---|---|---|
| Personal (leave one correct rep out, fold-paired) | 0.903 [0.794, 1.013] (95% CI) | 0.952 [0.692, 1.000] (96.1% exact interval) | 9 |
| Population (leave one person out) | 0.646 [0.345, 0.946] (95% CI) | 0.784 [0.090, 0.980] (96.1% exact interval) | 9 |
| Personal minus population, per person | mean 0.258 | median 0.020 | 9 |

Per person: 1: correct 21, incorrect 6, AUC personal 0.937 / population 0.413; 2: correct 21, incorrect 1 (flag: single incorrect rep), AUC personal 0.952 / population 0.952; 3: correct 10, incorrect 10, AUC personal 1.000 / population 0.090; 4: correct 17, incorrect 3, AUC personal 0.627 / population 0.784; 5: correct 10, incorrect 10, AUC personal 1.000 / population 0.980; 6: correct 10, incorrect 11, AUC personal 1.000 / population 1.000; 7: correct 10, incorrect 10, AUC personal 1.000 / population 0.000; 8: correct 13, incorrect 5, AUC personal 0.692 / population 0.646; 9: correct 18, incorrect 5, AUC personal 0.922 / population 0.944.

| Measurement | Status (Phase 4A.5) | Interpreted | Median standardized difference (incorrect - correct), interval | n |
|---|---|---|---|---|
| kneeRomL | passed | yes | 0.861 [0.152, 1.526] (96.1% exact interval) | 9 |
| kneeRomR | not checked | no | 0.968 [0.530, 1.524] (96.1% exact interval) | 9 |
| hipRom | passed | yes | 1.204 [0.651, 1.422] (96.1% exact interval) | 9 |
| depth | passed | yes | 1.088 [0.563, 1.680] (96.1% exact interval) | 9 |
| trunkLean | passed | yes | 1.203 [0.153, 1.639] (96.1% exact interval) | 9 |
| repDuration | failed | no | -0.984 [-1.454, 0.416] (96.1% exact interval) | 9 |
| eccentricDuration | not checked | no | -0.831 [-1.291, 0.387] (96.1% exact interval) | 9 |
| concentricDuration | not checked | no | -0.263 [-1.473, 0.157] (96.1% exact interval) | 9 |
| peakVelocity | not checked | no | 1.350 [1.077, 1.519] (96.1% exact interval) | 9 |
| asymmetry | failed | no | 0.018 [-0.349, 0.591] (96.1% exact interval) | 9 |

## split_squat_side (ex5_lunge/side): 5 persons, 53 correct and 53 incorrect reps

> Split squats: descriptive only. The app finds far fewer correct split squats than incorrect ones (recall 0.72 vs 0.93), and only peak trunk lean passed the Phase 4A.5 criteria.

| Baseline | Mean AUC, interval | Median AUC, interval | n persons |
|---|---|---|---|
| Personal (leave one correct rep out, fold-paired) | 0.914 [0.814, 1.014] (95% CI) | 0.929 [0.830, 1.000] (93.8% exact interval) | 5 |
| Population (leave one person out) | 0.547 [0.221, 0.872] (95% CI) | 0.590 [0.244, 0.846] (93.8% exact interval) | 5 |
| Personal minus population, per person | mean 0.367 | median 0.240 | 5 |

Per person: 2: correct 10, incorrect 10, AUC personal 0.830 / population 0.590; 4: correct 7, incorrect 10, AUC personal 1.000 / population 0.314; 5: correct 13, incorrect 11, AUC personal 0.979 / population 0.846; 6: correct 10, incorrect 10, AUC personal 0.830 / population 0.740; 8: correct 13, incorrect 12, AUC personal 0.929 / population 0.244.

| Measurement | Status (Phase 4A.5) | Interpreted | Median standardized difference (incorrect - correct), interval | n |
|---|---|---|---|---|
| kneeRomL | failed or not checked | no | 0.956 [-0.797, 1.199] (93.8% exact interval) | 5 |
| kneeRomR | failed or not checked | no | 1.159 [-0.165, 1.463] (93.8% exact interval) | 5 |
| hipRom | failed or not checked | no | -1.031 [-1.710, -0.382] (93.8% exact interval) | 5 |
| depth | failed or not checked | no | 1.161 [0.332, 1.832] (93.8% exact interval) | 5 |
| stepLength | failed or not checked | no | -1.205 [-1.563, -0.116] (93.8% exact interval) | 5 |
| trunkLean | passed | no | 0.715 [-1.332, 1.206] (approximate interval (calibrated coverage 93%)) | 5 |
| repDuration | failed or not checked | no | -0.159 [-1.515, 1.450] (approximate interval (calibrated coverage 93%)) | 5 |
| eccentricDuration | failed or not checked | no | -0.569 [-1.378, 1.483] (approximate interval (calibrated coverage 93%)) | 5 |
| concentricDuration | failed or not checked | no | 0.235 [-0.889, 1.055] (93.8% exact interval) | 5 |
| recoveryVelocity | failed or not checked | no | 1.308 [0.506, 1.486] (93.8% exact interval) | 5 |
| asymmetry | failed or not checked | no | -0.107 [-1.107, 0.878] (approximate interval (calibrated coverage 93%)) | 5 |

## Limits

- Mistakes differ between people by design; correct and incorrect reps were recorded in blocks.
- Some people have few incorrect reps (person 2: one).
- A higher score means 'more different from this person's correct reps', never 'worse'.
- Best-case motion-capture input; not MediaPipe or webcam accuracy.
- Development used shuffled labels, but this is not a blinded study: the data were inspected beforehand.
- With 9 people (8, 5 in the sensitivity and split-squat sets), intervals are wide and their calibration is limited.
