# Phase 4B results: exploratory evaluation on two motion-capture datasets

**Exploratory offline evaluation on existing motion-capture datasets.** Motion capture was seen through a virtual camera and measured by BreakingPoint's own code. This is not independent validation of webcam accuracy, MediaPipe tracking, the production alert, or fatigue detection. It is kept separate from the synthetic UF HiPerGator study: no number here is attributed to that study, and none goes into the app or its public claims.

| | |
|---|---|
| Run | The single real-label run, 2026-10-10 00:36:28 to 00:36:34 (UTC-4), `python -I -B research/phase4b/run.py actual`, exit code 0 |
| Code | Commit `b86f22784fd4ab368c1b6e2da012018cea69ec3c` on `redesign/breakaway` |
| Protocol freeze | Commit `0fa32fe655381d97057042678792f8fe48c9ec89`; `phase4b_protocol_freeze.json` SHA-256 `89032a0a774dbb9d5f803e695ee95e0cd1569552e61925c1dd1dbbe286d83b1a` |
| Analysis freeze | v2, `phase4b_analysis_freeze_v2.json` SHA-256 `d7442a63212a0be865d689193abf111b76443feb3f46b68eceeb609603d3a4f5` |
| Protocols | `research/protocols/jump_fatigue_v04.md`, `research/protocols/rehab24_6_v04.md` |
| Status | Not committed. Waiting for Adam's review. |

Every statistic below comes from the frozen outputs. Nothing in the analysis was changed after the results were seen. This file was written after the run, to explain the results. Apart from counts and two simple ratios, which are stated as such, it adds no numbers.

## Short answers

### Did personal baselines distinguish the jumps after the protocol?

**Modestly, and not reliably for any one person.** The comparison is to the jumps before the protocol.

**Personal baseline (J-A).** The app built a baseline from each person's three fresh jumps and scored the three post-protocol jumps. That split was then ranked among the 20 ways of dividing the person's six jumps.
- With no difference, the expected mean rank is 10.5. The observed mean rank was 7.55 (95% CI 5.55 to 9.56) in the primary sample of 38.
- 18% of participants (7 of 38) had their true split ranked first, against about 5% by chance.
- This is about the level the shuffled-label positive control produced (mean rank 7.36, 16% at rank 1).
- The spread was wide: about a quarter of participants ranked the true split 13th or lower.

**Population baseline (J-B).** A baseline built from the other participants' fresh jumps did not separate the blocks at all: mean rank 10.37 (8.12 to 12.61), mean score change −0.003 (−0.072 to 0.066).

**The order confound.** All fresh jumps came first, so any difference between the blocks may come from the protocol, time, warm-up or practice. It cannot be called fatigue. For every measurement, the change from jump 1 to jump 3 within a block was about as large as the shift between blocks.

**REHAB24-6 squats.** These compare correct reps with technique errors made on purpose, which is a different question from fatigue.
- The personal baseline separated them well: mean AUC 0.92 (0.83 to 1.00); every person was at 0.67 or higher.
- The population baseline was erratic: mean 0.63 (0.31 to 0.94). For three of the nine people it scored the incorrect reps as more typical than the correct ones (AUC 0.08 to 0.19).
- The personal baseline was not uniformly better. For 3 of 9 people the population AUC was higher, by 0.03 to 0.20.

### Did the experimental timing correction (Path B) improve the results?

**Not in separation or effect sizes. It mainly reduced missing data.**
- **Same 30 participants on both paths.** The personal true-split rank did not differ: median paired difference 0, mean +0.37 ranks against Path B.
- **Paired change differences.** These were close to 0 for every measurement except countermovement depth: Path B −0.13 SD (−0.24 to −0.02), a smaller change than Path A. Trunk lean was identical on both paths for every participant: Path B changes only the jump timing, and peak trunk lean did not depend on it.
- **Missing data.** Path B found a jump in all 247 eligible advised-view trials, while Path A missed 20. That gave 38 complete participants against 30.
- **Selection bias.** Path A's misses fall on the highest jumps, and more often on the ACL group's fresh jumps, so Path B reduces this bias.
- **Conclusions do not change.** On Path B's larger sample they match Path A's.
- **Not independent validation.** The correction was chosen on this same dataset in Phase 4A.5.

### Which measurements looked useful, and which looked unreliable?

