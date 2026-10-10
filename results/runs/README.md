# Lab runs

`hpc/run_experiment.py` and `hpc/merge_results.py` write each new run to its own folder here, `results/runs/<run-name>/`. The folders are git-ignored.

A run never writes over the archived studies one level up (see [`../PROVENANCE.md`](../PROVENANCE.md)) or over the app's detector config in `public/`. The exported config replaces the app's config only when the run is started with `--install`. If a run should become part of the record, copy its folder somewhere tracked on purpose and add it to `../provenance.json`.

```bash
python hpc/run_experiment.py --sessions 1000 --seed 42 --run-name my-local-run
```
