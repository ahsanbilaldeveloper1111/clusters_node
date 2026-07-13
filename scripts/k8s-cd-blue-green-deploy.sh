#!/usr/bin/env bash
# CD: blue/green deploy to a cluster that already has (or will bootstrap) color slots.
#
# Env:
#   BACKEND_IMAGE / FRONTEND_IMAGE — required full image refs
#   BOOTSTRAP_BLUE_GREEN=true     — apply overlay if slots missing
#   BLUE_GREEN_SWITCH=true        — flip traffic after standby is ready (default true)
#   SCALE_DOWN_OLD=true           — scale previous color to 0 after switch
#   REPLICAS=2
#   OVERLAY=k8s/overlays/blue-green-production
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=k8s-blue-green-lib.sh
source "$ROOT/scripts/k8s-blue-green-lib.sh"

BACKEND_IMAGE="${BACKEND_IMAGE:?BACKEND_IMAGE required}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:?FRONTEND_IMAGE required}"
BOOTSTRAP_BLUE_GREEN="${BOOTSTRAP_BLUE_GREEN:-true}"
BLUE_GREEN_SWITCH="${BLUE_GREEN_SWITCH:-true}"
SCALE_DOWN_OLD="${SCALE_DOWN_OLD:-true}"
REPLICAS="${REPLICAS:-2}"
OVERLAY="${OVERLAY:-k8s/overlays/blue-green-production}"

require_cluster

if ! kubectl get deployment backend-blue -n "$NS" &>/dev/null; then
  if [[ "$BOOTSTRAP_BLUE_GREEN" != "true" ]]; then
    echo "Blue/green not installed and BOOTSTRAP_BLUE_GREEN!=true"
    exit 1
  fi
  echo "Bootstrapping blue/green from $OVERLAY ..."
  kubectl apply -k "$OVERLAY"
  kubectl delete job db-migrate db-seed -n "$NS" --ignore-not-found || true
  kubectl apply -k "$OVERLAY" 2>/dev/null || true
  kubectl wait --for=condition=available deployment/postgres -n "$NS" --timeout=300s || true
  kubectl wait --for=condition=complete job/db-migrate -n "$NS" --timeout=180s || true
  kubectl wait --for=condition=complete job/db-seed -n "$NS" --timeout=180s || true
  ACTIVE="$(active_color)"
  kubectl wait --for=condition=available "deployment/backend-${ACTIVE}" -n "$NS" --timeout=300s
  kubectl wait --for=condition=available "deployment/frontend-${ACTIVE}" -n "$NS" --timeout=300s
fi

require_blue_green

export BACKEND_IMAGE FRONTEND_IMAGE
bash "$ROOT/scripts/k8s-blue-green-deploy.sh" unused unused "$REPLICAS"

if [[ "$BLUE_GREEN_SWITCH" == "true" ]]; then
  export SCALE_DOWN_OLD
  bash "$ROOT/scripts/k8s-blue-green-switch.sh"
else
  echo "BLUE_GREEN_SWITCH=false — standby ready; run switch manually when ready."
fi

bash "$ROOT/scripts/k8s-blue-green-status.sh"
