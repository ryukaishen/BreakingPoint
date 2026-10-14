# Third-party components, datasets and licences

The [MIT License](LICENSE) covers the original code and documentation in this repository. It does not cover the components and dataset-derived files below, which keep their own terms.

## Shipped with the web app

These are not stored in git. `npm install` fetches them, and the build copies them into the deployed site.

| Component | Source | Licence |
|---|---|---|
| MediaPipe Tasks Vision runtime (JS and WASM), `@mediapipe/tasks-vision` 0.10.35 | Google | Apache License 2.0 |
| Pose Landmarker (full) model, `pose_landmarker_full.task` | Google, MediaPipe model card "BlazePose GHUM 3D" | Apache License 2.0, as stated on the [model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf) |
| Mona Sans variable font, `@fontsource-variable/mona-sans` | The Mona Sans Project Authors (GitHub) | SIL Open Font License 1.1 |
| Anybody variable font, `@fontsource-variable/anybody` | The Anybody Project Authors (Etcetera Type Co.) | SIL Open Font License 1.1 |
| Barlow Condensed font (SemiBold, Bold), `@fontsource/barlow-condensed` | The Barlow Project Authors | SIL Open Font License 1.1 |
| Inter variable font, `@fontsource-variable/inter` | The Inter Project Authors | SIL Open Font License 1.1 |
| JetBrains Mono variable font, `@fontsource-variable/jetbrains-mono` | The JetBrains Mono Project Authors | SIL Open Font License 1.1 |
| React and React DOM | Meta Platforms, Inc. and affiliates | MIT |

The model card lists "fitness and repetition counting" among the model's intended uses, and rules out surveillance and identity recognition. BreakingPoint uses it only on the device, for one person in frame.

## Vendored in the repository

| Path | Source | Licence |
|---|---|---|
| `.claude/skills/web-interface-audit/vendor/vercel-web-interface-guidelines/` | Vercel Labs, web interface guidelines | MIT (its `LICENSE` file is kept alongside) |

## Datasets

Neither dataset is redistributed here. `research/adapters/prepare_data.py` reads copies you download yourself and verifies them against the published checksums.

### Jump-landing motion capture (Calisti, Mohr and Federolf 2025)

- Source: Maité Calisti, Maurice Mohr and Peter Federolf, "Motion capture data of six jump-landing, fatigued and non-fatigued, after anterior cruciate ligament injury", figshare, doi:[10.6084/m9.figshare.28890545.v1](https://doi.org/10.6084/m9.figshare.28890545.v1). Paper: Scientific Data (2025), doi:10.1038/s41597-025-05934-5.
- Licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Reuse and adaptation are allowed with attribution.
- Derived files in this repository: per-participant and aggregate statistics in `research/results/phase4b/jump_fatigue/` and `research/results/phase4b/tables/jump_*.csv`, summary numbers in `research/reports/`, and trial identifiers and counts in `research/protocols/phase4b_inclusion_v04.json`. They are shared with the attribution above.

### REHAB24-6 (Černek, Sedmidubsky and Budikova 2024)

- Source: A. Černek, J. Sedmidubsky and P. Budikova, "REHAB24-6: Physical Therapy Dataset for Analyzing Pose Estimation Methods", 17th International Conference on Similarity Search and Applications (SISAP), Springer, 2024. Data: Zenodo, doi:[10.5281/zenodo.13305826](https://doi.org/10.5281/zenodo.13305826).
- Licence: [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/). The Zenodo record adds that the dataset is "for academic or non-profit organization noncommercial research use only", asks that publications cite the paper above, and directs commercial enquiries to the authors.
- Derived files in this repository: per-person and aggregate statistics in `research/results/phase4b/rehab24_6/` and `research/results/phase4b/tables/rehab_*.csv`, summary numbers in `research/reports/`, and rep identifiers and counts in `research/protocols/phase4b_inclusion_v04.json`. These files are not under the MIT License. Treat them as covered by the dataset's terms: non-commercial academic research use, with attribution.
- The deployed app contains no numbers derived from REHAB24-6.

## Open licensing questions (flagged for review, not settled here)

1. Whether aggregate statistics computed from REHAB24-6 (AUCs, standardized differences, counts) count as adapted material under CC BY-NC 4.0 is not settled. Facts and statistics may fall outside copyright. This repository does not rely on that and treats them conservatively, as above.
2. The REHAB24-6 record limits use to "academic or non-profit organization noncommercial research". This is a student project and is not sold, but it is also shown publicly as a portfolio piece. Whether that fits the wording should be confirmed, for example with the dataset authors, before the derived files are presented more widely.
3. The pose model's licence is taken from Google's model card linked above. If Google publishes different terms for a specific model file, those terms apply to that file.
