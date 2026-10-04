#!/bin/bash
# =============================================================================
# BreakingPoint Lab — merge shards, select the detector, run robustness
# experiments, render figures, export results/breakingpoint_detector_config.json
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

python hpc/merge_results.py \
  --out "${RESULTS_DIR:-results}" \
  --grid "${GRID:-full}" \
  --workers "${SLURM_CPUS_PER_TASK:-1}" \
  --eval-sessions "${EVAL_SESSIONS:-20000}" \
  --robustness-sessions "${ROBUSTNESS_SESSIONS:-5000}" \
  ${NO_INSTALL:+--no-install}

echo "Report: ${RESULTS_DIR:-results}/VALIDATION_REPORT.md"
