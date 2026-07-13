#!/usr/bin/env bash
# Shared helpers for blue/green Kubernetes deploys.
set -euo pipefail

NS="${NS:-enterprise-app}"
OVERLAY="${OVERLAY:-k8s/overlays/blue-green}"

other_color() {
  case "$1" in
    blue) echo green ;;
    green) echo blue ;;
    *)
      echo "Invalid color: $1 (expected blue|green)" >&2
      exit 1
      ;;
  esac
}

active_color() {
  local from_cm from_svc
  from_cm="$(kubectl get configmap blue-green-active -n "$NS" -o jsonpath='{.data.active}' 2>/dev/null || true)"
  from_svc="$(kubectl get svc backend-service -n "$NS" -o jsonpath='{.spec.selector.app\.kubernetes\.io/color}' 2>/dev/null || true)"

  if [[ -n "$from_svc" ]]; then
    echo "$from_svc"
    return
  fi
  if [[ -n "$from_cm" ]]; then
    echo "$from_cm"
    return
  fi
  echo "blue"
}

require_cluster() {
  if ! kubectl cluster-info &>/dev/null; then
    echo "ERROR: Cannot reach Kubernetes API."
    exit 1
  fi
}

require_blue_green() {
  if ! kubectl get deployment backend-blue -n "$NS" &>/dev/null; then
    echo "Blue/green workloads not found. Bootstrap first:"
    echo "  npm run k8s:blue-green:bootstrap"
    exit 1
  fi
}
