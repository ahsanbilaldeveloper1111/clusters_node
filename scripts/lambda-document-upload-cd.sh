#!/usr/bin/env bash
# CD: build Lambda Docker image, push to ECR, update Lambda function
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

AWS_REGION="${AWS_REGION:-us-east-1}"
PROJECT_NAME="${PROJECT_NAME:-enterprise-app}"
ENVIRONMENT="${ENVIRONMENT:-production}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-}"

if [[ -z "$AWS_ACCOUNT_ID" ]]; then
  AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
fi

ECR_REPOSITORY_NAME="${PROJECT_NAME}-${ENVIRONMENT}/document-upload-lambda"
ECR_REPOSITORY_URL="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPOSITORY_NAME}"
LAMBDA_FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-${PROJECT_NAME}-${ENVIRONMENT}-document-upload}"
IMAGE_URI="${ECR_REPOSITORY_URL}:${IMAGE_TAG}"

echo "Ensuring ECR repository exists: ${ECR_REPOSITORY_NAME}"
if ! aws ecr describe-repositories --region "$AWS_REGION" --repository-names "$ECR_REPOSITORY_NAME" >/dev/null 2>&1; then
  echo "Creating ECR repository (run terraform apply to manage via IaC)"
  aws ecr create-repository --region "$AWS_REGION" --repository-name "$ECR_REPOSITORY_NAME" >/dev/null
fi

export ECR_REPOSITORY_URL IMAGE_TAG AWS_REGION
bash "${ROOT}/scripts/lambda-document-upload-docker-push.sh"

echo "Updating Lambda function: ${LAMBDA_FUNCTION_NAME}"
if ! aws lambda get-function --region "$AWS_REGION" --function-name "$LAMBDA_FUNCTION_NAME" >/dev/null 2>&1; then
  echo "::warning::Lambda function ${LAMBDA_FUNCTION_NAME} not found — run 'terraform apply' with enable_documents_lambda=true first"
  exit 0
fi

aws lambda update-function-code \
  --region "$AWS_REGION" \
  --function-name "$LAMBDA_FUNCTION_NAME" \
  --image-uri "$IMAGE_URI"

echo "Waiting for Lambda update..."
aws lambda wait function-updated-v2 \
  --region "$AWS_REGION" \
  --function-name "$LAMBDA_FUNCTION_NAME"

echo "Lambda deployed: ${IMAGE_URI}"