**Jumps after the protocol** (Path B, 38 participants):
- **None of the six prespecified tests survived Holm correction.** The smallest adjusted p was 0.063, for jump height.
- **Three measurements moved in a consistent direction across samples:**
  - **Jump height** fell: mean −0.0077 leg lengths, about 0.8 cm (95% CI −0.0131 to −0.0022); −0.34 SD of the person's own spread. Its interval excludes 0 in every sample on both paths. In the primary family, it is the only measurement whose median change also has an exact interval excluding 0.
  - **RSI-mod** fell: −0.54 SD (−0.93 to −0.15). In raw units the change was borderline: its interval reaches 0 in the primary sample and in Path A's samples.
  - **Peak trunk lean** rose: +1.9° (0.3 to 3.5); +0.51 SD (0.09 to 0.93). It was the least robust of the three: its interval includes 0 in the "at least 1+1" samples and in Path A's side view.
- **No clear change:** countermovement depth, landing knee flexion, and unweighting plus braking duration.
- **Not interpreted, because they failed the Phase 4A.5 agreement checks:** flight time, propulsion duration and the left-right difference. Propulsion duration rose 0.018 s (0.002 to 0.034).
- **Ablations made no difference to personal separation:** removing flight time, the left-right difference, or both, or keeping only the six validated measurements. Mean ranks were 7.42 to 7.71 against 7.55 for the shipped score.

**Squats with deliberate errors** (REHAB24-6):
- **All four validated measurements differed by about one person-SD** (medians 1.1 to 1.2): camera-side knee range of motion, hip range of motion, depth and trunk lean. Their intervals exclude 0 in the primary and side views.
- **Peak velocity**, which Phase 4A.5 never checked, also differed strongly.
- **Inconsistent:** rep duration, eccentric and concentric duration, and the left-right difference. Their intervals include 0, and the left-right difference changes sign between views.

## Files

| Path | Contents |
|---|---|
| `jump_fatigue/REPORT.md`, `jump_fatigue/summary.json` | Written by the frozen code (jump dataset) |
| `rehab24_6/REPORT.md`, `rehab24_6/summary.json` | Written by the frozen code (REHAB24-6) |
| `tables/*.csv` | The same numbers as CSV, including per-participant values, copied by `reproduce/export_tables.py` (no new statistics) |
| `EXECUTION.json` | Run times, exit code, the pre-run checks, environment, and hashes of every input record and output |
| `execution/` | The run's stdout and stderr, and the pre-run checks |
| `reproduce/` | The pre-run check, the execution recorder and the table exporter |
| `MANIFEST.sha256` | Raw SHA-256 of every file in this folder |

## 1. Jumps before and after the fatigue protocol

**Dataset.** Calisti, Mohr and Federolf (2025), doi:10.6084/m9.figshare.28890545.v1, CC BY 4.0. 43 usable participants, with 3 fresh and 3 post-protocol countermovement jumps each.

**Units:**
- jump height and countermovement depth: fraction of leg length (legs measured 0.91 to 1.06 m);
- trunk lean and knee flexion: degrees;
- durations: seconds;
- RSI-mod: the app's index;
- Δz: the change divided by the mean of the person's own spread in the two blocks, as the app measures that spread.

### Samples and missing data

**Exclusions.** Nine trials that start crouched were excluded on both paths.

**Missing jumps:**
- **Path B:** none missing in the advised (35°) view; 2 of 58 ACL post-protocol trials missing in the side view.
- **Path A:** 20 of 247 missing in the advised view and 30 of 247 in the side view, more of them fresh than post-protocol jumps.

| Sample | Path B | Path A |
|---|---|---|
| Primary: 3 + 3 jumps, advised view | 38 (20 control, 18 ACL) | 30 (16, 14) |
| Same participants: Path A's 30 | 30 | 30 (the same people) |
| At least 2 + 2 | 40 | 36 |
| At least 1 + 1, per-person means | 43 | 42 |
| Side view, 3 + 3 | 37 | 24 (21 women, 3 men) |

### J-D. Primary family: Path B, 38 participants, the six interpreted measurements

