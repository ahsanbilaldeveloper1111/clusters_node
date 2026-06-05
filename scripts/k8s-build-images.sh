#!/usr/bin/env bash
# Build Docker images tagged for the local Kubernetes overlay
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TAG="${IMAGE_TAG:-local-v2}"

echo "Building backend image..."
docker build -f docker/backend.Dockerfile -t "enterprise-backend:${TAG}" .

echo "Building frontend image (K8s nginx config)..."
docker build -f docker/frontend.k8s.Dockerfile -t "enterprise-frontend:${TAG}" .

echo "Done. Images: enterprise-backend:${TAG}, enterprise-frontend:${TAG}"
echo "For Minikube: eval \$(minikube docker-env) before running this script."
echo "For kind: kind load docker-image enterprise-backend:${TAG} enterprise-frontend:${TAG}"
