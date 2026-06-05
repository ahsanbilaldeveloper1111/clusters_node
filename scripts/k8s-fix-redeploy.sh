#!/usr/bin/env bash
# Fix a broken local deploy: wrong-namespace secret, stuck jobs, optional DB reset
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

NS=enterprise-app
RESET_DB="${RESET_DB:-false}"

echo "Removing secret from default namespace (if misplaced by old Kustomize)..."
kubectl delete secret app-secrets -n default --ignore-not-found

if [[ "$RESET_DB" == "true" ]]; then
  echo "RESET_DB=true — deleting Postgres PVC (wipes database)..."
  kubectl delete deployment postgres -n "$NS" --ignore-not-found
  kubectl delete pvc postgres-data -n "$NS" --ignore-not-found
  sleep 3
fi

echo "Rebuilding backend image (health probe fixes)..."
export IMAGE_TAG=local-v2
bash scripts/k8s-build-images.sh

if command -v minikube &>/dev/null && minikube status &>/dev/null; then
  echo "Loading images into Minikube..."
  minikube image load enterprise-backend:local-v2
  minikube image load enterprise-frontend:local-v2
elif command -v kind &>/dev/null; then
  echo "Loading images into kind..."
  kind load docker-image enterprise-backend:local-v2 enterprise-frontend:local-v2
fi

bash scripts/k8s-deploy-local.sh
