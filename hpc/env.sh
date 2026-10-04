#!/bin/bash
# Python environment for BreakingPoint Lab on HiPerGator (sourced by the Slurm scripts).
# Prefers a project virtualenv created by hpc/setup_env.sh; otherwise uses the
# cluster's Python module if it already provides numpy + matplotlib.
VENV_DIR="${BP_VENV:-$(pwd)/.venv-hpg}"
if command -v module >/dev/null 2>&1; then
  module load python/3.11 >/dev/null 2>&1 || module load python >/dev/null 2>&1 || true
fi
if [ -f "${VENV_DIR}/bin/activate" ]; then
  # shellcheck disable=SC1091
  source "${VENV_DIR}/bin/activate"
fi
if ! python -c "import numpy, matplotlib" >/dev/null 2>&1; then
  echo "ERROR: numpy/matplotlib not importable. Run once on a login node:  bash hpc/setup_env.sh" >&2
  exit 1
fi
