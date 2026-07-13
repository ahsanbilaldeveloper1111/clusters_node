#!/usr/bin/env bash
# Prepare blue-green-aws overlay with ECR image tags (CI/CD + local).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OVERLAY="${ROOT}/k8s/overlays/blue-green-aws"
IMAGE_TAG="${IMAGE_TAG:-latest}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"

if [[ -z "$AWS_ACCOUNT_ID" ]]; then
  if ! command -v aws >/dev/null 2>&1; then
    echo "ERROR: Set AWS_ACCOUNT_ID or install aws CLI"
    exit 1
  fi
  AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
fi

PROJECT="${PROJECT_NAME:-enterprise-app}"
ENV="${ENVIRONMENT:-production}"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
BACKEND_IMAGE="${ECR_REGISTRY}/${PROJECT}-${ENV}/backend:${IMAGE_TAG}"
FRONTEND_IMAGE="${ECR_REGISTRY}/${PROJECT}-${ENV}/frontend-k8s:${IMAGE_TAG}"

if [[ -f "${SECRETS_ENV_FILE:-}" ]]; then
  cp "$SECRETS_ENV_FILE" "${OVERLAY}/secrets.env"
elif [[ ! -f "${OVERLAY}/secrets.env" ]]; then
  if command -v aws >/dev/null 2>&1; then
    echo "secrets.env missing — syncing from Secrets Manager into aws-production, then copying..."
    AWS_REGION="$AWS_REGION" PROJECT_NAME="$PROJECT" ENVIRONMENT="$ENV" \
      bash "${ROOT}/scripts/k8s-aws-sync-secrets.sh"
    cp "${ROOT}/k8s/overlays/aws-production/secrets.env" "${OVERLAY}/secrets.env"
  else
    cp "${OVERLAY}/secrets.env.example" "${OVERLAY}/secrets.env"
    echo "WARN: Using secrets.env.example — run scripts/k8s-aws-sync-secrets.sh after terraform apply"
  fi
fi

cd "$OVERLAY"

if ! command -v kustomize >/dev/null 2>&1; then
  echo "ERROR: kustomize CLI required"
  exit 1
fi

kustomize edit set image "enterprise-backend=${BACKEND_IMAGE}"
kustomize edit set image "enterprise-frontend=${FRONTEND_IMAGE}"

echo "Prepared blue-green-aws overlay:"
echo "  backend:  ${BACKEND_IMAGE}"
echo "  frontend: ${FRONTEND_IMAGE}"