| Measurement | Mean Δ (95% CI) | Mean Δz (95% CI) | Median Δz (IQR) | Share that rose | Rank-biserial r | Wilcoxon p | Holm p |
|---|---|---|---|---|---|---|---|
| Jump height | −0.0077 (−0.0131, −0.0022) | −0.34 (−0.57, −0.11) | −0.24 (−0.74 to 0.23) | 0.32 | −0.47 | 0.010 | 0.063 |
| Countermovement depth | +0.0013 (−0.0067, 0.0093) | −0.01 (−0.35, 0.33) | 0.04 (−0.76 to 0.67) | 0.55 | 0.05 | 0.80 | 1.00 |
| Peak trunk lean, ° | +1.93 (0.30, 3.55) | +0.51 (0.09, 0.93) | 0.48 (−0.43 to 1.60) | 0.66 | 0.41 | 0.028 | 0.14 |
| Landing knee flexion, ° | +1.01 (−0.88, 2.89) | +0.10 (−0.28, 0.48) | 0.08 (−0.71 to 0.88) | 0.55 | 0.13 | 0.48 | 1.00 |
| RSI-mod | −0.0215 (−0.0435, 0.0005) | −0.54 (−0.93, −0.15) | −0.70 (−1.35 to 0.39) | 0.37 | −0.38 | 0.041 | 0.17 |
| Unweighting + braking duration, s | −0.005 (−0.049, 0.039) | +0.15 (−0.27, 0.56) | 0.17 (−0.30 to 0.68) | 0.61 | 0.15 | 0.42 | 1.00 |

**Hypothesis tests.** These six Holm-corrected Wilcoxon tests are the only hypothesis tests in Phase 4B. None is below 0.05 after correction.

**Detectability.** The positive control showed that this design detects injected shifts of −0.03 leg lengths in jump height and +5° in trunk lean every time. The observed shifts are about a quarter of the first and two fifths of the second.

**Medians.** Exact order-statistic intervals (96.6%) for the median Δ exclude 0 only for jump height: −0.0059 (−0.0152, −0.0010).

**Not interpreted** (failed Phase 4A.5 on both paths):

| Measurement | Mean Δ (95% CI) | Mean Δz (95% CI) |
|---|---|---|
| Flight time | −0.0047 s (−0.0120, 0.0026) | −0.14 (−0.41, 0.12) |
| Propulsion duration | +0.018 s (0.002, 0.034) | +0.37 (0.09, 0.65) |
| Left-right difference | −0.02 (−0.83, 0.79) | −0.02 (−0.31, 0.26) |

### J-D. Supporting samples: effect sizes and intervals only, no tests

**Change in units** (mean Δ, 95% CI) for the three measurements that moved:

| Sample | Path | n | Jump height | Trunk lean, ° | RSI-mod |
|---|---|---|---|---|---|
| Primary | B | 38 | −0.0077 (−0.0131, −0.0022) | 1.93 (0.30, 3.55) | −0.0215 (−0.0435, 0.0005) |
| Same participants | B | 30 | −0.0088 (−0.0136, −0.0040) | 1.93 (0.34, 3.52) | −0.0260 (−0.0515, −0.0005) |
| At least 2 + 2 | B | 40 | −0.0078 (−0.0130, −0.0026) | 1.98 (0.44, 3.53) | −0.0220 (−0.0436, −0.0005) |
| At least 1 + 1 | B | 43 | −0.0102 (−0.0159, −0.0045) | 1.35 (−0.29, 2.99) | −0.0243 (−0.0465, −0.0022) |
| Side view | B | 37 | −0.0070 (−0.0123, −0.0016) | 1.79 (0.30, 3.29) | −0.0254 (−0.0491, −0.0017) |
| Primary (= same participants) | A | 30 | −0.0080 (−0.0124, −0.0035) | 1.93 (0.34, 3.52) | −0.0215 (−0.0439, 0.0009) |
| At least 2 + 2 | A | 36 | −0.0077 (−0.0121, −0.0034) | 1.89 (0.28, 3.50) | −0.0191 (−0.0413, 0.0031) |
| At least 1 + 1 | A | 42 | −0.0081 (−0.0135, −0.0026) | 1.33 (−0.26, 2.92) | −0.0185 (−0.0398, 0.0028) |
| Side view | A | 24 | −0.0058 (−0.0110, −0.0006) | 0.70 (−0.77, 2.17) | −0.0168 (−0.0426, 0.0091) |

Countermovement depth, landing knee flexion and unweighting plus braking duration have intervals that include 0 in every sample on both paths.

**Δz** (mean, 95% CI), only for samples with 3 + 3 jumps, because the app's spread needs three values:

