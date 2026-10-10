# Protocol v04 (final): exploratory comparison of fresh and post-protocol jumps

**Status: final, approved by Adam on 2026-10-09 together with the decisions on U1 to U10. Nothing in it has been run with the real condition labels.**

**Frozen with:**
- `phase4b_preanalysis_checks.md`
- the inclusion lists `phase4b_inclusion_v04.json`

Their SHA-256 values are in `phase4b_protocol_freeze.json`, committed before any outcome analysis. The analysis code is frozen separately, in `phase4b_analysis_freeze.json`, after shuffled-label development and before the single run with real labels. Any later change is a logged deviation.

Drafts v02 and v03 are kept for the record.

## What this is, and what it is not

**This is an exploratory offline motion-capture evaluation of fatigue-associated jump changes.** Motion capture is seen through a virtual camera and measured by BreakingPoint's own code.

**It is not:**
- **Independent validation.** The dataset, its lab references and the Phase 4A.5 measurement checks were inspected before this protocol was written. Path B and the "passing measurements only" ablation were shaped by Phase 4A.5 on these same data.
- **Fatigue validation.** All fresh jumps came before the protocol, so every result describes changes "after the protocol", not effects of fatigue.
- **A test of the production sequential alert.**
- **A measure of MediaPipe or webcam accuracy.**

Nothing here is combined with, or attributed to, the synthetic UF HiPerGator study, and no number goes into the app until Adam has reviewed it.

## Measurement paths

| Label | What it is | Role |
|---|---|---|
| **Path B: experimental timing pipeline** | Research-only P1: jump timing from landmarks filtered by a causal 2nd-order Butterworth at 6 Hz; angles from the app's One Euro filter. `dual_butter6` in `research/measurement/variants.ts`, frozen | **Primary.** It is not independent validation: P1 was chosen on this dataset. |
| **Path A: unchanged production pipeline** | The app's code exactly as shipped | Supporting comparison |

The production jump pipeline, the shipped feature weights and the shipped detector config are not changed.

## Samples

Samples are fixed in `phase4b_inclusion_v04.json` (checks, point 1).

- **Data-quality exclusions** (both paths): the 9 trials that start crouched.
- **A trial is used** by a path only if that path finds exactly one jump in it.
- **No exclusion** depends on any measurement value or score.

| Sample | Path B | Path A | Used for |
|---|---|---|---|
| Primary: 3 fresh + 3 post-protocol usable jumps, advised view (35°) | 38 | 30 | Primary (B), supporting (A) |
| Same participants: Path A's 30, measured by both paths | 30 | 30 | Comparing the paths without changing the sample |
| At least 2 + 2, advised view | 40 | 36 | Sensitivity |
| At least 1 + 1, advised view, per-person means | 43 | 42 | Sensitivity |
| Side view (0°), 3 + 3 | 37 | 24 (21 women, 3 men) | Camera-angle sensitivity only. Its make-up and selection are reported; no subgroup comparisons. |

## Measurements and scores

- **Interpreted measurements (6):**
  - jump height (hip rise), `jumpHeight`
  - countermovement depth, `countermovementDepth`
  - peak trunk lean, `trunkLean`
  - landing knee flexion, `landingKneeFlex` (on Path A it is read 0.37 to 0.87 s after contact, after the landing peak)
  - reactive strength index (modified), `rsiMod`
  - unweighting + braking duration, `eccentricDuration` (interpreted as within-person change only; it reads 0.13 s short)
- **Reported, not interpreted (3)**, because they failed the Phase 4A.5 agreement criteria on both paths: flight time `flightTime`, propulsion duration `concentricDuration`, and left-right difference `asymmetry`.

**Scores.** All scores use the app's baseline and score functions, unchanged and imported from `src/`, with the shipped detector config. Each ablation passes a shorter measurement list to those functions. Under the shipped `grouped_quality` weighting this is identical to setting the removed measurements' weight to 0. The shipped weights are not edited.

| Label | Measurements | Status |
|---|---|---|
| **S0** | All nine, shipped weights | The app's score as shipped |
| **S-P2** | Without flight time | Experimental ablation |
| **S-P3** | Without left-right difference | Experimental ablation |
| **S-P2P3** | Without both | Experimental ablation |
| **S-valid** | Only the six measurements that passed Phase 4A.5 | Experimental and exploratory: its selection used Phase 4A.5 results on this same dataset |

The ablations are research analyses, not proposed production scoring. The HiPerGator numbers are never attributed to them.

**The Form Change Score** is the app's raw score: the weighted root mean square of clipped z-scores. With three fresh jumps the in-control reference falls back to the shipped defaults, which only rescale the score, so ranks and comparisons are unchanged.

## Analyses to be executed

**How repeated jumps are handled.** Every summary is over participants. A participant's repeated jumps are first combined into that participant's own numbers; jumps are never pooled as independent observations. Intervals come from resampling participants with replacement: 2,000 resamples, percentile intervals, seed 20261009.

### J-D. Which measurements changed

- **Primary family:** Path B, primary sample (38), the 6 interpreted measurements.
- **Per participant, per measurement:**
  - Δ = mean of post-protocol jumps − mean of fresh jumps, in measurement units;
  - Δz = Δ divided by the app's own per-measurement spread for that person (`scale` from `featureBaseline` on the 3 fresh values, with the app's noise floors).
