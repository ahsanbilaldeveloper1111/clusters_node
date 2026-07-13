#!/usr/bin/env bash
# Deploy a new image tag to the inactive (standby) color. Does not switch traffic.
#
# Usage:
#   bash scripts/k8s-blue-green-deploy.sh [backend-tag] [frontend-tag] [replicas]
# Env:
#   BACKEND_IMAGE / FRONTEND_IMAGE — full image refs (override tags)
#   SCALE_DOWN_AFTER_SWITCH — used only by switch script
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=k8s-blue-green-lib.sh
source "$ROOT/scripts/k8s-blue-green-lib.sh"

BACKEND_TAG="${1:-${IMAGE_TAG:-local-v2}}"
FRONTEND_TAG="${2:-$BACKEND_TAG}"
REPLICAS="${3:-2}"

BACKEND_IMAGE="${BACKEND_IMAGE:-enterprise-backend:${BACKEND_TAG}}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-enterprise-frontend:${FRONTEND_TAG}}"

require_cluster
require_blue_green

ACTIVE="$(active_color)"
INACTIVE="$(other_color "$ACTIVE")"

echo "Active (live):     $ACTIVE"
echo "Inactive (target): $INACTIVE"
echo "Backend image:     $BACKEND_IMAGE"
echo "Frontend image:    $FRONTEND_IMAGE"
echo "Replicas:          $REPLICAS"
echo ""

kubectl set image "deployment/backend-${INACTIVE}" \
  -n "$NS" \
  "backend=${BACKEND_IMAGE}"

kubectl set image "deployment/frontend-${INACTIVE}" \
  -n "$NS" \
  "frontend=${FRONTEND_IMAGE}"

kubectl scale "deployment/backend-${INACTIVE}" "deployment/frontend-${INACTIVE}" \
  -n "$NS" \
  --replicas="$REPLICAS"

echo "Waiting for inactive slot to become Available..."
kubectl rollout status "deployment/backend-${INACTIVE}" -n "$NS" --timeout=300s
kubectl rollout status "deployment/frontend-${INACTIVE}" -n "$NS" --timeout=300s

echo ""
echo "Standby ($INACTIVE) is ready. Live traffic is still on $ACTIVE."
echo "Verify standby (optional port-forward), then cut over:"
echo "  npm run k8s:blue-green:switch"
echo ""
echo "Preview backend on standby:"
echo "  kubectl port-forward -n $NS deploy/backend-${INACTIVE} 3001:3000"
echo "  curl http://localhost:3001/health"