| Sample | Path | n | Jump height | Trunk lean | RSI-mod |
|---|---|---|---|---|---|
| Primary | B | 38 | −0.34 (−0.57, −0.11) | 0.51 (0.09, 0.93) | −0.54 (−0.93, −0.15) |
| Same participants | B | 30 | −0.39 (−0.62, −0.17) | 0.56 (0.18, 0.93) | −0.68 (−1.14, −0.23) |
| Side view | B | 37 | −0.32 (−0.55, −0.08) | 0.49 (0.08, 0.89) | −0.64 (−1.07, −0.20) |
| Primary | A | 30 | −0.42 (−0.66, −0.17) | 0.56 (0.18, 0.93) | −0.63 (−1.08, −0.18) |
| Side view | A | 24 | −0.33 (−0.64, −0.03) | 0.27 (−0.11, 0.65) | −0.61 (−1.18, −0.03) |

**Path B minus Path A, same 30 participants** (per-person difference in Δz, mean with 95% CI):

| Measurement | Difference (95% CI) |
|---|---|
| Jump height | +0.02 (−0.03, 0.08) |
| Countermovement depth | −0.13 (−0.24, −0.02) |
| Trunk lean | 0.00, identical on both paths |
| Landing knee flexion | −0.03 (−0.11, 0.05) |
| RSI-mod | −0.05 (−0.14, 0.04) |
| Unweighting + braking duration | −0.05 (−0.18, 0.08) |

For the shipped score's personal true-split rank, Path B minus Path A has median 0, mean +0.37, IQR −0.75 to 1.0 and range −7 to +8. A positive value means Path B separated less.

### J-A. Personal baseline: rank of the true split among the 20 splits (descriptive)

Rank 1 means the fresh jumps, used as the reference, separate the post-protocol jumps more than any other split. With no difference, the mean rank is 10.5 and about 5% of people are at rank 1. These are descriptive statistics, not p-values.

**Shipped score (S0):**

| Sample | Path | n | Mean rank (95% CI) | Median rank (exact interval) | IQR | At rank 1 (Wilson 95% CI) | Mean true-split score (95% CI) |
|---|---|---|---|---|---|---|---|
| Primary | B | 38 | 7.55 (5.55, 9.56) | 5.5 (3, 11; 96.6%) | 2 to 12.75 | 7/38 (0.09, 0.33) | 1.33 (1.18, 1.47) |
| Same participants | B | 30 | 7.83 (5.52, 10.15) | 6.0 (3, 11; 95.7%) | 2.25 to 13.75 | 5/30 (0.07, 0.34) | 1.30 (1.15, 1.45) |
| Side view | B | 37 | 8.00 (5.99, 10.01) | 6.0 (4, 10; 95.3%) | 2 to 12 | 6/37 (0.08, 0.31) | 1.29 (1.15, 1.43) |
| Primary (= same participants) | A | 30 | 7.47 (5.44, 9.49) | 6.0 (3, 11; 95.7%) | 3 to 11 | 5/30 (0.07, 0.34) | 1.32 (1.17, 1.47) |
| Side view | A | 24 | 8.92 (6.16, 11.67) | 7.5 (4, 13; 97.7%) | 3.75 to 13.25 | 3/24 (0.04, 0.31) | 1.20 (1.02, 1.39) |

**Distance from the middle.** The true split's score exceeded the median of the person's 20 splits for 60% to 68% of participants.

**Ablations.** For Path B's primary sample, the mean rank was:
- S-P2 (without flight time): 7.53;
- S-P3 (without the left-right difference): 7.71;
- S-P2P3 (without both): 7.42;
- S-valid (only the six validated measurements): 7.55.

Across every sample and path the ablation ranks run from 7.37 to 9.17, always close to S0 in the same sample. Four Wilson intervals for the same-participants share at rank 1 (ablation scores) carry the calibration label "approximate, 93% coverage". They are marked in `jump_fatigue/REPORT.md`.

### J-B. Population baseline: leave one participant out

**Shipped score (S0):**

| Sample | Path | n | Mean Δscore (95% CI) | Median Δscore | Mean rank (95% CI) | At rank 1 | Personal minus population rank, median (IQR) |
|---|---|---|---|---|---|---|---|
| Primary | B | 38 | −0.003 (−0.072, 0.066) | 0.015 | 10.37 (8.12, 12.61) | 0.08 | −2.0 (−6.75 to 2.0) |
| Same participants | B | 30 | −0.010 (−0.094, 0.073) | −0.025 | 11.23 (8.83, 13.64) | 0.10 | −1.5 (−8.75 to 2.75) |
| At least 2 + 2 | B | 40 | 0.005 (−0.062, 0.073) | 0.015 | (needs 3 + 3) | | |
| At least 1 + 1 | B | 43 | −0.022 (−0.093, 0.049) | −0.022 | (needs 3 + 3) | | |
| Side view | B | 37 | −0.020 (−0.097, 0.058) | −0.003 | 11.11 (9.04, 13.18) | 0.08 | −2.0 (−6.0 to 0.0) |
| Primary (= same participants) | A | 30 | −0.022 (−0.104, 0.061) | −0.024 | 11.87 (9.56, 14.17) | 0.07 | −2.5 (−8.0 to 0.75) |
| At least 2 + 2 | A | 36 | −0.004 (−0.074, 0.066) | −0.029 | | | |
| At least 1 + 1 | A | 42 | −0.018 (−0.091, 0.056) | −0.023 | | | |
| Side view | A | 24 | 0.006 (−0.114, 0.126) | 0.049 | 9.67 (6.85, 12.48) | 0.13 | +0.5 (−2.5 to 3.0) |

