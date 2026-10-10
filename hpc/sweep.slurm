#!/bin/bash
# =============================================================================
# BreakingPoint Lab — Monte-Carlo detector sweep on UF HiPerGator (CPU only)
#
# Each array task simulates SESSIONS_PER_TASK athlete sessions with its own
# reproducible seed stream (SeedSequence([BASE_SEED, SLURM_ARRAY_TASK_ID, block]))
# and evaluates every detector configuration on them, writing one shard file:
#     results/runs/<RUN_NAME>/shards/shard_<task>.npz        (written atomically)
# RUN_NAME defaults to hpg-<array job id>; hpc/submit_all.sh sets it for both jobs.
#
# Default: 20 tasks x 5,000 sessions = 100,000 sessions.
#   1,000,000 sessions:  sbatch --array=0-99 --export=ALL,SESSIONS_PER_TASK=10000 hpc/sweep.slurm
#   re-run failed tasks: sbatch --array=7,13 hpc/sweep.slurm      (finished shards are skipped)
# Then merge:            sbatch hpc/finalize.slurm   (or use hpc/submit_all.sh to chain both)
# =============================================================================
#SBATCH --job-name=bp-lab-sweep
#SBATCH --account=ai-workshop
#SBATCH --qos=ai-workshop
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=8
#SBATCH --mem=16gb
#SBATCH --time=01:00:00
#SBATCH --array=0-19
#SBATCH --output=hpc/logs/sweep_%A_%a.out
#SBATCH --error=hpc/logs/sweep_%A_%a.err

set -euo pipefail

SESSIONS_PER_TASK="${SESSIONS_PER_TASK:-5000}"
BASE_SEED="${BASE_SEED:-42}"
GRID="${GRID:-full}"
RUN_NAME="${RUN_NAME:-hpg-${SLURM_ARRAY_JOB_ID:-local}}"
RESULTS_DIR="${RESULTS_DIR:-results/runs/${RUN_NAME}}"

cd "${SLURM_SUBMIT_DIR:-$(pwd)}"
source hpc/env.sh

echo "host=$(hostname) job=${SLURM_ARRAY_JOB_ID:-local}_${SLURM_ARRAY_TASK_ID:-0} cpus=${SLURM_CPUS_PER_TASK:-1}"
echo "sessions/task=${SESSIONS_PER_TASK} seed=${BASE_SEED} grid=${GRID} out=${RESULTS_DIR}"
python --version

# Avoid oversubscription: one BLAS thread per worker process.
export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1

python hpc/run_experiment.py \
  --stage sweep \
  --sessions "${SESSIONS_PER_TASK}" \
  --seed "${BASE_SEED}" \
  --shard-index "${SLURM_ARRAY_TASK_ID:-0}" \
  --workers "${SLURM_CPUS_PER_TASK:-1}" \
  --grid "${GRID}" \
  --out "${RESULTS_DIR}" \
  --resume
