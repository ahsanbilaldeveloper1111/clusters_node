#!/usr/bin/env bash
# Update k8s/overlays/gitops image tags after CD push (GitOps flow)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GITOPS_KUSTOMIZATION="${ROOT}/k8s/overlays/gitops/kustomization.yaml"

REGISTRY="${REGISTRY:-ghcr.io}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY required}"
IMAGE_TAG="${IMAGE_TAG:?IMAGE_TAG required}"

BACKEND_IMAGE="${REGISTRY}/${GITHUB_REPOSITORY}/backend"
FRONTEND_IMAGE="${REGISTRY}/${GITHUB_REPOSITORY}/frontend-k8s"

if ! command -v kustomize >/dev/null 2>&1; then
  echo "ERROR: kustomize required"
  exit 1
fi

cd "${ROOT}/k8s/overlays/gitops"

kustomize edit set image "enterprise-backend=${BACKEND_IMAGE}:${IMAGE_TAG}"
kustomize edit set image "enterprise-frontend=${FRONTEND_IMAGE}:${IMAGE_TAG}"

echo "Updated ${GITOPS_KUSTOMIZATION}:"
grep -A2 "name: enterprise" kustomization.yaml || cat kustomization.yaml