Every ablation gives the same picture: every Δscore interval includes 0, and mean ranks run from 9.67 to 12.40. A negative personal-minus-population rank means the personal baseline ranked the true split higher. The median was negative in every sample except Path A's side view (+0.5).

### J-C. Order probe, primary samples

The table compares the median absolute change from jump 1 to jump 3 within a block with the median absolute shift between blocks (mean post-protocol minus mean fresh).

| Path | Measurement | Within fresh | Within post-protocol | Between blocks |
|---|---|---|---|---|
| B | Jump height | 0.0170 | 0.0192 | 0.0126 |
| B | Countermovement depth | 0.0231 | 0.0236 | 0.0162 |
| B | Trunk lean, ° | 4.50 | 3.62 | 3.23 |
| B | Landing knee flexion, ° | 4.21 | 3.83 | 3.18 |
| B | RSI-mod | 0.054 | 0.068 | 0.056 |
| B | Unweighting + braking, s | 0.040 | 0.059 | 0.032 |
| B | S0 population-baseline score | 0.127 | 0.121 | 0.101 |
| A | Jump height | 0.0172 | 0.0203 | 0.0083 |
| A | Countermovement depth | 0.0230 | 0.0162 | 0.0122 |
| A | Trunk lean, ° | 6.02 | 3.62 | 3.25 |
| A | Landing knee flexion, ° | 3.57 | 3.79 | 3.03 |
| A | RSI-mod | 0.042 | 0.052 | 0.051 |
| A | Unweighting + braking, s | 0.048 | 0.059 | 0.045 |
| A | S0 population-baseline score | 0.149 | 0.107 | 0.082 |

**Reading the probe.** For every measurement, the shift between blocks was no larger than the jump-1-to-jump-3 change in at least one of the two blocks. Order, practice or ordinary variation could produce shifts of this size.

**Caveat.** A difference of two 3-jump means is less noisy than a difference of two single jumps, so the probe is a rough guide, as the protocol intended. The Δz version of this probe was prespecified but not produced (section 5).

### J-E. Direction checks, primary samples

| Path | n | App jump height vs centre-of-mass rise (lab reference) | vs force-plate height, same sign |
|---|---|---|---|
| B | 38 | Spearman 0.91, same sign 0.92 | 0.68 |
| A | 30 | Spearman 0.88, same sign 0.87 | 0.73 |

The force-plate heights come from `participant_log.xlsx`, whose provenance is unverified, so they are used for direction only.

### J-F. Between-person variability, primary samples (descriptive, no tests)

Per-person changes were widely spread. For every measurement and subgroup, the interquartile range of Δz included 0 except:
- Path B: trunk lean in the control group, and jump height in the ACL group;
- Path A: jump height, trunk lean and RSI-mod in the control group, and jump height and trunk lean in the men (n 9).

**Personal true-split rank (S0), median (IQR):**

| Subgroup | Path B | Path A |
|---|---|---|
| Control | 5.5 (1.8 to 11.0), n 20 | 5.5 (2.5 to 8.0), n 16 |
| ACL | 6.5 (3.0 to 15.0), n 18 | 10.5 (3.0 to 15.0), n 14 |
| Women | 5.5 (2.2 to 14.0), n 22 | 6.0 (3.0 to 11.0), n 21 |
| Men | 5.5 (2.0 to 11.0), n 16 | 5.0 (3.0 to 11.0), n 9 |

The full distributions, with ranges, are in `tables/jump_JF_between_person.csv`. No subgroup claims are made, and nothing is said about injury.

## 2. REHAB24-6: correct squats vs technique errors made on purpose

**Dataset.** Černek, Sedmidubsky and Budikova (2024), doi:10.5281/zenodo.13305826, CC BY-NC 4.0. These results are derived from it and are for non-commercial research only.

