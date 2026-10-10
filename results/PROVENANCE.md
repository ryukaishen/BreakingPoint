# Provenance of the validation results

This folder holds the results of two synthetic experiments. They used the same simulator and the same detector grid but were different runs, with different selected settings. Keep them apart. The machine-readable version of this page, with a SHA-256 checksum for every file, is [`provenance.json`](provenance.json). `tests/archive_integrity.test.ts` fails if any listed file changes.

Checksums are SHA-256 over the exact file bytes. Nothing is normalised. [`.gitattributes`](../.gitattributes) turns off line-ending conversion for these files, so every checkout on every operating system has the same bytes.

## 1. Synthetic Validation | UF HiPerGator | October 2026 (the original study)

This is the study the app's detector settings come from. Its files sit at the top of `results/` and in `public/lab/figures/`. They are unchanged since the run.

| | |
|---|---|
| What it is | Monte Carlo validation of the detector on simulated athlete sessions built from squat-like movement features. No real athletes and no video. |
| Report generated | 2026-10-04 11:16:01 (`VALIDATION_REPORT.md`) |
| Cluster | UF HiPerGator, Slurm account and QOS `ai-workshop` (from the `#SBATCH` lines in `hpc/sweep.slurm` and `hpc/finalize.slurm`; the job export has no account column) |
| Sweep job | 44695919, 20 array tasks, all COMPLETED, 8 CPUs each, 30 to 59 s elapsed per task (981 s in total, 7,848 allocated core-seconds) |
| Finalize job | 44695920, COMPLETED, 8 CPUs, 37 s elapsed |
| Sessions | 100,000 simulated: 50,000 to select the settings, 50,000 held out to report performance |
| Configurations | 25,280 (5,056 detector settings × 5 score variants) |
| Seed and grid | base seed 42, 20 shards, full grid, grid hash `907e0ee8d7abf95c` |
| Selected settings | `ewma\|a=0.4\|bp=2\|w=1\|m=0\|clip=2.5` |
| Commits | results added in `20ae978`; config copy and docs in `a30db5e` |

Files: `VALIDATION_REPORT.md`, `breakingpoint_detector_config.json` (and its byte-identical copy `public/breakingpoint_detector_config.json`, which the app loads), `hipergator_jobs.txt`, and the 11 figures in `figures/` as PNG and PDF (the PNGs are also in `public/lab/figures/`).

### What was not saved

Access to the allocation ended before these files were copied off the cluster:

- the run's per-configuration CSVs (`summary`, `config_results`, `scenario_results`, `robustness_results`, `ablation_results`)
- the 20 sweep shards
- the Slurm stdout and stderr logs
- job start and end times, and the account column, in the job export

The report, figures, exported settings and job records are the original outputs, and they remain valid. The gap limits re-analysis: per-configuration numbers from this run cannot be re-checked without re-running the sweep. No replacement CSVs have been made, and none should be presented as outputs of this run.

### Corrections to the report (the report itself is left as generated)

- **"Sweep compute: 564 CPU-process seconds across shards".** This number adds up the wall-clock time each shard measured inside Python (`time.time()` in `lab/breakingpoint_lab/experiment.py`). It is not CPU time. The Slurm record above is the better measure.
- **"Finalize stage took 33s".** That times the Python finalize step. Slurm's 37 s covers the whole job. Both are right for what they measure.
- **89.6% vs 89.8% detection.** 89.6% is the held-out evaluation split. 89.8% is the personal-baseline row of the separate personal-vs-population comparison, which ran on its own 20,000-session simulated set (the `EVAL_SESSIONS` default in `hpc/finalize.slurm`, also printed under the figure). They come from different sets; neither is a typo.
- **Scenario C, "Gradual fatigue drift".** This is a simulated gradual change in movement features. The simulator does not model physiological fatigue.

### Scope

The simulator generated squat-like feature sessions only. The selected settings are also used for the jump and lunge protocols, but those movements were not simulated. Nothing here was measured on real athletes or real camera footage.

## 2. Earlier local run, 4 October 2026 (superseded)

`archive/2026-10-04_local_50k/` holds the five CSVs from a smaller run on a local computer, made a few hours before the HiPerGator study. They used to sit at the top of `results/` next to the HiPerGator report, which made them look like its outputs. They were moved with `git mv` on 2026-10-09, so their contents and history are unchanged.

| | |
|---|---|
| Report generated | 2026-10-04 01:39:36 (original report: `git show a8b8bf4:results/VALIDATION_REPORT.md`) |
| Sessions | 50,000 (25,000 selection, 25,000 held out), 1 shard, seed 42 |
| Configurations | 25,280 |
| Selected settings | `ewma\|a=0.4\|bp=2\|w=1.5\|m=2\|clip=2.5`: a warning threshold of 1.5 and a 2-rep persistence rule, both different from the HiPerGator selection |
| Recorded sweep time | 358.9 s of summed wall-clock time (labelled "CPU-process seconds" in that run's report) |

Do not quote these numbers as HiPerGator results. Its single shard file (`shards/shard_00000.npz`) exists only as an untracked local file.

## Future runs

Lab runs started with `hpc/run_experiment.py` or `hpc/merge_results.py` now write to `results/runs/<run-name>/`, and they refuse to write into this folder's archived files or into `public/`. A new config reaches the app only with an explicit `--install`. Results from the real-world evaluation go to their own folders (for example `results/real_data_v02/`) and are never combined with these synthetic numbers.
