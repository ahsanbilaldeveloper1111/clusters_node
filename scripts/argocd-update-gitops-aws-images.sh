#!/usr/bin/env bash
# Update k8s/overlays/gitops-aws ECR image tags after CD push (Argo CD AWS GitOps)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GITOPS_KUSTOMIZATION="${ROOT}/k8s/overlays/gitops-aws/kustomization.yaml"

IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG required}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"
PROJECT_NAME="${PROJECT_NAME:-enterprise-app}"
ENVIRONMENT="${ENVIRONMENT:-production}"

if [[ -z "$AWS_ACCOUNT_ID" ]]; then
  if ! command -v aws >/dev/null 2>&1; then
    echo "ERROR: Set AWS_ACCOUNT_ID or install aws CLI"
    exit 1
  fi
  AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
fi

ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
BACKEND_IMAGE="${ECR_REGISTRY}/${PROJECT_NAME}-${ENVIRONMENT}/backend"
FRONTEND_IMAGE="${ECR_REGISTRY}/${PROJECT_NAME}-${ENVIRONMENT}/frontend-k8s"

if ! command -v kustomize >/dev/null 2>&1; then
  echo "ERROR: kustomize required"
  exit 1
fi

cd "${ROOT}/k8s/overlays/gitops-aws"

kustomize edit set image "enterprise-backend=${BACKEND_IMAGE}:${IMAGE_TAG}"
kustomize edit set image "enterprise-frontend=${FRONTEND_IMAGE}:${IMAGE_TAG}"

echo "Updated ${GITOPS_KUSTOMIZATION}:"
grep -A2 "name: enterprise" kustomization.yaml || cat kustomization.yaml
