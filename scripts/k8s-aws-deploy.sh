#!/usr/bin/env bash
# Deploy enterprise-app to AWS EKS using k8s/overlays/aws-production
#
# Prerequisites:
#   - terraform apply completed (VPC, EKS, RDS, ElastiCache, ECR, Secrets Manager)
#   - aws eks update-kubeconfig --region <region> --name <cluster>
#   - Docker images pushed to ECR
#
# Usage:
#   export IMAGE_TAG=latest
#   bash scripts/k8s-aws-deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OVERLAY="${ROOT}/k8s/overlays/aws-production"
NAMESPACE="${K8S_NAMESPACE:-enterprise-app}"
MIGRATE_TIMEOUT="${MIGRATE_TIMEOUT:-300s}"
SEED_TIMEOUT="${SEED_TIMEOUT:-180s}"
ROLLOUT_TIMEOUT="${ROLLOUT_TIMEOUT:-300s}"

step() {
  echo ""
  echo "==> $*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: $1 is required"
    exit 1
  fi
}

require_cmd kubectl
require_cmd kustomize

step "1/8 Prepare overlay (ECR image tags + secrets.env)"
bash "${ROOT}/scripts/k8s-aws-prepare.sh"

if [[ ! -f "${OVERLAY}/secrets.env" ]]; then
  echo "ERROR: ${OVERLAY}/secrets.env not found"
  exit 1
fi

step "2/8 Validate manifests"
kubectl kustomize "$OVERLAY" > /tmp/k8s-aws-production.yaml
echo "Rendered $(wc -l < /tmp/k8s-aws-production.yaml) lines to /tmp/k8s-aws-production.yaml"

step "3/8 Apply Kubernetes manifests"
kubectl apply -k "$OVERLAY"

step "4/8 Recreate migration jobs (idempotent schema updates)"
kubectl delete job db-migrate db-seed -n "$NAMESPACE" --ignore-not-found
kubectl apply -k "$OVERLAY"

step "5/8 Wait for db-migrate Job"
if kubectl wait --for=condition=complete "job/db-migrate" -n "$NAMESPACE" --timeout="$MIGRATE_TIMEOUT"; then
  echo "db-migrate completed"
else
  echo "ERROR: db-migrate failed or timed out"
  kubectl logs -n "$NAMESPACE" "job/db-migrate" --tail=100 || true
  exit 1
fi

step "6/8 Wait for db-seed Job"
if kubectl wait --for=condition=complete "job/db-seed" -n "$NAMESPACE" --timeout="$SEED_TIMEOUT"; then
  echo "db-seed completed"
else
  echo "WARN: db-seed failed or timed out (may be OK if DB already seeded)"
  kubectl logs -n "$NAMESPACE" "job/db-seed" --tail=100 || true
fi

step "7/8 Wait for backend Deployment rollout"
kubectl rollout status "deployment/backend" -n "$NAMESPACE" --timeout="$ROLLOUT_TIMEOUT"

step "8/8 Wait for frontend Deployment rollout"
kubectl rollout status "deployment/frontend" -n "$NAMESPACE" --timeout="$ROLLOUT_TIMEOUT"

step "Deployment summary"
kubectl get pods,svc,ingress -n "$NAMESPACE"

INGRESS_HOST="$(kubectl get ingress enterprise-ingress -n "$NAMESPACE" -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true)"
if [[ -n "$INGRESS_HOST" ]]; then
  echo ""
  echo "Ingress load balancer: ${INGRESS_HOST}"
  echo "Point your DNS CNAME (app.example.com) to this hostname."
else
  echo ""
  echo "Ingress hostname not ready yet. Check: kubectl get svc -n ingress-nginx"
fi

echo ""
echo "Done. API health: kubectl port-forward -n ${NAMESPACE} svc/backend-service 3000:3000"
