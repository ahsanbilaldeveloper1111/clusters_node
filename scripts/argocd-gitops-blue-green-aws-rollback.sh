#!/usr/bin/env bash
# Flip traffic back to the previous color in Git (Argo CD syncs the cutover).
#
# After a bad switch: restores the other color as active and scales the current
# (bad) color down. Does NOT undo DB migrations.
#
# Usage:
#   bash scripts/argocd-gitops-blue-green-aws-rollback.sh [previous-color]
# Env:
#   REPLICAS=2 — replicas for the restored color
#   SCALE_DOWN_CURRENT=true (default) — set current (bad) color replicas to 0
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export GITOPS_BG_DIR="${GITOPS_BG_DIR:-k8s/overlays/gitops-blue-green-aws}"
# shellcheck source=argocd-gitops-blue-green-lib.sh
source "$ROOT/scripts/argocd-gitops-blue-green-lib.sh"

REPLICAS="${REPLICAS:-2}"
SCALE_DOWN_CURRENT="${SCALE_DOWN_CURRENT:-true}"

ACTIVE="$(gitops_bg_active_color)"
TARGET="${1:-$(gitops_bg_other_color "$ACTIVE")}"

if [[ "$TARGET" != "blue" && "$TARGET" != "green" ]]; then
  echo "Target must be blue or green"
  exit 1
fi

if [[ "$TARGET" == "$ACTIVE" ]]; then
  echo "Already active=$ACTIVE — nothing to roll back"
  exit 0
fi

echo "GitOps rollback: $ACTIVE → $TARGET"
gitops_bg_set_active "$TARGET"
gitops_bg_set_replicas "$TARGET" "$REPLICAS"

if [[ "$SCALE_DOWN_CURRENT" == "true" ]]; then
  gitops_bg_set_replicas "$ACTIVE" 0
fi

echo "Updated:"
echo "  $ACTIVE_COLOR_FILE"
echo "  $SERVICE_COLOR_FILE"
echo "  $REPLICAS_FILE"
echo "Commit + push; Argo CD will move traffic back to $TARGET"
