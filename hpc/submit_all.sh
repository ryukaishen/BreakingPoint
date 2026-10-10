#!/bin/bash
# Submit the sweep array and a finalize job that runs once every array task has
# ended (afterany: the merge still runs if a task failed, and reports missing shards).
# Both jobs write to results/runs/$RUN_NAME/ (default hpg-<UTC time>). The app config in
# public/ is left alone unless INSTALL=1 is exported.
#
#   bash hpc/submit_all.sh                                   # 100,000 sessions (20 x 5,000)
#   bash hpc/submit_all.sh --array=0-99 --export=ALL,SESSIONS_PER_TASK=10000   # 1,000,000
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p hpc/logs
export RUN_NAME="${RUN_NAME:-hpg-$(date -u +%Y%m%dT%H%M%SZ)}"
SWEEP_ID=$(sbatch --parsable "$@" hpc/sweep.slurm)
SWEEP_ID=${SWEEP_ID%%;*}
FIN_ID=$(sbatch --parsable --dependency=afterany:${SWEEP_ID} hpc/finalize.slurm)
echo "sweep array job: ${SWEEP_ID}"
echo "finalize job:    ${FIN_ID}  (starts after the sweep finishes)"
echo "run folder:      results/runs/${RUN_NAME}/"
echo "monitor:         squeue -u \$USER    |    tail -f hpc/logs/sweep_${SWEEP_ID}_0.out"
