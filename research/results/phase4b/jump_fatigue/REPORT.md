# Phase 4B: fresh vs post-protocol jumps (exploratory)

Exploratory offline motion-capture evaluation: motion capture seen through a virtual camera and measured by BreakingPoint's own code. Not independent validation (the data and the Phase 4A.5 checks were inspected first), not a test of the production alert, and not a measure of MediaPipe or webcam accuracy. Kept separate from the synthetic UF HiPerGator study; nothing here is attributed to it.

Intervals: Student t for means, exact order-statistic intervals for medians, Wilson for proportions, each over people. Each carries the label its shuffled-label calibration earned (phase4b_interval_calibration.json): '95% CI' only where coverage was at least 93.5% under no effect and in the positive control; otherwise the calibrated coverage is stated, and below 85% no interval is shown. Calibration holds the people fixed and varies only the labels, so it cannot test coverage under between-person differences in true effects.

Protocol-freeze commit `0fa32fe655381d97057042678792f8fe48c9ec89`; analysis freeze (v2) SHA-256 `d7442a63212a0be865d689193abf111b76443feb3f46b68eceeb609603d3a4f5`. Deviations: research/protocols/phase4b_deviations.md.

Every result describes changes **after the fatigue protocol**, not effects of fatigue: all fresh jumps were recorded first (order confound). No permutation p-value is reported for fatigue. Path B (experimental timing, research only) is the primary path and is not independent validation: P1 was chosen on this dataset. Path A is the unchanged production pipeline.

## Samples and missing data (shown before any outcome)

Data-quality exclusions (both paths): 9 trials that start crouched: sub15_f_CMJ_t3, sub32_CMJ_t1, sub32_f_CMJ_t2, sub32_f_CMJ_t3, sub34_CMJ_t1, sub34_f_CMJ_t1, sub34_f_CMJ_t2, sub40_f_CMJ_t2, sub40_f_CMJ_t3.

| Path | View | Usable trials | Missing (not found) by group/condition |
|---|---|---|---|
| Path B: experimental timing pipeline (P1: 6 Hz Butterworth timing, One Euro angles; research only) | advised | 247 | ACL/fatigued 0/58; ACL/non_fatigued 0/61; control/fatigued 0/63; control/non_fatigued 0/65 |
| Path B: experimental timing pipeline (P1: 6 Hz Butterworth timing, One Euro angles; research only) | side | 245 | ACL/fatigued 2/58; ACL/non_fatigued 0/61; control/fatigued 0/63; control/non_fatigued 0/65 |
| Path A: unchanged production pipeline | advised | 227 | ACL/fatigued 5/58; ACL/non_fatigued 8/61; control/fatigued 4/63; control/non_fatigued 3/65 |
| Path A: unchanged production pipeline | side | 217 | ACL/fatigued 8/58; ACL/non_fatigued 10/61; control/fatigued 5/63; control/non_fatigued 7/65 |

| Sample | Path | Participants | Jumps | Control / ACL | Women / men |
|---|---|---|---|---|---|
| primary (advised) | B | 38 | 228 | 20 / 18 | 22 / 16 |
| same_participants (advised) | B | 30 | 180 | 16 / 14 | 21 / 9 |
| at_least_2_plus_2 (advised) | B | 40 | 237 | 21 / 19 | 23 / 17 |
| at_least_1_plus_1 (advised) | B | 43 | 247 | 22 / 21 | 23 / 20 |
| side_3_plus_3 (side) | B | 37 | 222 | 20 / 17 | 22 / 15 |
| primary (advised) | A | 30 | 180 | 16 / 14 | 21 / 9 |
| same_participants (advised) | A | 30 | 180 | 16 / 14 | 21 / 9 |
| at_least_2_plus_2 (advised) | A | 36 | 208 | 20 / 16 | 23 / 13 |
| at_least_1_plus_1 (advised) | A | 42 | 226 | 22 / 20 | 23 / 19 |
| side_3_plus_3 (side) | A | 24 | 144 | 13 / 11 | 21 / 3 |

