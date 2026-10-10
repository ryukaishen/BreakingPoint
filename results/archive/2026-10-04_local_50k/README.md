# Earlier local run, 4 October 2026 (superseded)

These five CSVs come from a 50,000-session run of BreakingPoint Lab on a local computer. That run finished at 01:39 on 2026-10-04, a few hours before the UF HiPerGator study. **They are not outputs of the HiPerGator study**, and they selected different detector settings:

| | this run | HiPerGator study |
|---|---|---|
| Sessions | 50,000 | 100,000 |
| Shards | 1 | 20 |
| Selected settings | `ewma\|a=0.4\|bp=2\|w=1.5\|m=2\|clip=2.5` | `ewma\|a=0.4\|bp=2\|w=1\|m=0\|clip=2.5` |

The files moved here from `results/` with `git mv` on 2026-10-09, so their contents and git history are unchanged. This run's original report is still in git history: `git show a8b8bf4:results/VALIDATION_REPORT.md`.

| File | Contents |
|---|---|
| `summary.csv` | headline metrics and run metadata |
| `config_results.csv` | every configuration, with selection and held-out metrics |
| `scenario_results.csv` | per-scenario metrics for the featured detectors |
| `robustness_results.csv` | noise, outlier and dropout sweeps |
| `ablation_results.csv` | detector families and score variants |

Checksums are in [`../../provenance.json`](../../provenance.json). See [`../../PROVENANCE.md`](../../PROVENANCE.md) for both experiments.
