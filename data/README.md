# Data (not in git)

Raw downloads and everything derived from them stay on your machine. Git ignores both folders below except their README files.

| Folder | Holds |
|---|---|
| `external/` | Files extracted from the original downloads, one folder per dataset, plus a `SOURCE_MANIFEST.json` with checksums |
| `processed/` | Outputs of the research pipeline: per-trial landmarks, per-rep measurements, quality checks |

Recreate them with the commands in [`research/README.md`](../research/README.md). Neither dataset may be redistributed through this repository: REHAB24-6 is CC BY-NC 4.0 (non-commercial research only), and the jump-landing dataset, although CC BY 4.0, is far too large for git.
