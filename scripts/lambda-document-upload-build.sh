#!/usr/bin/env bash
# Build Lambda deployment package for document-upload
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAMBDA_DIR="${ROOT}/lambda/document-upload"

cd "$LAMBDA_DIR"
npm install
npm run zip

echo "Built ${LAMBDA_DIR}/function.zip"
