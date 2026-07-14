#!/usr/bin/env bash
# Shared helpers for Argo CD blue/green GitOps (AWS).
set -euo pipefail

GITOPS_BG_DIR="${GITOPS_BG_DIR:-k8s/overlays/blue-green-aws}"
ACTIVE_COLOR_FILE="${GITOPS_BG_DIR}/patches/active-color.yaml"
SERVICE_COLOR_FILE="${GITOPS_BG_DIR}/patches/service-color-selector.yaml"
REPLICAS_FILE="${GITOPS_BG_DIR}/patches/replicas-colors.yaml"

gitops_bg_active_color() {
  local c
  c="$(python3 -c "import re,sys; t=open(sys.argv[1]).read(); m=re.search(r'active:\s*(\S+)', t); print(m.group(1) if m else 'blue')" "$ACTIVE_COLOR_FILE")"
  c="${c//\"/}"
  c="${c//\'/}"
  if [[ "$c" != "blue" && "$c" != "green" ]]; then
    echo "blue"
    return
  fi
  echo "$c"
}

gitops_bg_other_color() {
  case "$1" in
    blue) echo green ;;
    green) echo blue ;;
    *)
      echo "Invalid color: $1" >&2
      exit 1
      ;;
  esac
}

# Set replicas for a color in replicas-colors.yaml (macOS/GNU sed compatible via python)
gitops_bg_set_replicas() {
  local color="$1"
  local replicas="$2"
  python3 - "$REPLICAS_FILE" "$color" "$replicas" <<'PY'
import sys, re
path, color, replicas = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(path).read()
# Split on --- documents and update matching Deployment names
parts = text.split("---")
out = []
for part in parts:
    if f"name: backend-{color}" in part or f"name: frontend-{color}" in part:
        part = re.sub(r"(replicas:\s*)\d+", rf"\g<1>{replicas}", part, count=1)
    out.append(part)
open(path, "w").write("---".join(out))
PY
}

gitops_bg_set_active() {
  local color="$1"
  python3 - "$ACTIVE_COLOR_FILE" "$SERVICE_COLOR_FILE" "$color" <<'PY'
import sys, re
active_file, svc_file, color = sys.argv[1], sys.argv[2], sys.argv[3]
active = open(active_file).read()
active = re.sub(r"(active:\s*)\S+", rf"\g<1>{color}", active, count=1)
open(active_file, "w").write(active)
svc = open(svc_file).read()
# Replace every app.kubernetes.io/color: <x> under selectors
svc = re.sub(
    r"(app\.kubernetes\.io/color:\s*)(blue|green)",
    rf"\g<1>{color}",
    svc,
)
open(svc_file, "w").write(svc)
PY
}
