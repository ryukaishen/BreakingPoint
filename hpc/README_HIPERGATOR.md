# BreakingPoint Lab on UF HiPerGator

BreakingPoint has two halves:

| | **BreakingPoint Edge** | **BreakingPoint Lab** |
|---|---|---|
| What | Real-time browser app (pose → features → drift → detector) | Offline Monte-Carlo backtest of the *same* detector |
| Where | Athlete's laptop / phone, fully on-device | UF HiPerGator (Slurm array, CPU only) — or any laptop at small scale |
| Output | Live movement state, explanations, session report | a run folder `results/runs/<run-name>/` with the exported config, report, figures and CSVs |

The Lab simulates large numbers of individualized athlete sessions with **known** change points,
sweeps the detector's hyper-parameters (EWMA α, CUSUM k/h, warning / BreakingPoint thresholds,
persistence, outlier clipping, feature weighting, missing-feature handling, detector family),
and selects the operating configuration with a transparent rule on a selection split, reporting
performance on a held-out split. The exported JSON is loaded by the web app at startup, so the
HPC experiment directly sets the live detector's parameters.

No GPU is needed. The workload is embarrassingly parallel numpy on CPUs.

> **The original study is archived.** The October 2026 HiPerGator run (jobs 44695919 and 44695920) is kept
> unchanged at the top of `results/`, with checksums and known gaps in [`results/PROVENANCE.md`](../results/PROVENANCE.md).
> New runs never write there: every run gets its own folder `results/runs/<run-name>/`, and the app's
> detector config in `public/` changes only when you ask for it with `--install` (or `INSTALL=1`).
> The deployed app does not need HiPerGator; it ships the exported config.

---

## 0. TL;DR

```bash
# on a HiPerGator login node, inside your copy of the repo
bash hpc/setup_env.sh            # one time (~1 min): venv with numpy + matplotlib
RUN_NAME=hpg-test bash hpc/submit_all.sh   # 20 array tasks x 5,000 = 100,000 sessions, then merge
squeue -u $USER                            # watch it
cat results/runs/hpg-test/VALIDATION_REPORT.md   # when the finalize job is done
```

Then copy the run folder back to your laptop (section 6). Nothing in `results/` outside `runs/`, and nothing in
`public/`, is touched unless you export `INSTALL=1`.

---

## 1. Copy the repository to HiPerGator

Use your blue storage (home quotas are small). Replace `<gatorlink>` with your username.

```bash
# from your laptop, in the repo's parent folder (node_modules/ is not needed on the cluster)
rsync -av --exclude node_modules --exclude dist --exclude 'public/models' --exclude 'public/mediapipe' \
  ./breakingpoint/ <gatorlink>@hpg.rc.ufl.edu:/blue/ai-workshop/<gatorlink>/breakingpoint/
```

or, if the repo is on GitHub:

```bash
ssh <gatorlink>@hpg.rc.ufl.edu
cd /blue/ai-workshop/$USER        # or your group's blue directory
git clone <your-repo-url> breakingpoint && cd breakingpoint
```

> If `/blue/ai-workshop` does not exist for your account, use the blue directory of whichever group
> you belong to (`ls /blue`), or your home directory for small runs.

## 2. One-time Python environment

```bash
cd /blue/ai-workshop/$USER/breakingpoint
bash hpc/setup_env.sh
```

`setup_env.sh` loads the cluster's Python module (`module load python`), creates `.venv-hpg/`
with `numpy` and `matplotlib` (see `hpc/requirements.txt`), and creates `hpc/logs/`.
`hpc/env.sh` (sourced by every Slurm script) activates it automatically.

Quick smoke test (takes ~10 seconds; run it in a short interactive session rather than on the login node):

```bash
srun --account=ai-workshop --qos=ai-workshop --cpus-per-task=2 --mem=4gb --time=00:15:00 --pty bash -i
source hpc/env.sh
python hpc/run_experiment.py --sessions 500 --seed 1 --grid quick --workers 2 --run-name smoke
exit
```

