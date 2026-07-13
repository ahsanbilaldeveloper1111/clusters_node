#!/usr/bin/env bash
# Install Argo CD into the cluster (official stable manifest)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ARGOCD_VERSION="${ARGOCD_VERSION:-stable}"
ARGOCD_NAMESPACE="${ARGOCD_NAMESPACE:-argocd}"
INSTALL_URL="https://raw.githubusercontent.com/argoproj/argo-cd/${ARGOCD_VERSION}/manifests/install.yaml"

echo "Installing Argo CD (${ARGOCD_VERSION}) into namespace ${ARGOCD_NAMESPACE}..."

kubectl create namespace "$ARGOCD_NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

# Prior in-place LoadBalancer patch on argocd-server conflicts with upstream server-side apply
if kubectl get service argocd-server -n "$ARGOCD_NAMESPACE" &>/dev/null; then
  svc_type="$(kubectl get service argocd-server -n "$ARGOCD_NAMESPACE" -o jsonpath='{.spec.type}')"
  if [[ "$svc_type" == "LoadBalancer" ]]; then
    echo "Resetting argocd-server Service (remove old in-place LoadBalancer patch)..."
    kubectl delete service argocd-server -n "$ARGOCD_NAMESPACE"
  fi
fi

# Server-side apply avoids CRD annotation size limit on ApplicationSet (K8s 1.26+)
echo "Applying manifests (server-side apply)..."
kubectl apply --server-side --force-conflicts -n "$ARGOCD_NAMESPACE" -f "$INSTALL_URL"

echo "Waiting for Argo CD server..."
kubectl wait --for=condition=available deployment/argocd-server -n "$ARGOCD_NAMESPACE" --timeout=300s

if [[ "${EXPOSE_ARGOCD_UI:-true}" == "true" ]]; then
  echo "Exposing Argo CD UI (LoadBalancer 8082 → server HTTPS)..."
  kubectl apply -f k8s/argocd/argocd-server-external.yaml
else
  kubectl delete -f k8s/argocd/argocd-server-external.yaml --ignore-not-found
fi

echo ""
echo "Argo CD installed."
if [[ "${EXPOSE_ARGOCD_UI:-true}" == "true" ]]; then
  echo "  UI: https://localhost:8082 (LoadBalancer — port 8080 is used by Docker Compose frontend)"
else
  echo "  UI: kubectl port-forward svc/argocd-server -n ${ARGOCD_NAMESPACE} --address 0.0.0.0 8082:443"
  echo "  Then open: https://localhost:8082"
fi
echo ""
echo "  Initial admin password:"
echo "    kubectl -n ${ARGOCD_NAMESPACE} get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d; echo"
echo ""
echo "Next (generic cluster): bash scripts/argocd-bootstrap.sh"
echo "Next (AWS EKS):         npm run argocd:aws:apply   # or bash scripts/argocd-bootstrap-aws.sh"
