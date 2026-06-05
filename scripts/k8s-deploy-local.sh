#!/usr/bin/env bash
# Deploy local overlay and wait for database bootstrap jobs
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OVERLAY="${1:-k8s/overlays/local}"
NS=enterprise-app

if [[ ! -f "$OVERLAY/secrets.env" ]]; then
  echo "Missing $OVERLAY/secrets.env — copy from k8s/secrets.env.example"
  exit 1
fi

if ! kubectl cluster-info &>/dev/null; then
  echo "ERROR: Cannot reach Kubernetes API."
  echo ""
  echo "Fix (Docker Desktop):"
  echo "  1. Open Docker Desktop → Settings → Kubernetes → Enable Kubernetes"
  echo "  2. Wait until it shows 'Kubernetes is running'"
  echo "  3. Run: kubectl cluster-info"
  echo ""
  echo "If cluster-info still fails, restart Docker Desktop or run:"
  echo "  kubectl config use-context docker-desktop"
  exit 1
fi

echo "Applying Kustomize overlay: $OVERLAY"
kubectl apply -k "$OVERLAY"

echo "Ensuring app-secrets exists in namespace $NS..."
if ! kubectl get secret app-secrets -n "$NS" &>/dev/null; then
  echo "Secret missing — creating from $OVERLAY/secrets.env"
  kubectl create secret generic app-secrets \
    --from-env-file="$OVERLAY/secrets.env" \
    -n "$NS" \
    --dry-run=client -o yaml | kubectl apply -f -
fi

echo "Recycling stuck workloads (jobs are immutable)..."
kubectl delete job db-migrate db-seed -n "$NS" --ignore-not-found
kubectl apply -k "$OVERLAY" 2>/dev/null || true
kubectl rollout restart deployment/postgres deployment/backend deployment/frontend -n "$NS" 2>/dev/null || true

echo "Waiting for postgres to be ready..."
kubectl wait --for=condition=available deployment/postgres -n "$NS" --timeout=300s

echo "Waiting for db-migrate job..."
kubectl wait --for=condition=complete job/db-migrate -n "$NS" --timeout=180s || {
  echo "Migrate job failed — check: kubectl logs job/db-migrate -n $NS"
  exit 1
}

echo "Waiting for db-seed job..."
kubectl wait --for=condition=complete job/db-seed -n "$NS" --timeout=180s || {
  echo "Seed job failed — check: kubectl logs job/db-seed -n $NS"
  exit 1
}

echo "Waiting for backend rollout..."
kubectl wait --for=condition=available deployment/backend -n "$NS" --timeout=300s

echo "Waiting for frontend rollout..."
kubectl wait --for=condition=available deployment/frontend -n "$NS" --timeout=300s

echo ""
echo "Deployed successfully."
echo "  App URL:  http://localhost:8081  (LoadBalancer — same port as docker-compose)"
echo "  Status:   kubectl get pods,svc -n $NS"
echo "  Login:    admin@enterprise.local / Password123!"
echo ""
echo "  Minikube: run 'minikube tunnel' in another terminal if localhost:8081 does not respond."
