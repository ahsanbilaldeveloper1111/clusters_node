#!/usr/bin/env bash
# Prepare production Kustomize overlay with GHCR image tags (used by CD pipeline)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OVERLAY="${ROOT}/k8s/overlays/production"
REGISTRY="${REGISTRY:-ghcr.io}"
REPOSITORY="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY required}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
BACKEND_IMAGE="${REGISTRY}/${REPOSITORY}/backend:${IMAGE_TAG}"
FRONTEND_IMAGE="${REGISTRY}/${REPOSITORY}/frontend-k8s:${IMAGE_TAG}"

cd "$OVERLAY"

if [[ -f "${SECRETS_ENV_FILE:-}" ]]; then
  cp "$SECRETS_ENV_FILE" secrets.env
elif [[ ! -f secrets.env ]]; then
  cp secrets.env.example secrets.env
  echo "WARN: Using secrets.env.example — configure K8S_SECRETS_ENV for production"
fi

if ! command -v kustomize >/dev/null 2>&1; then
  echo "ERROR: kustomize CLI required (install via setup-kustomize in CI)"
  exit 1
fi

kustomize edit set image "enterprise-backend=${BACKEND_IMAGE}"
kustomize edit set image "enterprise-frontend=${FRONTEND_IMAGE}"

echo "Prepared production overlay:"
echo "  backend:  ${BACKEND_IMAGE}"
echo "  frontend: ${FRONTEND_IMAGE}"
