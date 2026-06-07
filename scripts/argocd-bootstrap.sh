#!/usr/bin/env bash
# Bootstrap Argo CD Application + app secrets for enterprise-app
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ARGOCD_NAMESPACE="${ARGOCD_NAMESPACE:-argocd}"
APP_NAMESPACE="${APP_NAMESPACE:-enterprise-app}"
GITHUB_OWNER="${GITHUB_OWNER:-ahsanbilaldeveloper1111}"
GITHUB_REPO="${GITHUB_REPO:-clusters_node}"
GIT_REPO_URL="${GIT_REPO_URL:-git@github.com:ahsanbilaldeveloper1111/clusters_node.git}"
SECRETS_FILE="${SECRETS_FILE:-k8s/overlays/production/secrets.env}"

if [[ ! -f "$SECRETS_FILE" ]]; then
  if [[ -f k8s/overlays/local/secrets.env ]]; then
    echo "Creating $SECRETS_FILE from k8s/overlays/local/secrets.env (dev defaults)..."
    cp k8s/overlays/local/secrets.env "$SECRETS_FILE"
  elif [[ -f k8s/overlays/production/secrets.env.example ]]; then
    echo "Creating $SECRETS_FILE from secrets.env.example — edit before production use!"
    cp k8s/overlays/production/secrets.env.example "$SECRETS_FILE"
  else
    echo "ERROR: Missing $SECRETS_FILE"
    echo "  cp k8s/overlays/production/secrets.env.example $SECRETS_FILE"
    exit 1
  fi
fi

echo "Git repo: ${GIT_REPO_URL}"

echo "Creating namespace ${APP_NAMESPACE}..."
kubectl create namespace "$APP_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

echo "Creating app-secrets (outside Git — Argo ignoreDifferences)..."
kubectl create secret generic app-secrets \
  --from-env-file="$SECRETS_FILE" \
  -n "$APP_NAMESPACE" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Applying AppProject + Application..."
kubectl apply -f k8s/argocd/appproject.yaml
kubectl apply -f k8s/argocd/applications/enterprise-app.yaml

echo ""
echo "Bootstrap complete."
echo "  Sync status: kubectl get application enterprise-app -n ${ARGOCD_NAMESPACE}"
if [[ "${EXPOSE_ARGOCD_UI:-true}" == "true" ]]; then
  echo "  Argo UI:     https://localhost:8082 (LoadBalancer)"
else
  echo "  Argo UI:     kubectl port-forward svc/argocd-server -n ${ARGOCD_NAMESPACE} --address 0.0.0.0 8082:443"
fi
echo ""
echo "SSH repo: ensure Argo CD has deploy key for ${GIT_REPO_URL}"
echo "  Settings → Repositories → Connect repo (SSH)"
