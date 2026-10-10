# Protocol (draft): rep segmentation and correct vs incorrect form, REHAB24-6

**Status: DRAFT, awaiting approval. Nothing in this protocol has been run.** Once approved, its SHA-256 is recorded in every result file, and changes after that point are listed as deviations.

## Questions

1. How well does the app's rep segmentation find the annotated repetitions of squats and lunges, measured from motion capture seen by a virtual camera?
2. Scored against a person's own correct reps, do their deliberately incorrect reps get higher Form Change Scores than their held-out correct reps?

This is an **exploratory offline biomechanics evaluation**. "Incorrect" means a technique error performed on purpose. **It is not fatigue, and nothing here says anything about fatigue.** It is not a measure of webcam or MediaPipe accuracy.

## Data (from Phase 4A)

- **Squats (exercise 6):** the app's squat. 9 people, 195 reps (134 correct, 61 incorrect). Primary view: 35 degrees oblique; side view as sensitivity.
- **Lunges (exercise 5):** an in-place split squat, only a partial match to the app's forward lunge. 8 people, 174 reps (78 correct, 96 incorrect). Primary view: side; oblique as sensitivity. Lunge results are reported separately, with that caveat on every one.
- **Excluded:** reps flagged with motion-capture errors (4 squats), reported in counts.
- Unit of analysis: the person. Every summary gives people and reps.

## 1. Segmentation

- **Matching.** A found rep and an annotated rep match if their time intervals overlap with intersection over union of at least 0.5. Matching is one-to-one: greedy by highest IoU within each video.
- **Reported per exercise and view:**
  - count error per video
  - precision, recall and F1 of the matches
  - start and end boundary errors in seconds (median and IQR)
  - recall split by correct and incorrect reps, as a descriptive breakdown
- **Expected limits (from 4A):** lunges that run into each other without the hip returning near standing height are not separated by the app's segmenter. That's a mismatch between the exercise and the app's lunge, and it is reported as such.

## 2. Correct vs incorrect

- **Measurements:** the app's rep measurements for annotated reps that the segmenter found (matched as above). Reps it missed are counted and reported, not imputed.
- **Personal baseline:** for each person and exercise, each correct rep in turn is held out. The baseline is built from that person's other correct reps with the app's per-measurement rule (at least 3 values). The held-out correct rep and every incorrect rep are then scored with the app's Form Change Score, and the scores averaged over folds.
- **Population baseline:** the same scoring, with the baseline built from all *other* people's correct reps (leave one person out).
- **Reported:**
  - per person, the AUC of Form Change Score for incorrect vs held-out correct reps
  - the across-person median, with person-clustered bootstrap 95% intervals
  - the same under the population baseline, side by side
  - which measurements differ most between incorrect and correct reps (within-person standardized differences)
- **Limits:**
  - Mistakes differ between people by design.
  - Some people have few incorrect reps.
  - Incorrect and correct reps come in blocks, so order and time are confounded with correctness, as with the jump data.
  - A higher score means "more different from this person's correct reps", never "worse" in general.

## Outputs

`results/real_data_v02/rehab24_6/`: `summary.json`, `REPORT.md`, figures, aggregate tables only. REHAB24-6 is CC BY-NC 4.0, so these results are for non-commercial research use. Every file states its dataset, evaluation type, people, reps, view, method, protocol hash and limitations. Nothing is added to the app until you have reviewed the results. Nothing is combined with the synthetic HiPerGator numbers.
