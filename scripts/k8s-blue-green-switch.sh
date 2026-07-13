#!/usr/bin/env bash
# Flip Service selectors to the standby color (instant traffic cutover).
#
# Usage:
#   bash scripts/k8s-blue-green-switch.sh [target-color]
#   SCALE_DOWN_OLD=true bash scripts/k8s-blue-green-switch.sh   # scale previous to 0
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=k8s-blue-green-lib.sh
source "$ROOT/scripts/k8s-blue-green-lib.sh"

SCALE_DOWN_OLD="${SCALE_DOWN_OLD:-true}"

require_cluster
require_blue_green

ACTIVE="$(active_color)"
TARGET="${1:-$(other_color "$ACTIVE")}"

if [[ "$TARGET" != "blue" && "$TARGET" != "green" ]]; then
  echo "Target must be blue or green (got: $TARGET)"
  exit 1
fi

if [[ "$TARGET" == "$ACTIVE" ]]; then
  echo "Already serving $ACTIVE — nothing to switch."
  exit 0
fi

# Ensure target has ready pods before flipping traffic
BE_READY="$(kubectl get deployment "backend-${TARGET}" -n "$NS" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0)"
FE_READY="$(kubectl get deployment "frontend-${TARGET}" -n "$NS" -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0)"
BE_READY="${BE_READY:-0}"
FE_READY="${FE_READY:-0}"

if [[ "$BE_READY" -lt 1 || "$FE_READY" -lt 1 ]]; then
  echo "Refusing switch: $TARGET is not ready (backend ready=$BE_READY, frontend ready=$FE_READY)."
  echo "Deploy first: npm run k8s:blue-green:deploy -- <tag> <tag>"
  exit 1
fi

echo "Switching live traffic: $ACTIVE → $TARGET"

kubectl patch svc backend-service -n "$NS" --type merge -p \
  "{\"spec\":{\"selector\":{\"app.kubernetes.io/name\":\"backend\",\"app.kubernetes.io/color\":\"${TARGET}\"}}}"

kubectl patch svc frontend-service -n "$NS" --type merge -p \
  "{\"spec\":{\"selector\":{\"app.kubernetes.io/name\":\"frontend\",\"app.kubernetes.io/color\":\"${TARGET}\"}}}"

kubectl create configmap blue-green-active \
  -n "$NS" \
  --from-literal=active="$TARGET" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Traffic now on: $TARGET"

if [[ "$SCALE_DOWN_OLD" == "true" ]]; then
  echo "Scaling previous color ($ACTIVE) to 0 (rollback: scale up + switch back)..."
  kubectl scale "deployment/backend-${ACTIVE}" "deployment/frontend-${ACTIVE}" \
    -n "$NS" \
    --replicas=0
fi

echo ""
echo "Done. Status: npm run k8s:blue-green:status"
echo "Rollback: SCALE_DOWN_OLD=false npm run k8s:blue-green:deploy -- <old-tag> <old-tag>"
echo "          npm run k8s:blue-green:switch -- $ACTIVE"
