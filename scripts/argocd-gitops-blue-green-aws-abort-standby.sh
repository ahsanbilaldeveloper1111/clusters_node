#!/usr/bin/env bash
# Abort a failed standby rollout in Git: scale the inactive color back to 0.
# Use after a standby commit when pods never became Ready (live traffic unchanged).
#
# Env:
#   GITOPS_BG_DIR (default k8s/overlays/gitops-blue-green-aws)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export GITOPS_BG_DIR="${GITOPS_BG_DIR:-k8s/overlays/gitops-blue-green-aws}"
# shellcheck source=argocd-gitops-blue-green-lib.sh
source "$ROOT/scripts/argocd-gitops-blue-green-lib.sh"

ACTIVE="$(gitops_bg_active_color)"
STANDBY="$(gitops_bg_other_color "$ACTIVE")"

echo "Abort standby: scaling $STANDBY → 0 (active remains $ACTIVE)"
gitops_bg_set_replicas "$STANDBY" 0

echo "Updated $REPLICAS_FILE"
echo "Commit + push so Argo CD tears down the failed standby"
