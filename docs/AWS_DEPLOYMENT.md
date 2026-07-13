# AWS deployment — Terraform infrastructure + EKS application rollout

This guide covers deploying the enterprise app on **AWS EKS** with **RDS PostgreSQL** and **ElastiCache Redis**, using the `k8s/overlays/aws-production` overlay (no in-cluster Postgres/Redis).

## Architecture

```
Internet → AWS NLB → NGINX Ingress → Frontend (Nginx) → Backend (Node cluster)
                                                          ↓         ↓
                                                        RDS    ElastiCache
```

Terraform provisions: VPC, EKS, ECR, RDS, ElastiCache, Secrets Manager, NGINX Ingress.

Kubernetes deploys: backend, frontend, migrate Job, seed Job.

---

## Phase 1 — Terraform (infrastructure)

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit: aws_region, app_domain, sizing

terraform init
terraform plan
terraform apply
```

Save outputs:

```bash
terraform output configure_kubectl
terraform output ecr_backend_repository_url
terraform output ecr_frontend_repository_url
terraform output app_secrets_arn
```

Configure kubectl:

```bash
aws eks update-kubeconfig --region us-east-1 --name enterprise-app-production
kubectl get nodes
```

---

## Phase 2 — Push Docker images to ECR

```bash
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$ECR"

# Build locally (or use images from GHCR after CI)
docker compose build backend
docker build -f docker/frontend.k8s.Dockerfile -t frontend-k8s .

BACKEND_REPO=$(cd terraform && terraform output -raw ecr_backend_repository_url)
FRONTEND_REPO=$(cd terraform && terraform output -raw ecr_frontend_repository_url)

docker tag enterprise_backend:latest "${BACKEND_REPO}:latest"
docker tag frontend-k8s:latest "${FRONTEND_REPO}:latest"
docker push "${BACKEND_REPO}:latest"
docker push "${FRONTEND_REPO}:latest"
```

---

## Phase 3 — Sync secrets

Terraform stores `DATABASE_URL`, `REDIS_URL`, and `JWT_SECRET` in Secrets Manager.

```bash
bash scripts/k8s-aws-sync-secrets.sh
# Writes k8s/overlays/aws-production/secrets.env (gitignored via local file)
```

Or set `AWS_SECRET_NAME` explicitly:

```bash
export AWS_SECRET_NAME=enterprise-app-production/app-secrets
export AWS_REGION=us-east-1
bash scripts/k8s-aws-sync-secrets.sh
```

---

## Phase 4 — Kubernetes deploy (ordered sequence)

### Option A — Automated script (recommended)

```bash
export IMAGE_TAG=latest
bash scripts/k8s-aws-deploy.sh
```

### Option B — Manual step-by-step

The script mirrors this exact order:

| Step | Command | Why |
|------|---------|-----|
| 1 | `bash scripts/k8s-aws-prepare.sh` | Set ECR image tags + ensure `secrets.env` exists |
| 2 | `kubectl kustomize k8s/overlays/aws-production` | Validate manifests |
| 3 | `kubectl apply -k k8s/overlays/aws-production` | Create all resources |
| 4 | `kubectl delete job db-migrate db-seed -n enterprise-app --ignore-not-found` | Jobs are immutable — delete before re-run |
| 5 | `kubectl apply -k k8s/overlays/aws-production` | Recreate Jobs with current image |
| 6 | `kubectl wait --for=condition=complete job/db-migrate -n enterprise-app --timeout=300s` | Schema must exist before seed/backend |
| 7 | `kubectl wait --for=condition=complete job/db-seed -n enterprise-app --timeout=180s` | Demo users/data (optional if already seeded) |
| 8 | `kubectl rollout status deployment/backend -n enterprise-app --timeout=300s` | API ready |
| 9 | `kubectl rollout status deployment/frontend -n enterprise-app --timeout=300s` | Web UI ready |

**Why migrate before backend?** Backend pods expect tables from `database/init/` + migrations. RDS starts empty.

**Why delete Jobs first?** Kubernetes Job specs are immutable. Image or env changes require delete + re-apply.

---

## Phase 5 — DNS and TLS

1. Get NLB hostname:

   ```bash
   kubectl get svc -n ingress-nginx ingress-nginx-controller
   # or: terraform output ingress_nlb_hostname
   ```

2. Create a **CNAME** for `app.example.com` → NLB hostname.

3. Update `k8s/overlays/aws-production/patches/ingress-production.yaml` with your real domain.

4. (Optional) Install **cert-manager** for Let's Encrypt — the ingress patch already references `cert-manager.io/cluster-issuer`.

---

## aws-production overlay vs production

| | `overlays/production` | `overlays/aws-production` |
|--|----------------------|---------------------------|
| Postgres | In-cluster Deployment | **RDS** (Terraform) |
| Redis | In-cluster Deployment | **ElastiCache** (Terraform) |
| `DB_SSL` | `false` | `true` |
| `REDIS_URL` | ConfigMap → redis-service | Secret → ElastiCache |
| Backend init containers | wait-postgres, wait-redis | **none** |
| Migrate Job init | wait-postgres | **none** |
| NetworkPolicy egress | pod selectors | **VPC endpoints** (ports 5432, 6379) |

---

## Verify

```bash
kubectl get all -n enterprise-app
kubectl logs -n enterprise-app job/db-migrate
kubectl logs -n enterprise-app deployment/backend --tail=50

