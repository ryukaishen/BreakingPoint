"""Where BreakingPoint Lab runs may write.

The original UF HiPerGator study (results/VALIDATION_REPORT.md, the exported config, the
figures and the job records), the archived local run under results/archive/, and the app's
active detector config in public/ must never be overwritten by a new run. Every run
therefore writes to its own folder:

    results/runs/<run-name>/        (git-ignored; one folder per experiment)

A folder outside the repository, or a scratch folder named results_* at the repository
root (such as results_smoke/), is also accepted. Anything else inside the repository is
refused. A run folder that already holds finished results is refused unless the caller
passes --overwrite-run. The app's config in public/ changes only with an explicit
--install.

This module only decides paths. It does not touch the simulation, the detector or how
results are computed.
"""
from __future__ import annotations

import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
INSTALL_TARGET = REPO / "public" / "breakingpoint_detector_config.json"

#: Files that mark a run folder as finished (written by finalize).
FINISHED_MARKERS = ("VALIDATION_REPORT.md", "breakingpoint_detector_config.json", "summary.csv")


class OutputGuardError(ValueError):
    """Raised when a run would write somewhere it must not."""


def default_run_name() -> str:
    return "local-" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())


def _inside(path: Path, parent: Path) -> bool:
    return path == parent or parent in path.parents


def check_output_dir(out: Path, repo: Path = REPO) -> Path:
    """Return the resolved output folder, or raise OutputGuardError if it is not allowed."""
    out = Path(out).resolve()
    repo = Path(repo).resolve()
    if not _inside(out, repo):
        return out  # a folder outside the repository, e.g. a temporary directory
    runs = repo / "results" / "runs"
    if runs in out.parents:
        return out  # results/runs/<run-name>[/...]
    rel = out.relative_to(repo)
    if len(rel.parts) >= 1 and rel.parts[0].startswith("results_"):
        return out  # scratch folder at the repository root, e.g. results_smoke/
    if out == runs:
        raise OutputGuardError(f"{out} is the folder that holds runs. Give the run its own name with --run-name.")
    raise OutputGuardError(
        f"Refusing to write Lab outputs to {out}. Inside the repository, runs write only to results/runs/<run-name>/ "
        "(or a scratch results_* folder) so the archived studies in results/ and the app files in public/ stay "
        "unchanged. Use --run-name NAME, or --out with a folder outside the repository."
    )


def resolve_output_dir(out: Path | None, run_name: str | None, repo: Path = REPO) -> Path:
    """The folder a run writes to: --out if given, else results/runs/<run-name>/."""
    if out is not None and run_name is not None:
        raise OutputGuardError("Use either --out or --run-name, not both.")
    if out is None:
        name = run_name or default_run_name()
        if not name or Path(name).name != name or name in (".", ".."):
            raise OutputGuardError(f"--run-name must be a plain folder name, got {name!r}.")
        out = Path(repo) / "results" / "runs" / name
    return check_output_dir(out, repo)


def check_not_finished(out: Path, overwrite: bool = False) -> None:
    """Refuse to add to, or overwrite, a run folder that already holds finished results."""
    done = [m for m in FINISHED_MARKERS if (Path(out) / m).exists()]
    if done and not overwrite:
        raise OutputGuardError(
            f"{out} already holds finished results ({', '.join(done)}). Choose a new --run-name, "
            "or pass --overwrite-run to replace that run."
        )


def install_target(install: bool) -> Path | None:
    """Where finalize may copy the exported config for the app: only with an explicit --install."""
    return INSTALL_TARGET if install else None
