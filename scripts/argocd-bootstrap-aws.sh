#!/usr/bin/env bash
# Bootstrap Argo CD Application + app secrets for AWS EKS (RDS + ElastiCache)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ARGOCD_NAMESPACE="${ARGOCD_NAMESPACE:-argocd}"
APP_NAMESPACE="${APP_NAMESPACE:-enterprise-app}"
GIT_REPO_URL="${GIT_REPO_URL:-git@github.com:ahsanbilaldeveloper1111/clusters_node.git}"
SECRETS_FILE="${SECRETS_FILE:-k8s/overlays/aws-production/secrets.env}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_SECRET_NAME="${AWS_SECRET_NAME:-}"

if [[ ! -f "$SECRETS_FILE" ]]; then
  if command -v aws >/dev/null 2>&1; then
    echo "Syncing secrets from AWS Secrets Manager..."
    AWS_REGION="$AWS_REGION" AWS_SECRET_NAME="$AWS_SECRET_NAME" \
      bash scripts/k8s-aws-sync-secrets.sh
    SECRETS_FILE="k8s/overlays/aws-production/secrets.env"
  elif [[ -f k8s/overlays/aws-production/secrets.env.example ]]; then
    echo "WARN: Using secrets.env.example — run k8s-aws-sync-secrets.sh after terraform apply"
    cp k8s/overlays/aws-production/secrets.env.example "$SECRETS_FILE"
  else
    echo "ERROR: Missing $SECRETS_FILE"
    exit 1
  fi
fi

echo "Git repo: ${GIT_REPO_URL}"

echo "Creating namespace ${APP_NAMESPACE}..."
kubectl create namespace "$APP_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

echo "Creating app-secrets (outside Git — Argo ignoreDifferences)..."
kubectl create secret generic app-secrets \
  --from-env-file="$SECRETS_FILE" \
  -n "$APP_NAMESPACE" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Applying AppProject + AWS Application..."
kubectl apply -f k8s/argocd/appproject.yaml
kubectl apply -f k8s/argocd/applications/enterprise-app-aws.yaml

echo ""
echo "Bootstrap complete (AWS GitOps)."
echo "  Sync status: kubectl get application enterprise-app-aws -n ${ARGOCD_NAMESPACE}"
echo "  Argo UI:     kubectl port-forward svc/argocd-server -n ${ARGOCD_NAMESPACE} 8082:443"
echo ""
echo "Ensure Argo CD repo access: ${GIT_REPO_URL}"
echo "ECR pull: EKS nodes need IAM ECR policy (terraform attaches this)."
