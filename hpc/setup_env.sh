#!/bin/bash
# One-time setup on a HiPerGator login node (takes ~1 minute):
#     bash hpc/setup_env.sh
set -euo pipefail
cd "$(dirname "$0")/.."
VENV_DIR="${BP_VENV:-$(pwd)/.venv-hpg}"
if command -v module >/dev/null 2>&1; then
  module load python/3.11 >/dev/null 2>&1 || module load python >/dev/null 2>&1 || true
fi
python3 -m venv "${VENV_DIR}"
# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"
python -m pip install --upgrade pip >/dev/null
python -m pip install -r hpc/requirements.txt
mkdir -p hpc/logs results
python -c "import numpy, matplotlib; print('numpy', numpy.__version__, '| matplotlib', matplotlib.__version__)"
echo "Environment ready at ${VENV_DIR}"
echo "Smoke test:  python hpc/run_experiment.py --sessions 500 --seed 1 --grid quick --out results_smoke --no-install"
