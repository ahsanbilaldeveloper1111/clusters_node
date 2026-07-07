#!/usr/bin/env bash
# Pull app secrets from AWS Secrets Manager into k8s/overlays/aws-production/secrets.env
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OVERLAY="${ROOT}/k8s/overlays/aws-production"
SECRET_NAME="${AWS_SECRET_NAME:-}"
AWS_REGION="${AWS_REGION:-us-east-1}"

if [[ -z "$SECRET_NAME" ]]; then
  PROJECT="${PROJECT_NAME:-enterprise-app}"
  ENV="${ENVIRONMENT:-production}"
  SECRET_NAME="${PROJECT}-${ENV}/app-secrets"
fi

if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI required"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq required"
  exit 1
fi

echo "Fetching secret: ${SECRET_NAME} (${AWS_REGION})"
SECRET_JSON="$(aws secretsmanager get-secret-value \
  --region "$AWS_REGION" \
  --secret-id "$SECRET_NAME" \
  --query SecretString \
  --output text)"

JWT_SECRET="$(echo "$SECRET_JSON" | jq -r '.JWT_SECRET')"
DATABASE_URL="$(echo "$SECRET_JSON" | jq -r '.DATABASE_URL')"
REDIS_URL="$(echo "$SECRET_JSON" | jq -r '.REDIS_URL')"

if [[ "$JWT_SECRET" == "null" || "$DATABASE_URL" == "null" || "$REDIS_URL" == "null" ]]; then
  echo "ERROR: Secret must contain JWT_SECRET, DATABASE_URL, and REDIS_URL"
  exit 1
fi

cat > "${OVERLAY}/secrets.env" <<EOF
JWT_SECRET=${JWT_SECRET}
DATABASE_URL=${DATABASE_URL}
REDIS_URL=${REDIS_URL}
EOF

chmod 600 "${OVERLAY}/secrets.env"
echo "Wrote ${OVERLAY}/secrets.env"