# Port-forward API
kubectl port-forward -n enterprise-app svc/backend-service 3000:3000
curl http://localhost:3000/health
```

**Login:** `admin@enterprise.local` / `Password123!` (after seed Job)

---

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `db-migrate` fails | `kubectl logs job/db-migrate` — RDS security group, `DATABASE_URL`, `DB_SSL=true` |
| Backend CrashLoop | `kubectl logs deployment/backend` — JWT_SECRET, Redis TLS URL |
| ImagePullBackOff | ECR push done? Node IAM has ECR pull policy (Terraform attaches it) |
| Ingress no hostname | `kubectl get svc -n ingress-nginx` — wait for AWS NLB provisioning |
| Redis errors | `REDIS_URL` must use `rediss://` with auth token from Secrets Manager |

---

## npm scripts

```bash
npm run k8s:aws:prepare   # ECR tags + secrets
npm run k8s:aws:deploy    # Full ordered rollout
npm run k8s:aws:manifests # Preview rendered YAML
npm run k8s:aws:sync-secrets
```

## GitHub Actions (CD)

Set repository **Settings → Secrets and variables → Actions**:

| Variable | Purpose |
|----------|---------|
| `PUSH_ECR` | `true` — mirror GHCR images to ECR on each CD run |
| `DEPLOY_AWS_EKS` | `true` — auto-deploy to EKS on push to `main` |
| `AWS_REGION` | e.g. `us-east-1` |
| `AWS_EKS_CLUSTER_NAME` | e.g. `enterprise-app-production` |

| Secret | Purpose |
|--------|---------|
| `AWS_ROLE_ARN` | IAM role for GitHub OIDC (recommended) |
| `K8S_AWS_SECRETS_ENV` | Optional — full `secrets.env`; else read from Secrets Manager |

Or run **Actions → CD → Run workflow** with **deploy_aws_eks** or **gitops_commit_aws** checked.

### Argo CD GitOps (recommended for AWS production)

```bash
npm run argocd:aws:apply
# Sets kubeconfig, installs Argo CD, bootstraps enterprise-app-aws + secrets
```

Or step-by-step:

```bash
EXPOSE_ARGOCD_UI=false bash scripts/argocd-install.sh
bash scripts/argocd-bootstrap-aws.sh
```

Set `USE_ARGOCD_GITOPS_AWS=true` + `PUSH_ECR=true` — CD commits ECR tags to Git, Argo CD syncs EKS.

### Blue/green on AWS EKS (optional)

Instead of rolling `DEPLOY_AWS_EKS`:

```bash
export IMAGE_TAG=<ecr-sha>
npm run k8s:aws:blue-green
```

Or set `DEPLOY_BLUE_GREEN_AWS=true` in GitHub Actions (see [BLUE_GREEN.md](BLUE_GREEN.md)).

See [ARGOCD.md](ARGOCD.md).

See [ARGOCD.md](ARGOCD.md) and [CI_CD.md](CI_CD.md).

---

## Tear down

```bash
kubectl delete -k k8s/overlays/aws-production --ignore-not-found
cd terraform && terraform destroy
```
