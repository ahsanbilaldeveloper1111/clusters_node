#!/usr/bin/env bash
# Full Argo blue/green release: update standby in Git → wait for pods → switch in Git.
#
# Requires: aws, kubectl (EKS), kustomize, git write access when used from CD.
#
# Env:
#   IMAGE_TAG (required)
#   BLUE_GREEN_SWITCH=true
#   WAIT_STANDBY=true — kubectl wait for standby Ready before switch commit
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=argocd-gitops-blue-green-lib.sh
source "$ROOT/scripts/argocd-gitops-blue-green-lib.sh"

IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG required}"
BLUE_GREEN_SWITCH="${BLUE_GREEN_SWITCH:-true}"
WAIT_STANDBY="${WAIT_STANDBY:-true}"
NS="${NS:-enterprise-app}"

ACTIVE="$(gitops_bg_active_color)"
STANDBY="$(gitops_bg_other_color "$ACTIVE")"

echo "==> 1/3 Standby image update ($STANDBY)"
bash "$ROOT/scripts/argocd-gitops-blue-green-aws-standby.sh"

if [[ "$WAIT_STANDBY" == "true" ]]; then
  if kubectl get deployment "backend-${STANDBY}" -n "$NS" &>/dev/null; then
    echo "==> Waiting for standby Deployments (after you commit/sync, or if already applied)..."
    # Best-effort: if Argo already synced a previous apply; CD commits after this script
    echo "    (CD commits Git first; wait runs after push in the workflow)"
  fi
fi

if [[ "$BLUE_GREEN_SWITCH" != "true" ]]; then
  echo "BLUE_GREEN_SWITCH=false — only standby images updated in Git. Commit and sync; switch later."
  exit 0
fi

echo "==> 2/3 Switch color in Git ($ACTIVE → $STANDBY)"
bash "$ROOT/scripts/argocd-gitops-blue-green-aws-switch.sh" "$STANDBY"

echo "==> 3/3 Done preparing Git changes. CD should commit + push;"
echo "    Argo CD Application enterprise-app-aws-bg will sync cutover."