**What "incorrect" means.** A technique error performed on purpose. It is not fatigue.

**Setup.** The unchanged production pipeline and the shipped squat score, with shipped weights. 57% of that score's weight (3.25 of 5.75) sits on measurements that failed Phase 4A.5 or were never checked.

**No hypothesis tests.** The protocol runs none on this dataset.

### R-1. Separation by the shipped squat score

| Set | People; correct / incorrect reps | Personal AUC: mean (95% CI); median (exact interval) | Population AUC: mean (95% CI); median (exact interval) | Personal minus population, mean; median |
|---|---|---|---|---|
| Squats, 35° view (primary) | 9; 130 / 61 | 0.92 (0.83, 1.01); 0.95 (0.82, 1.00; 96.1%) | 0.63 (0.31, 0.94); 0.86 (0.09, 1.00; 96.1%) | 0.29; 0.00 |
| Squats without person 2 | 8; 109 / 60 | 0.92 (0.82, 1.02); 0.98 (0.67, 1.00; 99.2%) | 0.62 (0.30, 0.95); 0.71 (0.16, 1.00; 99.2%) | 0.30; 0.20 |
| Squats, side view | 9; 130 / 61 | 0.90 (0.79, 1.01); 0.95 (0.69, 1.00; 96.1%) | 0.65 (0.35, 0.95); 0.78 (0.09, 0.98; 96.1%) | 0.26; 0.02 |
| Split squats, side view (descriptive only) | 5; 53 / 53 | 0.91; 0.93 | 0.55; 0.59 | 0.37; 0.24 |

Upper limits above 1 come from the t interval, which does not respect the [0, 1] range; an AUC cannot exceed 1. For split squats the protocol interprets no interval.

**Per person, primary set** (correct / incorrect reps: personal AUC / population AUC):

| Person | Reps | Personal | Population |
|---|---|---|---|
| 1 | 21 / 6 | 0.95 | 0.48 |
| 2 | 21 / 1 (flag: one incorrect rep) | 0.90 | 0.95 |
| 3 | 10 / 10 | 1.00 | 0.08 |
| 4 | 17 / 3 | 0.67 | 0.86 |
| 5 | 10 / 10 | 1.00 | 1.00 |
| 6 | 10 / 11 | 1.00 | 1.00 |
| 7 | 10 / 10 | 1.00 | 0.19 |
| 8 | 13 / 5 | 0.81 | 0.09 |
| 9 | 18 / 5 | 0.94 | 0.98 |

Personal was higher for 4 people, equal for 2 and lower for 3.

### R-2. Which measurements differ (incorrect minus correct, divided by the person's pooled spread), primary set

| Measurement | Phase 4A.5 | Median (exact 96.1% interval) | Mean (95% CI) | People with a positive difference |
|---|---|---|---|---|
| Knee range of motion, camera side | passed | 1.23 (0.89, 1.61) | 1.15 (0.85, 1.44) | 9/9 |
| Hip range of motion | passed | 1.23 (0.94, 1.39) | 1.18 (0.97, 1.39) | 9/9 |
| Depth | passed | 1.13 (0.55, 1.69) | 1.11 (0.59, 1.62) | 8/9 |
| Peak trunk lean | passed | 1.20 (0.25, 1.60) | 0.88 (0.19, 1.57) | 8/9 |
| Knee range of motion, far side | not checked | 0.94 (0.65, 1.65) | 1.12 (0.69, 1.54) | 9/9 |
| Peak velocity | not checked | 1.43 (1.14, 1.55) | 1.36 (1.18, 1.53) | 9/9 |
| Rep duration | failed | −0.96 (−1.46, 0.41) | −0.63 (−1.31, 0.06) | 3/9 |
| Eccentric duration | not checked | −0.92 (−1.29, 0.39) | −0.59 (−1.23, 0.05) | 3/9 |
| Concentric duration | not checked | −0.24 (−1.50, 0.13) | −0.47 (−1.08, 0.14) | 2/9 |
| Left-right difference | failed | −0.36 (−1.39, 0.94) | −0.27 (−1.01, 0.46) | 4/9 |

Only the first four are interpreted.

### R-3. Sensitivity

