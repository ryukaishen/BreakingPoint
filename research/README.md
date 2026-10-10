# Real-world evaluation (research module)

This folder holds BreakingPoint's evaluation on recorded human movement. It is separate from the original synthetic study (UF HiPerGator, October 2026, in `results/`), and its numbers are never combined with that study's.

Everything here is an **offline biomechanics evaluation**: motion-capture positions from public datasets are viewed by a virtual webcam and run through the app's own measurement code. It tests BreakingPoint's measurements, rep segmentation and scoring on real movement. It does **not** test how well MediaPipe tracks people in real video; that needs recorded camera footage, and is a separate, later step.

## Status

| Phase | What | State |
|---|---|---|
| 4A | Dataset integration: loaders, checks, landmark mapping, offline feature extraction | Done. Report: [`reports/phase4a_dataset_integration.md`](reports/phase4a_dataset_integration.md) |
| 4A.5 | Measurement validity: timing, smoothing alternatives, agreement with lab criteria, segmentation, missing data | Done. Report: [`reports/phase4a5_measurement_validity.md`](reports/phase4a5_measurement_validity.md) (tables: [`reports/phase4a5_tables.md`](reports/phase4a5_tables.md)) |
| 4B | Exploratory evaluation | Protocols v04 final and frozen ([`protocols/phase4b_protocol_freeze.json`](protocols/phase4b_protocol_freeze.json)): [`jump_fatigue_v04.md`](protocols/jump_fatigue_v04.md), [`rehab24_6_v04.md`](protocols/rehab24_6_v04.md), [`phase4b_preanalysis_checks.md`](protocols/phase4b_preanalysis_checks.md), inclusion lists [`phase4b_inclusion_v04.json`](protocols/phase4b_inclusion_v04.json). Analysis v2 frozen in [`protocols/phase4b_analysis_freeze_v2.json`](protocols/phase4b_analysis_freeze_v2.json) after the interval calibration ([`protocols/phase4b_deviations.md`](protocols/phase4b_deviations.md)); v1 kept for provenance. **Not run with real labels.** Drafts v02 and v03 kept for the record. |

## Datasets

| Dataset | Licence | Card |
|---|---|---|
| Fatigued and non-fatigued jump-landing motion capture (Calisti, Mohr, Federolf 2025), doi:10.6084/m9.figshare.28890545.v1 | CC BY 4.0 | [`datasets/jump_fatigue.md`](datasets/jump_fatigue.md) |
| REHAB24-6 (Černek, Sedmidubsky, Budikova 2024), doi:10.5281/zenodo.13305826 | CC BY-NC 4.0, non-commercial only | [`datasets/rehab24_6.md`](datasets/rehab24_6.md) |

How motion capture differs from the app's webcam measurements: [`datasets/measurement_differences.md`](datasets/measurement_differences.md).

## Layout

| Path | Contents |
|---|---|
| `adapters/prepare_data.py` | Verifies downloads against the published checksums and extracts the needed files into `data/external/` |
| `adapters/jump_fatigue.py`, `adapters/rehab24_6.py` | Loaders, with every assumption about the files written down |
| `adapters/landmarks.py` | Marker and joint mapping to MediaPipe landmarks, and the virtual webcam |
| `adapters/build_landmarks.py` | Writes 30 fps landmark streams per recording and view to `data/processed/landmarks/` |
| `evaluation/offlinePipeline.ts` | The app's frame path (smoothing, frame metrics, segmentation, rep measurements), imported from `src/`, for recorded streams. `tests/research_pipeline.test.ts` checks it gives exactly what the app gives. |
| `evaluation/extract_features.ts` | Runs every recording through it; writes `data/processed/features/` |
| `evaluation/integration_report.py` | The Phase 4A report |
| `measurement/` | Phase 4A.5: measurement streams and lab references (`build_streams.py`), experimental signal chains (`variants.ts`, research only), runs (`run_variants.ts`), analysis (`analyze.py`), Phase 4B inclusion lists (`inclusion.py`) |
| `phase4b/` | Phase 4B analysis (research only): scoring helpers over the app's own code (`scoring.ts`), inputs (`data.ts`), per-person records (`compute.ts`), statistics and reports (`stats.py`), shuffled-label interval calibration (`calibration.ts`, `calibration.py`) and the driver (`run.py`; the real-label run needs Adam's approval and both freezes) |
| `protocols/` | Evaluation protocols, fixed before any outcome is computed |
| `tests/` | Unit tests (`python -I -m unittest discover -s research/tests`) |
| `tools/make_shipped_parity_fixture.py` | Builds the parity fixture for the shipped detector config (`tests/parity_shipped.test.ts`) |

Raw and processed data live in `data/` and are never committed (see [`../data/README.md`](../data/README.md)).

## Reproduce

Python 3.12 with the packages in `requirements.txt`, and Node with this repository's dependencies installed (`npm install`; `vite-node` comes with `vitest`).

```bash
python -I research/adapters/prepare_data.py --jump-zip <path>/28890545.zip --rehab-dir <folder with 3d_joints.zip and Segmentation.csv>
python -I research/adapters/build_landmarks.py
npx vite-node research/evaluation/extract_features.ts
python -I research/evaluation/integration_report.py
python -I -m unittest discover -s research/tests

# Phase 4A.5 (measurement validity) and the Phase 4B inclusion lists
python -I research/measurement/build_streams.py
npx vite-node research/measurement/run_variants.ts
python -I research/measurement/analyze.py
python -I research/measurement/inclusion.py
python -I research/measurement/freeze.py verify-protocol
```
