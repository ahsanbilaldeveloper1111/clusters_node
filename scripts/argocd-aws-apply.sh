#!/usr/bin/env bash
# One-shot: install Argo CD on AWS EKS + bootstrap enterprise-app-aws GitOps Application.
#
# Prerequisites:
#   - terraform apply (VPC, EKS, RDS, ElastiCache, ECR, Secrets Manager)
#   - aws CLI + kubectl configured
#   - Git repo reachable by Argo (SSH deploy key or HTTPS token)
#
# Usage:
#   npm run argocd:aws:apply
#   AWS_REGION=us-east-1 AWS_EKS_CLUSTER_NAME=enterprise-app-production bash scripts/argocd-aws-apply.sh
#
# Env:
#   AWS_REGION              default us-east-1
#   AWS_EKS_CLUSTER_NAME    default enterprise-app-production
#   GIT_REPO_URL            override Application repo (passed to bootstrap)
#   SKIP_KUBECONFIG=true    skip aws eks update-kubeconfig
#   SKIP_INSTALL=true       skip Argo CD install (bootstrap only)
#   EXPOSE_ARGOCD_UI        default false on EKS (use port-forward)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_EKS_CLUSTER_NAME="${AWS_EKS_CLUSTER_NAME:-enterprise-app-production}"
EXPOSE_ARGOCD_UI="${EXPOSE_ARGOCD_UI:-false}"
SKIP_KUBECONFIG="${SKIP_KUBECONFIG:-false}"
SKIP_INSTALL="${SKIP_INSTALL:-false}"
ARGOCD_NAMESPACE="${ARGOCD_NAMESPACE:-argocd}"

die() { echo "ERROR: $*" >&2; exit 1; }

need() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' not found. Install it, then re-run."
}

echo "==> AWS Argo CD apply"
echo "    Region:  ${AWS_REGION}"
echo "    Cluster: ${AWS_EKS_CLUSTER_NAME}"
echo ""

need aws
need kubectl

echo "==> Checking AWS identity..."
aws sts get-caller-identity >/dev/null || die "AWS credentials not configured (aws sts get-caller-identity failed)"

if [[ "$SKIP_KUBECONFIG" != "true" ]]; then
  echo "==> Updating kubeconfig for EKS..."
  aws eks update-kubeconfig \
    --region "$AWS_REGION" \
    --name "$AWS_EKS_CLUSTER_NAME"
fi

echo "==> Verifying cluster access..."
kubectl get nodes || die "Cannot reach EKS API. Check cluster name/region and IAM."

if [[ "$SKIP_INSTALL" != "true" ]]; then
  echo "==> Installing Argo CD (EXPOSE_ARGOCD_UI=${EXPOSE_ARGOCD_UI})..."
  EXPOSE_ARGOCD_UI="$EXPOSE_ARGOCD_UI" bash "$ROOT/scripts/argocd-install.sh"
else
  echo "==> Skipping Argo CD install (SKIP_INSTALL=true)"
  kubectl get deployment argocd-server -n "$ARGOCD_NAMESPACE" >/dev/null \
    || die "Argo CD not installed. Re-run without SKIP_INSTALL=true"
fi

if [[ "${ARGOCD_BLUE_GREEN:-false}" == "true" ]]; then
  export ARGOCD_BLUE_GREEN=true
fi
echo "==> Bootstrapping AWS Application + app-secrets..."
# shellcheck disable=SC2090
AWS_REGION="$AWS_REGION" ARGOCD_BLUE_GREEN="${ARGOCD_BLUE_GREEN:-false}" bash "$ROOT/scripts/argocd-bootstrap-aws.sh"

echo ""
echo "==> Application status"
kubectl get application enterprise-app-aws -n "$ARGOCD_NAMESPACE" -o wide 2>/dev/null \
  || echo "(Application may still be registering — check again in a few seconds)"

echo ""
echo "=============================================="
echo " AWS Argo CD apply complete"
echo "=============================================="
echo ""
echo "UI (port-forward):"
echo "  kubectl port-forward svc/argocd-server -n ${ARGOCD_NAMESPACE} --address 0.0.0.0 8082:443"
echo "  Open: https://localhost:8082"
echo ""
echo "Admin password:"
echo "  kubectl -n ${ARGOCD_NAMESPACE} get secret argocd-initial-admin-secret \\"
echo "    -o jsonpath='{.data.password}' | base64 -d; echo"
echo ""
echo "Sync status:"
echo "  kubectl get application enterprise-app-aws -n ${ARGOCD_NAMESPACE}"
echo ""
echo "GitHub CD variables (recommended instead of DEPLOY_AWS_EKS):"
echo "  USE_ARGOCD_GITOPS_AWS=true"
echo "  PUSH_ECR=true"
echo "  Do NOT also set DEPLOY_AWS_EKS=true"
echo ""
echo "Private repo: add SSH deploy key to Argo CD (Settings → Repositories)."
echo "Docs: docs/ARGOCD.md (AWS GitOps section)"
