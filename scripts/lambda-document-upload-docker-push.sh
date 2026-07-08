#!/usr/bin/env bash
# Build and push document-upload Lambda container image to ECR
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAMBDA_DIR="${ROOT}/lambda/document-upload"

AWS_REGION="${AWS_REGION:-us-east-1}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
ECR_REPOSITORY_URL="${ECR_REPOSITORY_URL:?ECR_REPOSITORY_URL required}"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is required"
  exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI is required"
  exit 1
fi

ECR_REGISTRY="${ECR_REPOSITORY_URL%%/*}"
IMAGE_URI="${ECR_REPOSITORY_URL}:${IMAGE_TAG}"

echo "Logging in to ECR: ${ECR_REGISTRY}"
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$ECR_REGISTRY"

echo "Building Lambda image (linux/amd64): ${IMAGE_URI}"
docker build \
  --platform linux/amd64 \
  -t "$IMAGE_URI" \
  -f "${LAMBDA_DIR}/Dockerfile" \
  "$LAMBDA_DIR"

echo "Pushing ${IMAGE_URI}"
docker push "$IMAGE_URI"

echo "Pushed ${IMAGE_URI}"