## 3. Check what the `ai-workshop` allocation allows

```bash
sacctmgr show assoc user=$USER format=account%20,qos%40   # accounts / QOS you can use
showQos ai-workshop                                        # UFRC helper: QOS limits
slurmInfo ai-workshop                                      # UFRC helper: current usage
```

The scripts request `--account=ai-workshop --qos=ai-workshop`. If the investment QOS has no free
CPU cores, the burst QOS (conventionally `ai-workshop-b`) can be used instead:

```bash
sbatch --qos=ai-workshop-b hpc/sweep.slurm
```

If your allocation requires a specific partition, add `--partition=<name>` to the `sbatch` call.

## 4. Run the sweep

### Default: 100,000 sessions

```bash
bash hpc/submit_all.sh
```

This submits:

1. `hpc/sweep.slurm` — a **Slurm array** (`--array=0-19`), each task: 1 node, 8 CPUs, 16 GB, ≤ 1 h,
   simulating `SESSIONS_PER_TASK=5000` sessions and evaluating every configuration
   (5,056 detector settings × 5 drift-score variants = 25,280 configurations) on them.
   Each task writes `results/runs/<RUN_NAME>/shards/shard_<task>.npz` atomically.
2. `hpc/finalize.slurm` — runs after the array ends (`--dependency=afterany`), merges all shards,
   applies the selection rule, runs the robustness experiments, renders figures, and exports
   everything (section 5).

### Scaling up

```bash
# 1,000,000 sessions: 100 tasks x 10,000 sessions
RUN_NAME=hpg-1m bash hpc/submit_all.sh --array=0-99 --export=ALL,SESSIONS_PER_TASK=10000

# or submit the pieces yourself (both jobs need the same RUN_NAME)
export RUN_NAME=hpg-1m
sbatch --array=0-99 --export=ALL,SESSIONS_PER_TASK=10000 hpc/sweep.slurm
sbatch --dependency=afterany:<sweep_job_id> hpc/finalize.slurm
```

Environment variables understood by the scripts:

| variable | default | meaning |
|---|---|---|
| `SESSIONS_PER_TASK` | 5000 | sessions simulated per array task |
| `BASE_SEED` | 42 | base seed shared by all tasks |
| `GRID` | full | `full` (25,280 configs) or `quick` (smoke test) |
| `RUN_NAME` | `hpg-<time>` (submit_all) or `hpg-<array job id>` (sweep alone) | names the run folder `results/runs/<RUN_NAME>/`; finalize requires it |
| `RESULTS_DIR` | `results/runs/$RUN_NAME` | explicit run folder (must be under `results/runs/` or outside the repo) |
| `EVAL_SESSIONS` | 20000 | finalize: per-session analysis set |
| `ROBUSTNESS_SESSIONS` | 5000 | finalize: sessions per robustness level and class |
| `INSTALL` | (unset) | finalize: set to `1` to copy the new config and figures into `public/`, replacing the app's detector |

### Expected runtime (measured, not guessed)

On a workstation core, one block of 250 sessions × 25,280 configurations takes ≈ 6 s.
A 50,000-session run took 359 s of wall time on 16 worker processes, plus ≈ 25 s for finalize.
**Measured on HiPerGator:** the default 100,000-session submission (20 tasks × 5,000 sessions, 8 CPUs each) finished
each array task in 30–59 s of elapsed time (job 44695919; 981 s summed over the 20 tasks, 7,848 allocated core-seconds)
and the finalize job in 37 s (job 44695920). The report's "564 CPU-process seconds" is the sum of per-shard wall-clock
times measured inside Python, not CPU time (see `results/PROVENANCE.md`).
So a 5,000-session array task on 8 CPUs needs well under a minute of compute, and a
10,000-session task about a minute. The 1-hour limit is deliberately generous. Peak memory is
roughly 0.5 GB per worker process; 16 GB for 8 workers leaves ample headroom.

