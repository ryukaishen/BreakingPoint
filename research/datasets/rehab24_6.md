# Dataset card: REHAB24-6

| | |
|---|---|
| Title | REHAB24-6: A multi-modal dataset of physical rehabilitation exercises |
| Authors | Andrej Černek, Jan Sedmidubsky, Petra Budikova |
| Data | Zenodo, doi:[10.5281/zenodo.13305826](https://doi.org/10.5281/zenodo.13305826), published 2024-08-28 |
| Paper | SISAP 2024 (Springer) |
| Licence | **CC BY-NC 4.0: non-commercial research only.** Cite the paper. Neither the data nor anything derived from them may be used commercially; raw files stay out of this repository. |
| Used here | `3d_joints.zip` (30 fps files), `Segmentation.csv`, `Segmentation.txt`, `joints_names.txt` |
| Not downloaded | `videos.zip` (2.7 GB, real RGB footage), `2d_joints.zip`, `2d_markers.zip`, `3d_markers.zip`. The videos are the natural input for a later end-to-end evaluation with MediaPipe. |
| Checksums | Verified against the MD5 values Zenodo publishes (`published_checksums.json`) |

## What the files contain (verified 2026-10-09)

- **People and exercises.** 10 people, 65 videos, 1,072 annotated repetitions over six exercises: 1 arm abduction (178 reps), 2 arm VW (208), 3 push-ups with hands on a table (107), 4 leg abduction (210), 5 leg lunge (174), 6 squat (195).
- **3D joints.** Arrays of shape (frames, 26, 4): homogeneous coordinates (x, y, z, 1) of a 26-joint OptiTrack Motive skeleton, at 30 fps (a 120 fps version also exists). **Units are metres** (thigh and shank about 0.45 m, head about 1.6 m up), y is up. The dataset page says "virtual centimetres"; the data are in metres.
- **Annotations.** `Segmentation.csv` (semicolon-separated) has, per rep: video, rep number, exercise, person, first and last frame, the person's orientation to camera 17 (front, half-profile, profile), a motion-capture error flag, a subtype (which arm or leg), and correctness (1 correct, 0 incorrect). Frame numbers are treated as 1-based: one annotation (PM_117a) ends exactly at the array length.
- **Correctness.** A physiotherapist instructed each person to perform at least five correct and five incorrect reps, with different mistakes per person. **"Incorrect" means a deliberate technique error. It is not fatigue.**
- **Orientation.** In 35 videos people turn partway through, typically ten reps facing camera 17 and ten half-profile; the 3D data show turns of about 47 to 61 degrees.

## How the exercises map to BreakingPoint

| Exercise | BreakingPoint movement | Match |
|---|---|---|
| 6 squat | bodyweight squat | Same movement. 9 videos, 9 people, 195 reps (134 correct, 61 incorrect), 4 with motion-capture errors. |
| 5 leg lunge | forward lunge (beta) | Partial. The exercise is an in-place split squat ("pushing a knee of the back leg down while keeping a right angle on the front knee"); the app's lunge steps forward and back each rep. 9 videos, 8 people, 174 reps (78 correct, 96 incorrect). |
| 1 to 4 | none | Not processed |
