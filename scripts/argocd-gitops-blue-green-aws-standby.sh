#!/usr/bin/env bash
# Update standby color ECR images + scale standby up in gitops-blue-green-aws (Argo syncs).
#
# Env:
#   IMAGE_TAG (required)
#   AWS_REGION, AWS_ACCOUNT_ID, PROJECT_NAME, ENVIRONMENT
#   REPLICAS (default 2)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export GITOPS_BG_DIR="${GITOPS_BG_DIR:-k8s/overlays/gitops-blue-green-aws}"
# shellcheck source=argocd-gitops-blue-green-lib.sh
source "$ROOT/scripts/argocd-gitops-blue-green-lib.sh"

IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG required}"
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"
PROJECT_NAME="${PROJECT_NAME:-enterprise-app}"
ENVIRONMENT="${ENVIRONMENT:-production}"
REPLICAS="${REPLICAS:-2}"

if [[ -z "$AWS_ACCOUNT_ID" ]]; then
  AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
fi

ECR="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
BACKEND_REPO="${ECR}/${PROJECT_NAME}-${ENVIRONMENT}/backend"
FRONTEND_REPO="${ECR}/${PROJECT_NAME}-${ENVIRONMENT}/frontend-k8s"

ACTIVE="$(gitops_bg_active_color)"
STANDBY="$(gitops_bg_other_color "$ACTIVE")"

echo "Active (live in Git): $ACTIVE"
echo "Standby (updating):   $STANDBY"
echo "Images: ${BACKEND_REPO}:${IMAGE_TAG}"

if ! command -v kustomize >/dev/null 2>&1; then
  echo "ERROR: kustomize required"
  exit 1
fi

cd "${ROOT}/${GITOPS_BG_DIR}"

kustomize edit set image \
  "enterprise-backend-${STANDBY}=${BACKEND_REPO}:${IMAGE_TAG}"
kustomize edit set image \
  "enterprise-frontend-${STANDBY}=${FRONTEND_REPO}:${IMAGE_TAG}"

cd "$ROOT"
gitops_bg_set_replicas "$STANDBY" "$REPLICAS"

echo "Updated standby ($STANDBY) images + replicas=${REPLICAS}"
echo "  ${GITOPS_BG_DIR}/kustomization.yaml"
echo "  ${REPLICAS_FILE}"