**Without person 2** (8 people):
- The interpreted medians were 1.10 (knee), 1.13 (hip), 1.10 (depth) and 1.34 (trunk lean).
- With 8 people, the only exact interval for a median is the minimum-to-maximum range (99.2%). It excludes 0 for knee and hip range of motion, and includes 0 for depth (−0.10, 1.69) and trunk lean (−1.03, 1.67).
- The mean intervals exclude 0 for all four: depth 0.97 (0.50, 1.43), trunk lean 0.95 (0.17, 1.73).

**Side view** (camera angle only): all four interpreted medians have intervals excluding 0:
- knee 0.86 (0.15, 1.53);
- hip 1.20 (0.65, 1.42);
- depth 1.09 (0.56, 1.68);
- trunk lean 1.20 (0.15, 1.64).

The left-right difference changed sign: −0.36 in the 35° view, +0.02 in the side view.

### R-4. Split squats, descriptive only

The app finds correct split squats less often than incorrect ones (recall 0.72 vs 0.93), so these numbers describe a biased subset. Only peak trunk lean passed Phase 4A.5 for split squats, and its median difference was 0.72, with an approximate interval of −1.33 to 1.21 (calibrated coverage 93%).

The other medians, all from measurements that failed or were not checked:

| Measurement | Median |
|---|---|
| Depth | +1.16 |
| Step length | −1.21 |
| Hip range of motion | −1.03 |
| Recovery velocity | +1.31 |
| Knee range of motion | +0.96 and +1.16 |
| Durations | −0.57 to +0.24 |
| Left-right difference | −0.11 |

No interval is interpreted.

## 3. Null, inconsistent and unexpected findings

1. **No primary test was significant.** None of the six primary Holm-corrected tests reached 0.05.
2. **The population baseline failed on jumps.** It showed no separation in any sample, path or score.
3. **Within-block changes matched the between-block shift.** In the order probe, for every measurement on both paths, the jump-1-to-jump-3 change in at least one block was as large as the shift between blocks.
4. **Path B did not separate better than Path A.** On the same participants it was not better, and it gave a smaller countermovement-depth change.
5. **Force-plate direction agreement was modest.** The app's jump-height change had the same sign as the force-plate change for only 68% (Path B) and 73% (Path A) of participants. Agreement with the lab's centre-of-mass rise was 92% and 87%.
6. **Unweighting plus braking duration was inconsistent.** Its mean change was negative (−0.005 s) while its median change and mean Δz were positive. A few large values pull the mean.
7. **Trunk lean was the least robust of the three moving measurements.** Its jump change was not supported in the "at least 1+1" samples or in Path A's side view.
8. **The squat population baseline was inverted for three people** (AUC 0.08, 0.09, 0.19), and was near chance for a fourth (0.48).
9. **The squat personal baseline was lowest for person 4** (0.67, 3 incorrect reps). For persons 2, 4 and 9 the population baseline scored higher.
10. **Path A's ACL group had a weaker personal separation** (median rank 10.5) than its control group (5.5). On Path B the gap was smaller (6.5 vs 5.5). This is descriptive only, from 14 to 20 people per group.

## 4. Limitations

- **Order confound (jumps).** Fresh jumps were always recorded first. Every jump result describes changes after the protocol, which may come from fatigue, time, warm-up, practice or marker drift. The six jumps are not exchangeable, so the J-A and J-B ranks are descriptive, not p-values.
- **Blocks (REHAB24-6).** Correct and incorrect reps were also recorded in blocks, and the mistakes differ between people by design.
- **Small samples:**
  - 38 (Path B) or 30 (Path A) participants for jumps;
  - 9, 8 and 5 people for REHAB24-6;
  - one incorrect rep for person 2 and three for person 4.

  Intervals are wide. Exact median intervals cannot reach 95% with 5 people, and with 8 people only the 99.2% minimum-to-maximum interval exists.
- **Selection bias from missing jumps:**
  - Path A misses 20 of 247 advised-view trials, mostly among the highest jumps and more of the ACL group's fresh jumps than post-protocol ones.
  - Nine crouched-start trials are excluded on both paths.
  - The 1 + 1 samples rest on per-person means of fewer jumps.
- **Measurement uncertainty:**
  - flight time, propulsion duration and the left-right difference failed Phase 4A.5;
  - unweighting plus braking duration reads 0.13 s short;
  - Path A reads landing knee flexion after the landing peak;
  - 57% of the squat score's weight sits on failed or unchecked measurements;
  - the force-plate heights have unverified provenance.