The side-view samples are camera-angle sensitivity only; no subgroup comparisons are made from them (Path A's side-view sample has 3 men).

## J-D. Which measurements changed (post-protocol minus fresh, per participant)

Δz is the change divided by the mean of the app's spread (`scale`, with its noise floors) in the person's fresh and post-protocol jumps (analysis v2; see deviations).

### Primary: Path B, advised view, 38 participants (Holm-corrected Wilcoxon, exploratory)

| Measurement | n | Mean Δ, interval | Median Δ, interval | Mean Δz, interval | Share Δ > 0 | Rank-biserial r | Wilcoxon p | Holm p |
|---|---|---|---|---|---|---|---|---|
| jumpHeight | 38 | -0.0077 [-0.0131, -0.0022] (95% CI) | -0.0059 [-0.0152, -0.0010] (96.6% exact interval) | -0.335 [-0.565, -0.105] (95% CI) | 0.32 | -0.471 | 0.0105 | 0.0628 |
| countermovementDepth | 38 | 0.0013 [-0.0067, 0.0093] (95% CI) | 0.0013 [-0.0132, 0.0105] (96.6% exact interval) | -0.009 [-0.348, 0.330] (95% CI) | 0.55 | 0.050 | 0.7964 | 1.0000 |
| trunkLean | 38 | 1.9256 [0.3033, 3.5479] (95% CI) | 1.5495 [-0.5071, 3.6645] (96.6% exact interval) | 0.507 [0.090, 0.925] (95% CI) | 0.66 | 0.406 | 0.0284 | 0.1422 |
| landingKneeFlex | 38 | 1.0075 [-0.8799, 2.8949] (95% CI) | 0.3509 [-1.4343, 2.3447] (96.6% exact interval) | 0.097 [-0.282, 0.476] (95% CI) | 0.55 | 0.134 | 0.4817 | 1.0000 |
| rsiMod | 38 | -0.0215 [-0.0435, 0.0005] (95% CI) | -0.0392 [-0.0569, 0.0156] (96.6% exact interval) | -0.536 [-0.927, -0.145] (95% CI) | 0.37 | -0.379 | 0.0414 | 0.1655 |
| eccentricDuration | 38 | -0.0050 [-0.0488, 0.0388] (95% CI) | 0.0074 [-0.0089, 0.0261] (96.6% exact interval) | 0.145 [-0.268, 0.559] (95% CI) | 0.61 | 0.152 | 0.4210 | 1.0000 |

Not validated in Phase 4A.5 (reported, not interpreted):

- flightTime: mean Δ -0.0047 [-0.0120, 0.0026] (95% CI), mean Δz -0.144 [-0.409, 0.121] (95% CI), n 38
- concentricDuration: mean Δ 0.0181 [0.0023, 0.0339] (95% CI), mean Δz 0.369 [0.087, 0.650] (95% CI), n 38
- asymmetry: mean Δ -0.0218 [-0.8330, 0.7893] (95% CI), mean Δz -0.024 [-0.311, 0.262] (95% CI), n 38

### Supporting (effect sizes and intervals; no hypothesis tests)

**same_participants (advised), Path B, 30 participants:** jumpHeight mean Δz -0.394 [-0.618, -0.170] (95% CI); countermovementDepth mean Δz 0.035 [-0.272, 0.343] (95% CI); trunkLean mean Δz 0.558 [0.182, 0.934] (95% CI); landingKneeFlex mean Δz 0.066 [-0.321, 0.453] (95% CI); rsiMod mean Δz -0.681 [-1.137, -0.225] (95% CI); eccentricDuration mean Δz 0.180 [-0.330, 0.690] (95% CI).

**at_least_2_plus_2 (advised), Path B, 40 participants:** jumpHeight mean Δz -0.335 [-0.565, -0.105] (uncalibrated); countermovementDepth mean Δz -0.009 [-0.348, 0.330] (uncalibrated); trunkLean mean Δz 0.507 [0.090, 0.925] (uncalibrated); landingKneeFlex mean Δz 0.097 [-0.282, 0.476] (uncalibrated); rsiMod mean Δz -0.536 [-0.927, -0.145] (uncalibrated); eccentricDuration mean Δz 0.145 [-0.268, 0.559] (uncalibrated).

**at_least_1_plus_1 (advised), Path B, 43 participants:** jumpHeight mean Δz -0.335 [-0.565, -0.105] (uncalibrated); countermovementDepth mean Δz -0.009 [-0.348, 0.330] (uncalibrated); trunkLean mean Δz 0.507 [0.090, 0.925] (uncalibrated); landingKneeFlex mean Δz 0.097 [-0.282, 0.476] (uncalibrated); rsiMod mean Δz -0.536 [-0.927, -0.145] (uncalibrated); eccentricDuration mean Δz 0.145 [-0.268, 0.559] (uncalibrated).

**side_3_plus_3 (side), Path B, 37 participants:** jumpHeight mean Δz -0.317 [-0.552, -0.082] (95% CI); countermovementDepth mean Δz 0.020 [-0.324, 0.365] (95% CI); trunkLean mean Δz 0.485 [0.084, 0.886] (95% CI); landingKneeFlex mean Δz 0.235 [-0.133, 0.603] (95% CI); rsiMod mean Δz -0.636 [-1.071, -0.201] (95% CI); eccentricDuration mean Δz 0.143 [-0.277, 0.564] (95% CI).

**primary (advised), Path A, 30 participants:** jumpHeight mean Δz -0.417 [-0.664, -0.170] (95% CI); countermovementDepth mean Δz 0.163 [-0.134, 0.460] (95% CI); trunkLean mean Δz 0.558 [0.182, 0.934] (95% CI); landingKneeFlex mean Δz 0.097 [-0.283, 0.476] (95% CI); rsiMod mean Δz -0.629 [-1.081, -0.178] (95% CI); eccentricDuration mean Δz 0.227 [-0.222, 0.677] (95% CI).

**same_participants (advised), Path A, 30 participants:** jumpHeight mean Δz -0.417 [-0.664, -0.170] (95% CI); countermovementDepth mean Δz 0.163 [-0.134, 0.460] (95% CI); trunkLean mean Δz 0.558 [0.182, 0.934] (95% CI); landingKneeFlex mean Δz 0.097 [-0.283, 0.476] (95% CI); rsiMod mean Δz -0.629 [-1.081, -0.178] (95% CI); eccentricDuration mean Δz 0.227 [-0.222, 0.677] (95% CI).

**at_least_2_plus_2 (advised), Path A, 36 participants:** jumpHeight mean Δz -0.417 [-0.664, -0.170] (uncalibrated); countermovementDepth mean Δz 0.163 [-0.134, 0.460] (uncalibrated); trunkLean mean Δz 0.558 [0.182, 0.934] (uncalibrated); landingKneeFlex mean Δz 0.097 [-0.283, 0.476] (uncalibrated); rsiMod mean Δz -0.629 [-1.081, -0.178] (uncalibrated); eccentricDuration mean Δz 0.227 [-0.222, 0.677] (uncalibrated).

**at_least_1_plus_1 (advised), Path A, 42 participants:** jumpHeight mean Δz -0.417 [-0.664, -0.170] (uncalibrated); countermovementDepth mean Δz 0.163 [-0.134, 0.460] (uncalibrated); trunkLean mean Δz 0.558 [0.182, 0.934] (uncalibrated); landingKneeFlex mean Δz 0.097 [-0.283, 0.476] (uncalibrated); rsiMod mean Δz -0.629 [-1.081, -0.178] (uncalibrated); eccentricDuration mean Δz 0.227 [-0.222, 0.677] (uncalibrated).

**side_3_plus_3 (side), Path A, 24 participants:** jumpHeight mean Δz -0.334 [-0.640, -0.029] (95% CI); countermovementDepth mean Δz 0.029 [-0.266, 0.323] (95% CI); trunkLean mean Δz 0.272 [-0.110, 0.653] (95% CI); landingKneeFlex mean Δz -0.121 [-0.518, 0.275] (95% CI); rsiMod mean Δz -0.607 [-1.180, -0.034] (95% CI); eccentricDuration mean Δz 0.177 [-0.370, 0.723] (95% CI).

**Same participants (30), paired Path B minus Path A difference in Δz:** jumpHeight 0.023 [-0.034, 0.080] (95% CI); countermovementDepth -0.127 [-0.236, -0.019] (95% CI); trunkLean 0.000 [0.000, 0.000] (95% CI); landingKneeFlex -0.031 [-0.112, 0.050] (95% CI); rsiMod -0.052 [-0.139, 0.036] (95% CI); eccentricDuration -0.047 [-0.176, 0.081] (95% CI). S0 personal true-split rank, B minus A: median 0.0.

## J-A. Separation under a personal baseline (descriptive; rank 1 of 20 = the fresh jumps as reference separate the most)

These are descriptive separation statistics, not p-values: the order confound makes the six jumps non-exchangeable. With no effect the mean rank is 10.5 and the share at rank 1 is about 0.05.

| Sample | Path | Score | n | Mean rank, interval | Median rank, interval | At rank 1, Wilson interval | Mean true-split score, interval |
|---|---|---|---|---|---|---|---|
| primary (advised) | B | S0 | 38 | 7.55 [5.55, 9.56] (95% CI) | 5.5 [3.0, 11.0] (96.6% exact interval) | 7/38 [0.09, 0.33] (95% CI) | 1.329 [1.184, 1.473] (95% CI) |
| primary (advised) | B | S-P2 | 38 | 7.53 [5.64, 9.42] (95% CI) | 6.0 [3.0, 11.0] (96.6% exact interval) | 7/38 [0.09, 0.33] (95% CI) | 1.342 [1.191, 1.493] (95% CI) |
| primary (advised) | B | S-P3 | 38 | 7.71 [5.69, 9.73] (95% CI) | 6.0 [3.0, 11.0] (96.6% exact interval) | 6/38 [0.07, 0.30] (95% CI) | 1.330 [1.177, 1.483] (95% CI) |
| primary (advised) | B | S-P2P3 | 38 | 7.42 [5.50, 9.34] (95% CI) | 6.0 [2.0, 12.0] (96.6% exact interval) | 7/38 [0.09, 0.33] (95% CI) | 1.344 [1.184, 1.505] (95% CI) |
| primary (advised) | B | S-valid | 38 | 7.55 [5.69, 9.42] (95% CI) | 7.0 [2.0, 11.0] (96.6% exact interval) | 7/38 [0.09, 0.33] (95% CI) | 1.347 [1.181, 1.513] (95% CI) |
| same_participants (advised) | B | S0 | 30 | 7.83 [5.52, 10.15] (95% CI) | 6.0 [3.0, 11.0] (95.7% exact interval) | 5/30 [0.07, 0.34] (95% CI) | 1.300 [1.152, 1.449] (95% CI) |
| same_participants (advised) | B | S-P2 | 30 | 7.73 [5.52, 9.95] (95% CI) | 6.0 [3.0, 12.0] (95.7% exact interval) | 5/30 [0.07, 0.34] (95% CI) | 1.315 [1.156, 1.473] (95% CI) |
| same_participants (advised) | B | S-P3 | 30 | 8.10 [5.75, 10.45] (95% CI) | 6.0 [3.0, 12.0] (95.7% exact interval) | 4/30 [0.05, 0.30] (approximate interval (calibrated coverage 93%)) | 1.294 [1.133, 1.454] (95% CI) |
| same_participants (advised) | B | S-P2P3 | 30 | 7.87 [5.59, 10.14] (95% CI) | 7.5 [2.0, 12.0] (95.7% exact interval) | 5/30 [0.07, 0.34] (95% CI) | 1.309 [1.137, 1.482] (95% CI) |
| same_participants (advised) | B | S-valid | 30 | 8.13 [5.89, 10.37] (95% CI) | 7.5 [2.0, 12.0] (95.7% exact interval) | 5/30 [0.07, 0.34] (95% CI) | 1.306 [1.129, 1.483] (95% CI) |
| side_3_plus_3 (side) | B | S0 | 37 | 8.00 [5.99, 10.01] (95% CI) | 6.0 [4.0, 10.0] (95.3% exact interval) | 6/37 [0.08, 0.31] (95% CI) | 1.286 [1.145, 1.426] (95% CI) |
| side_3_plus_3 (side) | B | S-P2 | 37 | 7.59 [5.66, 9.53] (95% CI) | 7.0 [3.0, 10.0] (95.3% exact interval) | 5/37 [0.06, 0.28] (95% CI) | 1.302 [1.153, 1.452] (95% CI) |
| side_3_plus_3 (side) | B | S-P3 | 37 | 8.32 [6.26, 10.39] (95% CI) | 6.0 [4.0, 11.0] (95.3% exact interval) | 5/37 [0.06, 0.28] (95% CI) | 1.306 [1.157, 1.456] (95% CI) |
| side_3_plus_3 (side) | B | S-P2P3 | 37 | 7.86 [5.92, 9.81] (95% CI) | 7.0 [3.0, 10.0] (95.3% exact interval) | 5/37 [0.06, 0.28] (95% CI) | 1.325 [1.166, 1.485] (95% CI) |
| side_3_plus_3 (side) | B | S-valid | 37 | 7.84 [5.94, 9.74] (95% CI) | 6.0 [4.0, 10.0] (95.3% exact interval) | 3/37 [0.03, 0.21] (95% CI) | 1.314 [1.154, 1.474] (95% CI) |
| primary (advised) | A | S0 | 30 | 7.47 [5.44, 9.49] (95% CI) | 6.0 [3.0, 11.0] (95.7% exact interval) | 5/30 [0.07, 0.34] (95% CI) | 1.320 [1.171, 1.469] (95% CI) |
| primary (advised) | A | S-P2 | 30 | 7.37 [5.39, 9.34] (95% CI) | 6.0 [3.0, 10.0] (95.7% exact interval) | 5/30 [0.07, 0.34] (95% CI) | 1.317 [1.158, 1.476] (95% CI) |
| primary (advised) | A | S-P3 | 30 | 7.83 [5.67, 9.99] (95% CI) | 6.0 [3.0, 11.0] (95.7% exact interval) | 3/30 [0.03, 0.26] (95% CI) | 1.311 [1.150, 1.471] (95% CI) |
| primary (advised) | A | S-P2P3 | 30 | 7.77 [5.62, 9.92] (95% CI) | 7.0 [3.0, 10.0] (95.7% exact interval) | 3/30 [0.03, 0.26] (95% CI) | 1.304 [1.131, 1.478] (95% CI) |
| primary (advised) | A | S-valid | 30 | 8.03 [5.89, 10.17] (95% CI) | 7.0 [3.0, 11.0] (95.7% exact interval) | 4/30 [0.05, 0.30] (95% CI) | 1.313 [1.138, 1.488] (95% CI) |
| same_participants (advised) | A | S0 | 30 | 7.47 [5.44, 9.49] (95% CI) | 6.0 [3.0, 11.0] (95.7% exact interval) | 5/30 [0.07, 0.34] (95% CI) | 1.320 [1.171, 1.469] (95% CI) |
| same_participants (advised) | A | S-P2 | 30 | 7.37 [5.39, 9.34] (95% CI) | 6.0 [3.0, 10.0] (95.7% exact interval) | 5/30 [0.07, 0.34] (approximate interval (calibrated coverage 93%)) | 1.317 [1.158, 1.476] (95% CI) |
| same_participants (advised) | A | S-P3 | 30 | 7.83 [5.67, 9.99] (95% CI) | 6.0 [3.0, 11.0] (95.7% exact interval) | 3/30 [0.03, 0.26] (approximate interval (calibrated coverage 93%)) | 1.311 [1.150, 1.471] (95% CI) |
| same_participants (advised) | A | S-P2P3 | 30 | 7.77 [5.62, 9.92] (95% CI) | 7.0 [3.0, 10.0] (95.7% exact interval) | 3/30 [0.03, 0.26] (approximate interval (calibrated coverage 93%)) | 1.304 [1.131, 1.478] (95% CI) |
| same_participants (advised) | A | S-valid | 30 | 8.03 [5.89, 10.17] (95% CI) | 7.0 [3.0, 11.0] (95.7% exact interval) | 4/30 [0.05, 0.30] (95% CI) | 1.313 [1.138, 1.488] (95% CI) |
| side_3_plus_3 (side) | A | S0 | 24 | 8.92 [6.16, 11.67] (95% CI) | 7.5 [4.0, 13.0] (97.7% exact interval) | 3/24 [0.04, 0.31] (95% CI) | 1.203 [1.020, 1.385] (95% CI) |
| side_3_plus_3 (side) | A | S-P2 | 24 | 8.83 [6.15, 11.52] (95% CI) | 7.0 [4.0, 14.0] (97.7% exact interval) | 4/24 [0.07, 0.36] (95% CI) | 1.205 [1.013, 1.397] (95% CI) |
| side_3_plus_3 (side) | A | S-P3 | 24 | 9.04 [6.31, 11.78] (95% CI) | 8.0 [4.0, 14.0] (97.7% exact interval) | 3/24 [0.04, 0.31] (95% CI) | 1.228 [1.034, 1.423] (95% CI) |
| side_3_plus_3 (side) | A | S-P2P3 | 24 | 8.83 [6.20, 11.46] (95% CI) | 7.5 [4.0, 13.0] (97.7% exact interval) | 4/24 [0.07, 0.36] (95% CI) | 1.233 [1.028, 1.438] (95% CI) |
| side_3_plus_3 (side) | A | S-valid | 24 | 9.17 [6.57, 11.76] (95% CI) | 8.5 [4.0, 13.0] (97.7% exact interval) | 3/24 [0.04, 0.31] (95% CI) | 1.222 [1.021, 1.424] (95% CI) |

Scores: S0, shipped score (all nine measurements); S-P2, without flight time (experimental ablation); S-P3, without left-right difference (experimental ablation); S-P2P3, without both (experimental ablation); S-valid, the six measurements that passed Phase 4A.5 (experimental, exploratory: selected on this dataset).

## J-B. Population baseline (leave one participant out)

| Sample | Path | Score | n | Mean Δscore, interval | Mean rank, interval | Personal minus population rank, median |
|---|---|---|---|---|---|---|
| primary (advised) | B | S0 | 38 | -0.003 [-0.072, 0.066] (95% CI) | 10.37 [8.12, 12.61] (95% CI) | -2.0 |
| primary (advised) | B | S-P2 | 38 | -0.009 [-0.081, 0.064] (95% CI) | 10.92 [8.76, 13.08] (95% CI) | -3.0 |
| primary (advised) | B | S-P3 | 38 | -0.002 [-0.074, 0.071] (95% CI) | 10.37 [8.16, 12.57] (95% CI) | -1.5 |
| primary (advised) | B | S-P2P3 | 38 | -0.008 [-0.084, 0.067] (95% CI) | 10.95 [8.86, 13.04] (95% CI) | -2.0 |
| primary (advised) | B | S-valid | 38 | -0.039 [-0.106, 0.029] (95% CI) | 11.87 [9.85, 13.89] (95% CI) | -2.5 |
| same_participants (advised) | B | S0 | 30 | -0.010 [-0.094, 0.073] (95% CI) | 11.23 [8.83, 13.64] (95% CI) | -1.5 |
| same_participants (advised) | B | S-P2 | 30 | -0.009 [-0.095, 0.076] (95% CI) | 11.20 [8.83, 13.57] (95% CI) | -1.5 |
| same_participants (advised) | B | S-P3 | 30 | -0.019 [-0.107, 0.070] (95% CI) | 11.20 [8.89, 13.51] (95% CI) | -2.0 |
| same_participants (advised) | B | S-P2P3 | 30 | -0.018 [-0.109, 0.073] (95% CI) | 11.23 [8.88, 13.58] (95% CI) | -2.5 |
| same_participants (advised) | B | S-valid | 30 | -0.054 [-0.135, 0.027] (95% CI) | 12.00 [9.72, 14.28] (95% CI) | -2.5 |
| at_least_2_plus_2 (advised) | B | S0 | 40 | 0.005 [-0.062, 0.073] (95% CI) | - | - |
| at_least_2_plus_2 (advised) | B | S-P2 | 40 | 0.001 [-0.070, 0.072] (95% CI) | - | - |
| at_least_2_plus_2 (advised) | B | S-P3 | 40 | 0.009 [-0.063, 0.081] (95% CI) | - | - |
| at_least_2_plus_2 (advised) | B | S-P2P3 | 40 | 0.003 [-0.072, 0.078] (95% CI) | - | - |
| at_least_2_plus_2 (advised) | B | S-valid | 40 | -0.025 [-0.094, 0.044] (95% CI) | - | - |
| at_least_1_plus_1 (advised) | B | S0 | 43 | -0.022 [-0.093, 0.049] (95% CI) | - | - |
| at_least_1_plus_1 (advised) | B | S-P2 | 43 | -0.024 [-0.096, 0.049] (95% CI) | - | - |
| at_least_1_plus_1 (advised) | B | S-P3 | 43 | -0.020 [-0.095, 0.055] (95% CI) | - | - |
| at_least_1_plus_1 (advised) | B | S-P2P3 | 43 | -0.022 [-0.098, 0.054] (95% CI) | - | - |
| at_least_1_plus_1 (advised) | B | S-valid | 43 | -0.050 [-0.120, 0.021] (95% CI) | - | - |
| side_3_plus_3 (side) | B | S0 | 37 | -0.020 [-0.097, 0.058] (95% CI) | 11.11 [9.04, 13.18] (95% CI) | -2.0 |
| side_3_plus_3 (side) | B | S-P2 | 37 | -0.006 [-0.085, 0.073] (95% CI) | 10.59 [8.53, 12.66] (95% CI) | -2.0 |
| side_3_plus_3 (side) | B | S-P3 | 37 | -0.020 [-0.101, 0.061] (95% CI) | 11.22 [9.13, 13.30] (95% CI) | -2.0 |
| side_3_plus_3 (side) | B | S-P2P3 | 37 | -0.006 [-0.088, 0.077] (95% CI) | 10.73 [8.64, 12.82] (95% CI) | -3.0 |
| side_3_plus_3 (side) | B | S-valid | 37 | -0.037 [-0.110, 0.036] (95% CI) | 11.86 [9.86, 13.87] (95% CI) | -4.0 |
| primary (advised) | A | S0 | 30 | -0.022 [-0.104, 0.061] (95% CI) | 11.87 [9.56, 14.17] (95% CI) | -2.5 |
| primary (advised) | A | S-P2 | 30 | -0.012 [-0.103, 0.079] (95% CI) | 11.13 [8.74, 13.52] (95% CI) | -1.0 |
| primary (advised) | A | S-P3 | 30 | -0.033 [-0.122, 0.055] (95% CI) | 12.40 [10.11, 14.69] (95% CI) | -3.0 |
| primary (advised) | A | S-P2P3 | 30 | -0.023 [-0.121, 0.074] (95% CI) | 11.67 [9.22, 14.11] (95% CI) | -4.0 |
| primary (advised) | A | S-valid | 30 | -0.058 [-0.141, 0.025] (95% CI) | 11.93 [9.44, 14.42] (95% CI) | -3.5 |
| same_participants (advised) | A | S0 | 30 | -0.022 [-0.104, 0.061] (95% CI) | 11.87 [9.56, 14.17] (95% CI) | -2.5 |
| same_participants (advised) | A | S-P2 | 30 | -0.012 [-0.103, 0.079] (95% CI) | 11.13 [8.74, 13.52] (95% CI) | -1.0 |
| same_participants (advised) | A | S-P3 | 30 | -0.033 [-0.122, 0.055] (95% CI) | 12.40 [10.11, 14.69] (95% CI) | -3.0 |
| same_participants (advised) | A | S-P2P3 | 30 | -0.023 [-0.121, 0.074] (95% CI) | 11.67 [9.22, 14.11] (95% CI) | -4.0 |
| same_participants (advised) | A | S-valid | 30 | -0.058 [-0.141, 0.025] (95% CI) | 11.93 [9.44, 14.42] (95% CI) | -3.5 |
| at_least_2_plus_2 (advised) | A | S0 | 36 | -0.004 [-0.074, 0.066] (95% CI) | - | - |
| at_least_2_plus_2 (advised) | A | S-P2 | 36 | 0.002 [-0.075, 0.079] (95% CI) | - | - |
| at_least_2_plus_2 (advised) | A | S-P3 | 36 | -0.012 [-0.087, 0.063] (95% CI) | - | - |
| at_least_2_plus_2 (advised) | A | S-P2P3 | 36 | -0.006 [-0.089, 0.077] (95% CI) | - | - |
| at_least_2_plus_2 (advised) | A | S-valid | 36 | -0.034 [-0.107, 0.039] (95% CI) | - | - |
| at_least_1_plus_1 (advised) | A | S0 | 42 | -0.018 [-0.091, 0.056] (95% CI) | - | - |
| at_least_1_plus_1 (advised) | A | S-P2 | 42 | -0.019 [-0.097, 0.060] (95% CI) | - | - |
| at_least_1_plus_1 (advised) | A | S-P3 | 42 | -0.027 [-0.104, 0.051] (95% CI) | - | - |
| at_least_1_plus_1 (advised) | A | S-P2P3 | 42 | -0.028 [-0.111, 0.055] (95% CI) | - | - |
| at_least_1_plus_1 (advised) | A | S-valid | 42 | -0.053 [-0.127, 0.022] (95% CI) | - | - |
| side_3_plus_3 (side) | A | S0 | 24 | 0.006 [-0.114, 0.126] (95% CI) | 9.67 [6.85, 12.48] (95% CI) | 0.5 |
| side_3_plus_3 (side) | A | S-P2 | 24 | 0.009 [-0.119, 0.137] (95% CI) | 10.33 [7.56, 13.11] (95% CI) | -0.5 |
| side_3_plus_3 (side) | A | S-P3 | 24 | -0.006 [-0.131, 0.119] (95% CI) | 10.46 [7.73, 13.19] (95% CI) | 0.0 |
| side_3_plus_3 (side) | A | S-P2P3 | 24 | -0.004 [-0.137, 0.130] (95% CI) | 11.08 [8.27, 13.90] (95% CI) | -3.0 |
| side_3_plus_3 (side) | A | S-valid | 24 | -0.038 [-0.156, 0.080] (95% CI) | 11.67 [8.93, 14.41] (95% CI) | -3.5 |

## J-C. Order probe (primary samples): median absolute change, jump 1 to jump 3 within a block, vs between blocks

| Path | Measurement | Within fresh | Within post-protocol | Between blocks (mean post - mean fresh) |
|---|---|---|---|---|
| B | jumpHeight | 0.0170 | 0.0192 | 0.0126 |
| B | countermovementDepth | 0.0231 | 0.0236 | 0.0162 |
| B | trunkLean | 4.4986 | 3.6160 | 3.2263 |
| B | landingKneeFlex | 4.2089 | 3.8296 | 3.1766 |
| B | rsiMod | 0.0542 | 0.0683 | 0.0557 |
| B | eccentricDuration | 0.0398 | 0.0593 | 0.0321 |
| B | S0 population score | 0.1272 | 0.1214 | 0.1008 |
| A | jumpHeight | 0.0172 | 0.0203 | 0.0083 |
| A | countermovementDepth | 0.0230 | 0.0162 | 0.0122 |
| A | trunkLean | 6.0249 | 3.6160 | 3.2548 |
| A | landingKneeFlex | 3.5669 | 3.7858 | 3.0265 |
| A | rsiMod | 0.0418 | 0.0519 | 0.0513 |
| A | eccentricDuration | 0.0483 | 0.0588 | 0.0448 |
| A | S0 population score | 0.1492 | 0.1071 | 0.0819 |

## J-E. Direction checks (primary samples, descriptive)

- Path B: app jump-height change vs centre-of-mass rise change: Spearman 0.914, same sign 0.92 (n 38); vs force-plate height change (participant_log.xlsx, provenance unverified, direction only): same sign 0.68 (n 38).
- Path A: app jump-height change vs centre-of-mass rise change: Spearman 0.877, same sign 0.87 (n 30); vs force-plate height change (participant_log.xlsx, provenance unverified, direction only): same sign 0.73 (n 30).

## J-F. Between-person variability (primary samples, descriptive; no tests, no intervals, no subgroup performance claims)

| Path | Subgroup | n | jumpHeight Δz median (IQR) | countermovementDepth Δz median (IQR) | trunkLean Δz median (IQR) | landingKneeFlex Δz median (IQR) | rsiMod Δz median (IQR) | eccentricDuration Δz median (IQR) |
|---|---|---|---|---|---|---|---|---|
| B | group=control | 20 | -0.209 (-0.571 to 0.263) | 0.085 (-0.690 to 0.776) | 0.815 (0.021 to 1.740) | 0.102 (-0.751 to 0.836) | -0.775 (-1.266 to 0.546) | 0.267 (-0.295 to 0.782) |
| B | group=ACL | 18 | -0.464 (-1.132 to -0.057) | 0.040 (-0.783 to 0.495) | 0.213 (-0.526 to 0.820) | 0.079 (-0.653 to 0.916) | -0.485 (-1.423 to 0.358) | 0.060 (-0.294 to 0.548) |
| B | sex=female | 22 | -0.184 (-0.655 to 0.053) | 0.013 (-0.648 to 0.388) | 0.366 (-0.434 to 0.871) | 0.120 (-0.815 to 0.757) | -0.863 (-1.353 to 0.387) | 0.211 (-0.244 to 0.666) |
| B | sex=male | 16 | -0.483 (-0.941 to 0.339) | 0.150 (-0.882 to 0.738) | 0.475 (-0.318 to 1.740) | 0.074 (-0.320 to 0.979) | -0.466 (-1.300 to 0.375) | 0.082 (-0.486 to 0.634) |
| A | group=control | 16 | -0.318 (-0.674 to -0.012) | 0.046 (-0.547 to 0.698) | 0.815 (0.189 to 1.740) | 0.279 (-0.290 to 0.942) | -0.920 (-1.745 to -0.149) | 0.526 (-0.188 to 0.850) |
| A | group=ACL | 14 | -0.291 (-1.116 to 0.038) | 0.165 (-0.156 to 0.754) | 0.329 (-0.202 to 0.820) | 0.019 (-0.574 to 0.775) | -0.586 (-1.252 to 0.396) | 0.082 (-0.542 to 1.013) |
| A | sex=female | 21 | -0.178 (-0.741 to 0.055) | 0.029 (-0.344 to 0.662) | 0.540 (-0.351 to 0.877) | 0.033 (-0.599 to 0.958) | -0.759 (-1.261 to 0.344) | 0.450 (-0.297 to 1.071) |
| A | sex=male | 9 | -0.328 (-0.983 to -0.306) | 0.201 (-0.108 to 0.785) | 0.533 (0.399 to 1.738) | 0.095 (-0.187 to 0.876) | -0.930 (-1.398 to 0.465) | 0.439 (-0.633 to 0.838) |

## Limits

- Order confound: fresh jumps always came first; changes are 'after the protocol', not fatigue.
- Three jumps per block, below the app's 4-rep calibration minimum; the alert is not evaluated.
- Unilateral fatigue protocol, bilateral jumps.
- Control vs ACL is descriptive; nothing is said about injury.
- Best-case motion-capture input; not MediaPipe or webcam accuracy.
- Path A misses the highest jumps, and in the ACL group more fresh than post-protocol jumps.
- Path B and S-valid were shaped by Phase 4A.5 on this dataset; neither is independent validation.
- Development used shuffled labels, but this is not a blinded study: the data and some reference outcomes were inspected beforehand.
- Interval calibration holds the participants fixed; it cannot check coverage under between-person differences in true effects.
