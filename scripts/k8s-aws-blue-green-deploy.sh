#!/usr/bin/env bash
# Local/one-shot: prepare ECR tags + blue/green deploy+switch on AWS EKS.
#
# Prerequisites: terraform apply, aws eks update-kubeconfig, images in ECR
#
# Usage:
#   export IMAGE_TAG=<sha-or-latest>
#   npm run k8s:aws:blue-green
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

AWS_REGION="${AWS_REGION:-us-east-1}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
PROJECT="${PROJECT_NAME:-enterprise-app}"
ENV="${ENVIRONMENT:-production}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"

if [[ -z "$AWS_ACCOUNT_ID" ]]; then
  AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
fi

ECR="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
export BACKEND_IMAGE="${ECR}/${PROJECT}-${ENV}/backend:${IMAGE_TAG}"
export FRONTEND_IMAGE="${ECR}/${PROJECT}-${ENV}/frontend-k8s:${IMAGE_TAG}"
export OVERLAY="k8s/overlays/blue-green-aws"
export SKIP_POSTGRES_WAIT=true
export BLUE_GREEN_SWITCH="${BLUE_GREEN_SWITCH:-true}"
export SCALE_DOWN_OLD="${SCALE_DOWN_OLD:-true}"
export BOOTSTRAP_BLUE_GREEN="${BOOTSTRAP_BLUE_GREEN:-true}"

echo "==> Preparing blue-green-aws (ECR tags + secrets)"
bash "$ROOT/scripts/k8s-cd-blue-green-aws-prepare.sh"

echo "==> Deploying blue/green on EKS"
bash "$ROOT/scripts/k8s-cd-blue-green-deploy.sh"