- **Virtual camera, not a webcam.** Motion-capture markers projected into a virtual camera give clean, unoccluded landmarks. These results are a best case for BreakingPoint's measurement and scoring code. They say nothing about MediaPipe tracking, real webcams, lighting or clothing.
- **Not independent, not blinded:**
  - Path B, the S-valid ablation and the measurement checks were developed on these same datasets in Phase 4A.5;
  - the data and some reference outcomes were inspected before the protocols were frozen;
  - the shuffled-label development only kept the code from being tuned on the real comparison.
- **The production alert was not evaluated.** Three jumps per block is below the app's calibration minimum.
- **Interval calibration held the participants fixed.** It cannot check coverage when true effects differ between people.
- **Separate from HiPerGator.** These results are kept apart from the synthetic UF HiPerGator study. They do not change the app's settings or its public performance claims.

## 5. Notes on the generated reports, and two prespecified outputs that were not produced

None of these notes changes an analysis. All are visible in the frozen outputs.

1. **The Δz lines for the "at least" samples in `jump_fatigue/REPORT.md` repeat the primary samples.**
   - Δz needs three jumps per block, so in the "at least 2 + 2" and "at least 1 + 1" samples it exists only for the 3 + 3 participants: 38 on Path B, 30 on Path A.
   - The frozen report prints those Δz values with the label "uncalibrated", because the calibration did not cover Δz for those samples.
   - The protocol prespecified Δ in units for these samples. Those values, over all 40, 43, 36 and 42 participants, are in `summary.json` with calibrated 95% CIs, and are the ones reported in section 1.
2. **The order probe in Δz (J-C) was not produced.** The protocol asked for the order probe "in units and in Δz", but the frozen code computed it in units only.
3. **The median Δscore (J-B) has no interval.** The protocol asked for the mean and median Δscore with intervals, but the frozen v2 code computed an interval for the mean only (the calibration covered the mean only). The medians are reported without one.

   Items 2 and 3 were not computed after the run. On 2026-10-10 Adam decided to leave both as documented gaps, with no post-hoc calculations.
4. **Superseded v1 statistics in `rehab24_6/summary.json`.** The file also holds `personal_auc_v1_fold_averaged_superseded`, the superseded v1 personal AUC. It was kept by design for provenance; it is not interpreted. Its values (means 0.90 in every set) are listed in `tables/rehab_R1_auc.csv`, labelled as superseded.
5. **t intervals can pass 1.** Several mean-AUC t intervals have upper limits above 1 (section 2).
6. **Logged deviations from the frozen protocols:** t, exact order-statistic and Wilson intervals replace the bootstrap; Δz uses the symmetric spread; the REHAB24-6 personal AUC is fold-paired and the standardized differences use the pooled spread. All are in `research/protocols/phase4b_deviations.md`, entry 1, and were made before this run.
7. **`phase4b_deviations.md` is part of the v2 analysis freeze, so it is left unchanged.** Its statement that no analysis has used the real labels was true when it was frozen, before this run.

## 6. Reproducibility

**Execution.** `EXECUTION.json` records:
- the start and end times and the exit code;
- all 21 pre-run checks, all passed;
- the environment: Python 3.12.6, numpy 2.4.6, scipy 1.17.1, Node v24.16.0, vite-node 3.2.4, Windows 11;
- the SHA-256 of the per-person records (`data/processed/phase4b_actual/records.json`, git-ignored) and of every output.

**Pre-run checks.** These confirmed:
- HEAD equals the approved commit and `origin/redesign/breakaway`;
- both freeze files match their recorded SHA-256;
- every protocol, code and data file listed in the freezes matches;
- two files the run imports but neither freeze lists (`src/utils/stats.ts`, `shared/default_detector_config.json`) equal the commit;
- the working tree differed from HEAD only in another session's UI files, none of which the run imports.

**Inputs.** The 12 data files the run reads are listed with their SHA-256 in `phase4b_protocol_freeze.json`. `research/README.md` describes how to rebuild them from the two public datasets.

**Commands:**

```bash
python -I research/measurement/freeze.py verify-protocol
```

```bash
python -I research/phase4b/run.py verify
```

```bash
python -I -B research/results/phase4b/reproduce/export_tables.py
```

**Byte-exact files.** Every file in this folder is committed byte for byte (`.gitattributes`: `-text`), so `MANIFEST.sha256` and the output hashes in `EXECUTION.json` verify on any operating system:

```bash
cd research/results/phase4b && sha256sum -c MANIFEST.sha256
```

`run.py actual` now refuses to run, because this folder holds results. The real-label run happens once. The code's determinism was shown on shuffled labels: re-running the calibration harness gave byte-identical outputs.