- **Reported for each measurement:**
  - n participants;
  - mean and median Δ and Δz;
  - bootstrap 95% CIs for the mean Δ and the mean Δz;
  - share of participants with Δ > 0;
  - two-sided Wilcoxon signed-rank test on Δ, with Holm correction across the six (the only hypothesis tests in this protocol, labelled exploratory);
  - matched-pairs rank-biserial correlation as the test's effect size.
- **Supporting, with effect sizes and CIs only (no p-values):**
  - the same for Path A's primary sample;
  - the same-participants sample on both paths, plus the per-participant paired difference in Δz (Path B − Path A) with its CI;
  - the at-least-2+2 and at-least-1+1 samples. Δ in units only, because the app's spread needs 3 fresh values;
  - the side view;
  - the 3 non-interpreted measurements, in a separate table labelled "not validated".

### J-A. Separation under a personal baseline (descriptive)

- **Samples and scores:** samples with 3 + 3 only (primary, same participants, side view), both paths, all five scores.
- **For each participant,** each of the 20 ways to split their six jumps into 3 reference + 3 comparison jumps is scored:
  1. Build the baseline from the 3 reference jumps.
  2. Score the 3 comparison jumps.
  3. Take their mean.
- **The true split** uses the fresh jumps as the reference. Its rank among the 20 is 1 for the highest mean; ties take the average rank. Also recorded: its mean score, and its distance from the median of the 20.
- **Reported across participants:** median rank, IQR, share at rank 1, and the mean true-split score with bootstrap CI.
- **These are descriptive separation statistics.** Because of the order confound they are not p-values and not evidence of a fatigue effect.

### J-B. Separation under a population baseline (descriptive)

- **Samples:** primary, same participants, 2 + 2, 1 + 1 and side view; both paths; all five scores.
- **For each participant:**
  - the baseline comes from all other participants' fresh jumps in the same sample and path (leave one participant out);
  - every one of their jumps is scored;
  - Δscore = mean post-protocol score − mean fresh score;
  - with 3 + 3, the rank of the true split among the 20 splits is also computed, as in J-A.
- **Reported across participants:** mean and median Δscore with bootstrap CI, and the rank summaries.
- **Personal against population:** the per-participant difference in true-split rank (J-A − J-B), described as a distribution.

### J-C. Order probe

- **Samples:** primary, both paths.
- **For each block,** the change from jump 1 to jump 3 (t3 − t1), in units and in Δz, for each of the 6 interpreted measurements and for the S0 population-baseline score.
- **Reported:** the median absolute within-block change, against the median absolute between-block Δ, to show how much order alone could explain.

### J-E. Direction checks (descriptive)

- **Samples:** primary, both paths.
- **Per participant:** Δ app jump height against Δ centre-of-mass rise from the lab reference. Reported: Spearman across participants and the share with the same sign.
- **Force-plate heights:** against the change in participant_log.xlsx force-plate jump height (post − pre), the share with the same sign. Those heights have unverified provenance and are used for direction only.

### J-F. Between-person variability (descriptive)

- **Samples:** primary, both paths.
- **Reported:** the distribution (median, IQR, range) of per-participant Δz for each interpreted measurement and of the S0 personal true-split rank, overall and by group and by sex.
- **No tests, and no performance claims for any subgroup.**

### Shown before any outcome

- missing trials by path, group and condition;
- the composition of each sample;
- the data-quality exclusions.

All of these come from the inclusion file.

## Design limits

1. **Order confound.** No exchangeability, so no permutation p-values for fatigue.
2. **Three jumps per block,** below the app's calibration minimum. The alert is not evaluated.
3. **Unilateral protocol, bilateral jumps.**
4. **Control vs ACL** is descriptive. Nothing is said about injury.
5. **Best-case motion-capture input** (checks, point 5).
6. **Path A is missing the highest jumps,** and in the ACL group more fresh jumps than post-protocol ones (checks, point 1).
7. **The same-participants comparison** separates the path from the sample, but not from the jumps Path A loses.

## Development and the single real run

The code is developed and verified on shuffled labels. Within each participant, the fresh and post-protocol labels are randomly reassigned among their usable jumps, keeping the counts. Seeds and verification results are recorded in `phase4b_analysis_freeze.json`.

**This is not a genuinely blinded study.** The datasets, some lab reference outcomes and the dataset's own force-plate pre and post heights were inspected before and during Phase 4A.5 (checks, point 7). Shuffled labels only prevent the code from being tuned on the real comparison.

**The real run happens once, after Adam's final approval.** The frozen code verifies every hash in both freeze files first. All results defined above are reported, whatever their direction.

## Outputs

`research/results/phase4b/jump_fatigue/`:
- `summary.json` and `REPORT.md`;
- per-participant tables of aggregate per-participant values (not per-trial raw data);
- figures, if any.

Every file states:
- the dataset and evaluation type ("exploratory offline motion-capture evaluation");
- the path and score labels;
- participants and jumps;
- the view;
- the protocol-freeze commit and the analysis-freeze hash;
- the limitations.
