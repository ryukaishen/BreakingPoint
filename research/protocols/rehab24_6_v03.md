# Protocol (draft v03): correct vs incorrect form, REHAB24-6

**Status: DRAFT, awaiting approval. Nothing in this protocol has been run.** It replaces draft v02 (`rehab24_6_v02.md`, kept unchanged for the record) after the Phase 4A.5 checks (`research/reports/phase4a5_measurement_validity.md`). Once approved, its SHA-256 is recorded in every result file, and later changes are listed as deviations.

## What changed from v02, and why

| Change | Reason (Phase 4A.5) |
|---|---|
| Segmentation is no longer a 4B question | Phase 4A.5 measured it (precision, recall, F1, boundary errors, per person, with jitter); its results are descriptive and are not repeated here |
| Found reps are linked to annotated reps when at least half of the found rep lies inside the annotated one, not by IoU >= 0.5 | REHAB24-6 annotations span the whole repetition including the pause before and after it; the app's rep starts once the hips have dropped 6% of leg length. For squats every rep is found with exact counts, yet IoU >= 0.5 rejects a quarter of them only because of that convention |
| Squats are the only primary analysis; split squats become a secondary, descriptive analysis | The app's lunge rule misses split-squat reps that do not return near standing, and it misses correct reps (recall 0.72) far more often than incorrect ones (0.93), so the reps left for a "correct" baseline are a biased subset |
| Only measurements that follow the 3D skeleton within a person are interpreted | Four of the squat measurements do; rep duration and the left-right difference do not (table below) |

## Questions

1. Scored against a person's own correct squats, do their deliberately incorrect squats get higher Form Change Scores than their held-out correct squats?
2. Which of the app's squat measurements differ most between a person's incorrect and correct reps?

This is an **exploratory offline biomechanics evaluation**. "Incorrect" means a technique error performed on purpose. **It is not fatigue, and nothing here says anything about fatigue.** It is not a measure of webcam or MediaPipe accuracy.

## Data

- **Squats (exercise 6), primary:**
  - 9 people, 191 annotated reps after excluding 4 flagged with motion-capture errors.
  - View: 35° oblique, 3 m, as the app advises. The side view is a sensitivity analysis.
  - All 191 reps are found by the app's segmenter in Phase 4A.5, in both views and under every tested jitter level, so no rep is missing.
- **Split squats (exercise 5), secondary and descriptive only:**
  - Side view, as the app advises for lunges.
  - The app finds 145 of 174 annotated reps: recall 0.83, with no found rep outside an annotation.
  - Reported with the recall gap between correct and incorrect reps stated next to every number.
- **Unit of analysis:** the person. Every summary gives people and reps.

## Measurements

The squat checks against the 3D skeleton, in the advised view with the app as shipped (report, section 7), decide what is interpreted. The rule is the same as for jumps: a within-person correlation of at least 0.70, with a lower 95% bound of at least 0.50.

| Squat measurement | Within-person r [95% CI] | Status for 4B |
|---|---|---|
| Peak trunk lean | 0.987 [0.977, 0.994] | Interpreted |
| Depth | 0.992 [0.981, 0.996] | Interpreted |
| Hip range of motion | 0.84 [0.667, 0.927] | Interpreted |
| Knee range of motion, camera side | 0.825 [0.737, 0.924] | Interpreted |
| Rep duration | 0.42 [0.08, 0.94] | Reported, not interpreted. The criterion is the app's own rep rule applied to the 3D hip height with a fixed standing level, so part of the disagreement may lie in the criterion. |
| Left-right difference | 0.03 [-0.19, 0.26] | Reported, not interpreted |
| Knee range of motion, far side; eccentric and concentric duration; peak velocity | not checked | Reported, not interpreted |

For split squats only peak trunk lean passes (0.973). Knee range of motion (0.665), depth (0.666) and hip range of motion (0.677) do not. This is a further reason the lunge analysis is descriptive only.

## Analysis

- **Personal baseline:** for each person, each correct rep in turn is held out. The baseline is built from that person's other correct reps with the app's per-measurement rule (at least 3 values). The held-out correct rep and every incorrect rep are scored with the app's Form Change Score, and the scores are averaged over folds.
- **Population baseline:** the same scoring, with the baseline built from all other people's correct reps (leave one person out).
- **Both scores:**
  - the app's full score;
  - the score restricted to the interpreted measurements, with the app's weights renormalised.
- **Reported:**
  - per-person AUC for incorrect vs held-out correct reps;
  - across-person median, with person-clustered bootstrap 95% intervals;
  - personal and population side by side;
  - within-person standardized differences per measurement.
- **Limits:**
  - mistakes differ between people by design;
  - some people have few incorrect reps;
  - correct and incorrect reps come in blocks, so order and time are confounded with correctness;
  - a higher score means "more different from this person's correct reps", never "worse" in general.

## Outputs

`results/real_data_v03/rehab24_6/`:

- `summary.json`, `REPORT.md`, figures, and aggregate tables only.
- REHAB24-6 is CC BY-NC 4.0, so these results are for non-commercial research use.

Every file states:

- dataset and evaluation type;
- people and reps;
- view and method;
- protocol hash and limitations.

Nothing is added to the app until Adam has reviewed the results. Nothing is combined with the synthetic HiPerGator numbers.
