#!/usr/bin/env bash
# Install the blue/green overlay (replaces rolling backend/frontend Deployments).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=k8s-blue-green-lib.sh
source "$ROOT/scripts/k8s-blue-green-lib.sh"

OVERLAY="${1:-k8s/overlays/blue-green}"
SECRETS_FILE="k8s/overlays/local/secrets.env"

if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "Missing $SECRETS_FILE — copy from k8s/secrets.env.example"
  exit 1
fi

require_cluster

echo "Applying blue/green overlay: $OVERLAY"
kubectl apply -k "$OVERLAY"

echo "Ensuring app-secrets exists..."
if ! kubectl get secret app-secrets -n "$NS" &>/dev/null; then
  kubectl create secret generic app-secrets \
    --from-env-file="$SECRETS_FILE" \
    -n "$NS" \
    --dry-run=client -o yaml | kubectl apply -f -
fi

echo "Recycling Jobs (immutable)..."
kubectl delete job db-migrate db-seed -n "$NS" --ignore-not-found
kubectl apply -k "$OVERLAY" 2>/dev/null || true

echo "Waiting for postgres..."
kubectl wait --for=condition=available deployment/postgres -n "$NS" --timeout=300s

echo "Waiting for db-migrate..."
kubectl wait --for=condition=complete job/db-migrate -n "$NS" --timeout=180s || {
  echo "Migrate failed — kubectl logs job/db-migrate -n $NS"
  exit 1
}

echo "Waiting for db-seed..."
kubectl wait --for=condition=complete job/db-seed -n "$NS" --timeout=180s || {
  echo "Seed failed — kubectl logs job/db-seed -n $NS"
  exit 1
}

ACTIVE="$(active_color)"
echo "Waiting for active color ($ACTIVE)..."
kubectl wait --for=condition=available "deployment/backend-${ACTIVE}" -n "$NS" --timeout=300s
kubectl wait --for=condition=available "deployment/frontend-${ACTIVE}" -n "$NS" --timeout=300s

echo ""
echo "Blue/green bootstrap complete."
echo "  Active color: $ACTIVE"
echo "  App URL:      http://localhost:8081"
echo "  Status:       npm run k8s:blue-green:status"
echo "  Next release: npm run k8s:build && npm run k8s:blue-green:deploy -- local-v2 local-v2"
echo "  Cutover:      npm run k8s:blue-green:switch"