### Reproducibility

Every block of sessions is generated from `numpy.random.SeedSequence([BASE_SEED, SLURM_ARRAY_TASK_ID, block])`.
Any shard can be re-run on its own and reproduces bit-for-bit, independent of worker count
(this is unit-tested: `lab/tests/test_pipeline.py::ShardTests`).

## 5. Monitoring, failures, and re-runs

```bash
squeue -u $USER
sacct -j <jobid> --format=JobID,State,Elapsed,MaxRSS
tail -f hpc/logs/sweep_<jobid>_<task>.out
```

- A failed task leaves no shard (or an unreadable one); **other shards are unaffected**.
- Re-run only the failed indices; `--resume` is on, so finished shards are skipped:
  `sbatch --array=7,13 hpc/sweep.slurm`
- Re-merge at any time (fast, a few minutes at most): `sbatch --export=ALL,RUN_NAME=<name> hpc/finalize.slurm`
  (a run folder that already has a report is refused unless `merge_results.py` gets `--overwrite-run`)
- The merge verifies that all shards were produced with the same grid (hash check) and lists any it skipped.

### Outputs

```
results/runs/<RUN_NAME>/
  breakingpoint_detector_config.json   # exported config (copied into public/ only with INSTALL=1 / --install)
  summary.csv                          # headline metrics + run metadata
  config_results.csv                   # every configuration, selection and held-out metrics
  scenario_results.csv                 # per-scenario metrics for the featured detectors
  robustness_results.csv               # noise / outlier / dropout sweeps
  ablation_results.csv                 # detector families and drift-score variants
  VALIDATION_REPORT.md                 # human-readable report incl. pitch-ready statements
  figures/*.png|pdf                    # detection_tradeoff, noise_robustness, changepoint_accuracy,
                                       # scenario_examples, parameter_heatmap, personal_vs_population,
                                       # outlier/dropout robustness, ablation, detection_by_severity, ...
  shards/shard_XXXXX.npz               # mergeable raw counts (git-ignored)
```

The config's `validation.compute_environment` field records `UF HiPerGator (Slurm job …)` when the
merge ran under Slurm, so the app's "Lab validation" panel shows where the numbers came from.

## 6. Bring the results back to your laptop

Copy everything you will want later, including the CSVs and the shards, before your allocation ends. The original
study's CSVs and shards were not copied in time and are now missing (see `results/PROVENANCE.md`).

```bash
# on your laptop, in the repo: the whole run folder, into its own folder
rsync -av <gatorlink>@hpg.rc.ufl.edu:/blue/ai-workshop/<gatorlink>/breakingpoint/results/runs/<RUN_NAME>/ ./results/runs/<RUN_NAME>/
```

The app keeps its current detector until you decide to switch. Switching replaces the configuration the original
study selected, so treat it as a new experiment: copy the run's `breakingpoint_detector_config.json` into `public/`
and its PNG figures into `public/lab/figures/` on purpose, and record the change. `tests/archive_integrity.test.ts`
will then fail, as a reminder that the app no longer matches the archived study.

If you do switch, the demo dataset is tuned to tell its story with the shipped detector:

```bash
npm test                                            # demo.test.ts checks the story with the new config
DEMO_TUNE=1 npx vitest run tests/demo_tune.test.ts  # only if demo.test.ts fails: prints new presets
```

If the new configuration shifts the demo's BreakingPoint by a rep, copy the top preset printed by the
tune script into `DEMO_PRESETS` in `src/demo/demoScript.ts`. The demo *never* hard-codes when the
alarm fires — the real detector decides at runtime.

## 7. Numbers policy for the presentation

Only quote numbers that appear in `results/VALIDATION_REPORT.md` from a run that **actually
completed**. The report ends with copy-ready sentences generated from the real results.
Synthetic sessions evaluate the detector's statistical behaviour under controlled conditions;
they are not clinical data and say nothing about injury prediction.
