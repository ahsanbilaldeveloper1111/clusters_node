#!/usr/bin/env bash
# Flip active color in Git (Service selectors + ConfigMap + replicas). Argo syncs cutover.
#
# Usage:
#   bash scripts/argocd-gitops-blue-green-aws-switch.sh [target-color]
# Env:
#   SCALE_DOWN_OLD=true (default) — set previous color replicas to 0
#   REPLICAS=2 — replicas for new active color
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=argocd-gitops-blue-green-lib.sh
source "$ROOT/scripts/argocd-gitops-blue-green-lib.sh"

SCALE_DOWN_OLD="${SCALE_DOWN_OLD:-true}"
REPLICAS="${REPLICAS:-2}"

ACTIVE="$(gitops_bg_active_color)"
TARGET="${1:-$(gitops_bg_other_color "$ACTIVE")}"

if [[ "$TARGET" != "blue" && "$TARGET" != "green" ]]; then
  echo "Target must be blue or green"
  exit 1
fi

if [[ "$TARGET" == "$ACTIVE" ]]; then
  echo "Already active=$ACTIVE — nothing to switch"
  exit 0
fi

echo "GitOps switch: $ACTIVE → $TARGET"
gitops_bg_set_active "$TARGET"
gitops_bg_set_replicas "$TARGET" "$REPLICAS"

if [[ "$SCALE_DOWN_OLD" == "true" ]]; then
  gitops_bg_set_replicas "$ACTIVE" 0
fi

echo "Updated:"
echo "  $ACTIVE_COLOR_FILE"
echo "  $SERVICE_COLOR_FILE"
echo "  $REPLICAS_FILE"
echo "Commit + push; Argo CD will sync traffic to $TARGET"
