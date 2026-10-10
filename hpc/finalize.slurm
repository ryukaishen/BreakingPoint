#!/bin/bash
# =============================================================================
# BreakingPoint Lab — merge shards, select the detector, run robustness
# experiments, render figures, export the detector config into the run folder
# results/runs/<RUN_NAME>/. The app config in public/ changes only with INSTALL=1.
# =============================================================================
#SBATCH --job-name=bp-lab-finalize
#SBATCH --account=ai-workshop
#SBATCH --qos=ai-workshop
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=8
#SBATCH --mem=16gb
#SBATCH --time=01:00:00
#SBATCH --output=hpc/logs/finalize_%j.out
#SBATCH --error=hpc/logs/finalize_%j.err

set -euo pipefail
cd "${SLURM_SUBMIT_DIR:-$(pwd)}"
source hpc/env.sh
export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 MPLBACKEND=Agg
: "${RUN_NAME:?RUN_NAME is not set. Submit with hpc/submit_all.sh, or: sbatch --export=ALL,RUN_NAME=<name> hpc/finalize.slurm}"
RESULTS_DIR="${RESULTS_DIR:-results/runs/${RUN_NAME}}"

python hpc/merge_results.py \
  --out "${RESULTS_DIR}" \
  --grid "${GRID:-full}" \
  --workers "${SLURM_CPUS_PER_TASK:-1}" \
  --eval-sessions "${EVAL_SESSIONS:-20000}" \
  --robustness-sessions "${ROBUSTNESS_SESSIONS:-5000}" \
  ${INSTALL:+--install}

echo "Report: ${RESULTS_DIR}/VALIDATION_REPORT.md"
