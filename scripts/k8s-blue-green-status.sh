#!/usr/bin/env bash
# Show blue/green slot status and which color is live.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=k8s-blue-green-lib.sh
source "$ROOT/scripts/k8s-blue-green-lib.sh"

require_cluster

if ! kubectl get deployment backend-blue -n "$NS" &>/dev/null; then
  echo "Blue/green not installed in namespace $NS."
  echo "  npm run k8s:blue-green:bootstrap"
  exit 1
fi

ACTIVE="$(active_color)"
INACTIVE="$(other_color "$ACTIVE")"

echo "Namespace:     $NS"
echo "Live (active): $ACTIVE"
echo "Standby:       $INACTIVE"
echo ""
echo "Services (selectors):"
kubectl get svc backend-service frontend-service -n "$NS" \
  -o custom-columns='NAME:.metadata.name,COLOR:.spec.selector.app\.kubernetes\.io/color,TYPE:.spec.type' 
echo ""
echo "Deployments:"
kubectl get deploy -n "$NS" \
  -l 'app.kubernetes.io/name in (backend,frontend)' \
  -o custom-columns='NAME:.metadata.name,COLOR:.metadata.labels.app\.kubernetes\.io/color,READY:.status.readyReplicas,DESIRED:.spec.replicas,IMAGE:.spec.template.spec.containers[0].image'
echo ""
echo "Pods:"
kubectl get pods -n "$NS" \
  -l 'app.kubernetes.io/name in (backend,frontend)' \
  -o wide
