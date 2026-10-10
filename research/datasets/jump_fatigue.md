# Dataset card: fatigued and non-fatigued jump-landing motion capture

| | |
|---|---|
| Title | Motion capture data of six jump-landings, fatigued and non-fatigued, after anterior cruciate ligament injury |
| Authors | Maité Calisti, Maurice Mohr, Peter Federolf (University of Innsbruck) |
| Data | figshare, doi:[10.6084/m9.figshare.28890545.v1](https://doi.org/10.6084/m9.figshare.28890545.v1), published 2025-07-25 |
| Paper | Scientific Data (2025), doi:10.1038/s41597-025-05934-5 |
| Licence | CC BY 4.0. Cite the dataset and the paper. Raw files are kept out of this repository because of their size (6.7 GB). |
| Used here | Bilateral countermovement jumps only (`Kinematic_data/Joint_angles/CMJ.mat`, field `CMJ_bil`), plus `labeling_CMJ.xlsx` and `participant_log.xlsx` |
| Checksums | Verified against the MD5 values figshare publishes (`published_checksums.json`) by `research/adapters/prepare_data.py` |

## What the files contain (verified 2026-10-09)

- **Participants.** 43: 22 healthy controls and 21 after ACL injury. sub05 was excluded by the authors, and its cell in CMJ.mat is empty. Participant IDs are sub01 to sub44.
- **Trials.** Each participant has three non-fatigued (`CMJ_t1` to `CMJ_t3`) and three fatigued (`f_CMJ_t1` to `f_CMJ_t3`) bilateral jumps, 256 with data in total. sub44's third trial in each condition is empty; its spreadsheet row says "no c3d file; pain reported". Each trial is one jump, recorded and trimmed separately; lengths run from 2.2 to 8.7 s. Every trial starts with the participant standing still.
- **Sampling.** 250 Hz for all trials (marker `time` steps of 0.004 s). The paper reports force plates at 1000 Hz, resampled to 250 Hz.
- **Units and axes.** Marker positions are in millimetres, y vertical (up), x towards the participant's left, z forward. Centre of mass in metres. `Joint_Angles` has 44 OpenSim coordinates (labels in `IK_column_labels.xlsx`; column 1 is time); angles are in degrees with knee flexion positive, translations in metres. The OpenSim model is a modified Catelli model with knee ab/adduction and rotation added.
- **Contact.** `IC_K` and `IC_A` are 1-based MATLAB frame numbers of initial contact. They agree within 12 frames in 255 of 256 trials (sub39_CMJ_t3 differs by 250 frames). `IC_A` matches touchdown seen in the foot markers within about 10 ms; the paper defines contact as vertical force above 20 N.
- **Labels.** `labeling_CMJ.xlsx` has one row per trial, coded 0 = non-fatigued, 1 = fatigued, in the same order as the trials in CMJ.mat. **Group is coded in opposite ways in the two spreadsheets:** `labeling_CMJ.xlsx` uses 1 = control, 2 = ACL; `participant_log.xlsx` uses 1 = ACL, 2 = control. After decoding, every participant's group agrees (`load_subjects` checks this). `participant_log.xlsx` also gives leg length, the jump heights used for the fatigue criterion, and Borg ratings; some participant IDs have trailing spaces.

## Fatigue protocol (from the paper)

The fatiguing exercises were **single-leg** squats and step-ups on one leg (the "fatigued leg" column; for the ACL group, the injured leg). Fatigue was declared at a 20% drop in maximal jump height, or a 10% drop with a Borg CR10 rating above 5. **All non-fatigued jumps were recorded before the fatigue protocol and all fatigued jumps after it**, in a random order of jump tasks, with the fatigue protocol repeated after every two tasks.

## Consequences for this project

- Condition is confounded with order and time. Any difference between non-fatigued and fatigued jumps can come from fatigue, warm-up, learning, sweat-affected markers or time since the fatigue sets.
- Three fresh jumps per person (two for sub44) is below BreakingPoint's 4-rep calibration minimum, and the jumps were not performed as one continuous set. The app's full calibration and alert sequence cannot run on these data.
- The fatigue was unilateral, while the jumps analysed here are bilateral.
- There is no within-trial fatigue onset to detect: whole trials are labelled.
