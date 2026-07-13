# Blue/green deployment (Kubernetes)

This project’s **default** path is a Kubernetes **rolling update**.  
**Blue/green** is an optional overlay: two full app slots (blue + green); only one receives traffic via Service selectors.

## Concept

```mermaid
flowchart LR
  User[Browser] --> FE_SVC[frontend-service]
  FE_SVC -->|color=blue| FE_B[frontend-blue]
  FE_SVC -.->|not selected| FE_G[frontend-green]
  FE_B --> BE_SVC[backend-service]
  BE_SVC -->|color=blue| BE_B[backend-blue]
  BE_SVC -.->|not selected| BE_G[backend-green]
  BE_B --> PG[(Postgres)]
  BE_B --> RD[(Redis)]
```

| Slot | Role |
|------|------|
| **Blue** | One complete stack (frontend + backend Deployments) |
| **Green** | Identical stack, usually scaled to 0 until a release |
| **Active** | Color currently selected by `frontend-service` / `backend-service` |
| **Standby** | The other color — new version is deployed here first |

Cutover is a **selector flip** (milliseconds). Old pods stay until you scale them down (instant rollback if still running).

Postgres/Redis stay **shared** (not duplicated). Blue/green here is for the **stateless app tier**, not the database.

---

## Why not the default rolling update?

| Rolling update | Blue/green |
|----------------|------------|
| New pods replace old gradually | New version fully ready before any traffic |
| Brief mix of v1 + v2 | Instant switch; no mixed versions in live traffic |
| Rollback = roll forward to old image | Rollback = flip selector back (if old slot still up) |

---

## Files

| Path | Purpose |
|------|---------|
| `k8s/components/blue-green/` | Shared blue/green Deployments + active-color ConfigMap |
| `k8s/overlays/blue-green/` | Local overlay (on top of `local`) |
| `k8s/overlays/blue-green-production/` | Production/GHCR overlay (on top of `production`) |
| `patches/service-color-selector.yaml` | Services select `app.kubernetes.io/color` |
| `scripts/k8s-blue-green-*.sh` | Local bootstrap / deploy / switch / status |
| `scripts/k8s-cd-blue-green-*.sh` | CI/CD prepare + cluster deploy |

Pods keep `app.kubernetes.io/name: backend|frontend` so NetworkPolicies and PDBs still match. Extra label: `app.kubernetes.io/color: blue|green`.

---

## Quick start

```bash
# 1. Build images (same as normal local K8s)
npm run k8s:build

# 2. Install blue/green (replaces rolling backend/frontend Deployments)
npm run k8s:blue-green:bootstrap

# 3. Check which color is live
npm run k8s:blue-green:status
```

App URL (local LB): `http://localhost:8081`

### Ship a new version

```bash
# Build a new tag
IMAGE_TAG=local-v3 npm run k8s:build

# Deploy to standby only (traffic still on active)
npm run k8s:blue-green:deploy -- local-v3 local-v3

# Optional: probe standby backend
# kubectl port-forward -n enterprise-app deploy/backend-green 3001:3000
# curl http://localhost:3001/health

# Flip traffic to standby
npm run k8s:blue-green:switch
```

By default, switch **scales the previous color to 0**. Keep both up for faster rollback:

```bash
SCALE_DOWN_OLD=false npm run k8s:blue-green:switch
```

### Rollback

If the old color is still scaled up:

```bash
npm run k8s:blue-green:switch -- blue   # or green — the previous color
```

If it was scaled to 0, redeploy the old tag to standby, then switch:

```bash
npm run k8s:blue-green:deploy -- local-v2 local-v2
npm run k8s:blue-green:switch
```

---

## npm scripts

| Script | What it does |
|--------|----------------|
| `k8s:blue-green:bootstrap` | `kubectl apply -k` overlay; wait for DB jobs + active Deployments |
| `k8s:blue-green:deploy` | Set image + scale **inactive** slot; wait Ready |
| `k8s:blue-green:switch` | Patch Service selectors + ConfigMap; optional scale-down |
| `k8s:blue-green:status` | Show active color, Deployments, pods |
| `k8s:blue-green:manifests` | Print built YAML |

---

## How the switch works

Services normally matched only `app.kubernetes.io/name`. Blue/green adds color:

```yaml
selector:
  app.kubernetes.io/name: backend
  app.kubernetes.io/color: blue   # flipped to green on cutover
```

Nginx in the frontend still proxies to `backend-service:3000`. After the switch, that Service’s endpoints are only the new color’s pods — **no Ingress or DNS change**.

---

## Relationship to other overlays

| Overlay | Deploy style |
|---------|----------------|
| `local` / `production` / `aws-production` | Rolling update (default) |
| `blue-green` | Blue/green for local clusters |
| `blue-green-production` | Blue/green for GHCR / CD |

Do **not** run rolling `npm run k8s:deploy` / `DEPLOY_K8S` and blue/green on the same cluster without cleaning up — they fight over backend/frontend Deployment names.

To leave blue/green and return to rolling:

```bash
kubectl delete -k k8s/overlays/blue-green --ignore-not-found
# or: kubectl delete -k k8s/overlays/blue-green-production --ignore-not-found
npm run k8s:deploy
```

---

## CI/CD

**CI** (`ci.yml`) validates both `blue-green` and `blue-green-production` with `kubectl kustomize`.

**CD** (`cd.yml`) job **blue-green** (optional):

1. Publish images to GHCR  
2. `scripts/k8s-cd-blue-green-prepare.sh` — set image tags  
3. Upload artifact `k8s-blue-green-production-manifests`  
4. `scripts/k8s-cd-blue-green-deploy.sh` — bootstrap if needed → standby deploy → switch  

| Variable / input | Purpose |
|------------------|---------|
| `DEPLOY_BLUE_GREEN=true` | Auto-run on `main` |
| **deploy_blue_green** | Manual CD checkbox |
| **blue_green_switch** | Flip traffic after standby (default on) |
| `BLUE_GREEN_SWITCH=false` | Standby only (no cutover) |
| `BLUE_GREEN_SCALE_DOWN_OLD=false` | Keep previous color up |
| `BOOTSTRAP_BLUE_GREEN=false` | Require slots already installed |

Requires the same `KUBE_CONFIG` + `K8S_SECRETS_ENV` as rolling deploy. Details: [CI_CD.md](CI_CD.md).

---

## Limitations (intentional)

- **Shared DB/Redis** — schema migrations must stay backward-compatible across the cutover window.
- **No HPA** on color Deployments in this overlay (fixed replicas; keeps the demo simple).
- **AWS EKS** — use the same color-label pattern on `aws-production`, or run blue/green against a generic cluster with GHCR; dedicated `blue-green-aws` overlay is not included yet.
- **Not Argo Rollouts** — plain Deployments + Service selector; easy to learn, no CRDs.
