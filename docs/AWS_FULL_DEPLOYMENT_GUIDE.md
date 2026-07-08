# AWS Full Deployment Guide — Terraform + CI/CD

This document explains **both** ways to deploy this project on AWS:

1. **Terraform** — creates AWS infrastructure (VPC, EKS, RDS, ElastiCache, ECR, Secrets Manager, Ingress)
2. **CI/CD (GitHub Actions)** — builds app code, pushes Docker images, deploys to EKS

They work together: **Terraform first**, then **CI/CD** (or manual scripts) deploys the application.

---

## Big picture

```mermaid
flowchart TB
    subgraph Phase1["Phase 1 — Terraform (one-time / infra changes)"]
        TF[terraform apply]
        TF --> VPC[VPC + subnets + NAT]
        TF --> EKS[EKS cluster + nodes]
        TF --> RDS[(RDS PostgreSQL)]
        TF --> Redis[(ElastiCache Redis)]
        TF --> ECR[ECR repositories]
        TF --> SM[Secrets Manager]
        TF --> NLB[NGINX Ingress + NLB]
    end

    subgraph Phase2["Phase 2 — CI/CD (every code push)"]
        CI[CI on PR/push]
        CD[CD on main]
        CI --> Build[Build + validate]
        CD --> GHCR[Push GHCR]
        CD --> Mirror[Mirror to ECR]
        CD --> Deploy[kubectl or Argo CD]
        Deploy --> App[backend + frontend on EKS]
    end

    Phase1 --> Phase2
    App --> RDS
    App --> Redis
    Mirror --> ECR
    Deploy --> ECR
    App --> SM
```

| Phase | Who runs it | What it creates |
|-------|-------------|-----------------|
| **Terraform** | You (locally or in a pipeline) | AWS infrastructure |
| **CI** | GitHub on every PR/push | Validates code — **no deploy** |
| **CD** | GitHub on `main` / tags | Builds images + optional deploy to EKS |

---

# Part 1 — Terraform deployment (infrastructure)

## What Terraform does

Terraform reads `.tf` files in `terraform/` and calls AWS APIs to create resources. It stores state in `terraform.tfstate` so it knows what already exists.

**Terraform does NOT:**
- Build your Node.js app
- Run database migrations
- Deploy Kubernetes manifests (backend/frontend pods)

**Terraform DOES:**
- Create the cluster and network where the app runs
- Create RDS and Redis the app connects to
- Create ECR where CI pushes images
- Store connection strings in Secrets Manager

---

## Step-by-step: Terraform execution

### Step 0 — Prerequisites

```bash
# Install tools
# - Terraform >= 1.5
# - AWS CLI configured: aws configure

cd terraform
cp terraform.tfvars.example terraform.tfvars
# Edit: aws_region, app_domain, instance sizes
```

### Step 1 — `terraform init`

**File:** `terraform/versions.tf`

```hcl
terraform {
  required_providers {
    aws        = { source = "hashicorp/aws", version = "~> 5.0" }
    kubernetes = { source = "hashicorp/kubernetes", version = "~> 2.30" }
    helm       = { source = "hashicorp/helm", version = "~> 2.14" }
    random     = { source = "hashicorp/random", version = "~> 3.6" }
  }
}
```

**What happens:**
- Downloads provider plugins (AWS, Kubernetes, Helm, Random)
- Downloads modules: `terraform-aws-modules/vpc`, `terraform-aws-modules/eks`
- Links local modules: `modules/ecr`, `modules/rds`, `modules/elasticache`

**No AWS resources created yet.**

---

### Step 2 — Load variables

**File:** `terraform/variables.tf` + `terraform.tfvars`

Example values:

```hcl
aws_region              = "us-east-1"
project_name            = "enterprise-app"
environment             = "production"
eks_node_desired_size   = 2
db_instance_class       = "db.t3.micro"
```

**Computed local:**

```hcl
name_prefix = "enterprise-app-production"   # project + environment
azs         = ["us-east-1a", "us-east-1b"]  # first 2 AZs in region
```

---

### Step 3 — Create VPC (network)

**File:** `terraform/main.tf` → `module "vpc"`

```hcl
module "vpc" {
  source = "terraform-aws-modules/vpc/aws"
  cidr   = "10.0.0.0/16"
  azs    = local.azs

  private_subnets = ["10.0.0.0/20", "10.0.1.0/20"]   # EKS, RDS, Redis
  public_subnets  = ["10.0.8.0/20", "10.0.9.0/20"]   # NAT, load balancers

  enable_nat_gateway = true
  single_nat_gateway = true   # cost saving: one NAT for all private subnets
}
```

**Why each piece:**

| Resource | Purpose |
|----------|---------|
| **VPC** | Isolated network for all AWS resources |
| **Public subnets** | Internet-facing load balancers, NAT gateway |
| **Private subnets** | EKS nodes, RDS, Redis — not directly on internet |
| **NAT Gateway** | Lets private subnets pull Docker images from ECR/internet |
| **Subnet tags** | Tell EKS where to place load balancers |

**Dependency:** None (runs first).

---

### Step 4 — Create EKS cluster

**File:** `terraform/main.tf` → `module "eks"`

```hcl
module "eks" {
  cluster_name    = "enterprise-app-production"
  cluster_version = "1.29"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets   # nodes in private subnets

  cluster_endpoint_public_access = true   # kubectl works from your laptop

  eks_managed_node_groups = {
    app = {
      instance_types = ["t3.medium"]
      desired_size   = 2
      min_size       = 1
      max_size       = 4
    }
  }
}
```

**What gets created:**
- EKS control plane (Kubernetes API)
- 2 EC2 worker nodes (`t3.medium`)
- IAM roles for cluster and nodes
- Security groups for cluster ↔ nodes traffic

**Outputs used later:**
- `cluster_endpoint` — Kubernetes API URL
- `cluster_security_group_id` — RDS/Redis firewall rules
- `iam_role_name` — attach ECR + Secrets Manager policies

**Dependency:** Needs VPC.

**Time:** ~10–15 minutes (slowest step).

---

### Step 5 — Create ECR repositories

**File:** `terraform/modules/ecr/main.tf`

```hcl
resource "aws_ecr_repository" "backend" {
  name = "enterprise-app-production/backend"
}

resource "aws_ecr_repository" "frontend" {
  name = "enterprise-app-production/frontend-k8s"
}
```

**Also creates:**
- Lifecycle policy (keep last 10 images)
- IAM policy so EKS nodes can `docker pull` from ECR

**Why:** CD pipeline pushes images here; EKS pods pull from here.

**Dependency:** Needs EKS node IAM role name.

---

### Step 6 — Create RDS PostgreSQL

**File:** `terraform/modules/rds/main.tf`

```hcl
resource "random_password" "db_password" { length = 32 }

resource "aws_db_instance" "postgres" {
  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.t3.micro"
  db_name        = "enterprise_db"
  username       = "app_user"
  password       = random_password.db_password.result

  publicly_accessible    = false
  vpc_security_group_ids = [aws_security_group.rds.id]
  storage_encrypted      = true
}
```

**Security group rule:** Allow port **5432** only from EKS security groups.

**Connection string built in main.tf:**

```hcl
database_url = "postgresql://app_user:<password>@<rds-host>:5432/enterprise_db?sslmode=require"
```

**Why `sslmode=require`:** RDS enforces TLS; app sets `DB_SSL=true` in K8s ConfigMap.

**Dependency:** Needs VPC + EKS security groups + random password.

---

### Step 7 — Create ElastiCache Redis

**File:** `terraform/modules/elasticache/main.tf`

```hcl
resource "aws_elasticache_replication_group" "redis" {
  engine_version             = "7.1"
  node_type                  = "cache.t3.micro"
  transit_encryption_enabled = true
  auth_token                 = random_password.redis_auth.result
}
```

**Connection string:**

```hcl
redis_url = "rediss://:<token>@<redis-host>:6379"
```

**Note:** `rediss://` = Redis over TLS (required when transit encryption is on).

**Dependency:** Needs VPC + EKS security groups.

---

### Step 8 — Store secrets in Secrets Manager

**File:** `terraform/main.tf`

```hcl
resource "aws_secretsmanager_secret_version" "app" {
  secret_string = jsonencode({
    DATABASE_URL = local.database_url
    REDIS_URL    = local.redis_url
    JWT_SECRET   = local.jwt_secret
  })
}
```

**IAM:** EKS nodes get `secretsmanager:GetSecretValue` on this secret.

**Used by:** `scripts/k8s-aws-sync-secrets.sh` → writes `k8s/overlays/aws-production/secrets.env` → K8s `app-secrets`.

**Dependency:** Needs RDS endpoint + Redis endpoint (created after Step 6 & 7).

---

### Step 9 — Install NGINX Ingress (Helm)

**File:** `terraform/main.tf` → `helm_release.ingress_nginx`

```hcl
resource "helm_release" "ingress_nginx" {
  chart = "ingress-nginx"
  set {
    name  = "controller.service.annotations.service\\.beta\\.kubernetes\\.io/aws-load-balancer-type"
    value = "nlb"
  }
  set {
    name  = "controller.service.annotations.service\\.beta\\.kubernetes\\.io/aws-load-balancer-scheme"
    value = "internet-facing"
  }
}
```

**What happens:**
- Helm connects to EKS (using Kubernetes provider + AWS auth token)
- Installs NGINX Ingress Controller
- AWS creates a **Network Load Balancer** (NLB)
- Users hit NLB → Ingress → frontend Service → backend Service

**Dependency:** Needs EKS cluster running.

---

### Step 10 — Terraform outputs

**File:** `terraform/outputs.tf`

After `terraform apply`:

```bash
terraform output configure_kubectl
# aws eks update-kubeconfig --region us-east-1 --name enterprise-app-production

terraform output ecr_backend_repository_url
terraform output app_secrets_arn
terraform output ingress_nlb_hostname
```

---

### Terraform commands summary

```bash
cd terraform
terraform init          # download providers/modules
terraform plan          # preview changes
terraform apply         # create AWS resources (~20-35 min first time)
terraform output        # show URLs, cluster name, etc.
terraform destroy       # tear down everything (careful!)
```

---

# Part 2 — CI/CD deployment (application)

## CI vs CD

| Workflow | File | Trigger | Deploys? |
|----------|------|---------|----------|
| **CI** | `.github/workflows/ci.yml` | PR + push to main/develop | **No** — only validates |
| **CD** | `.github/workflows/cd.yml` | Push to main + tags | **Optional** — builds + deploys |

---

## Part 2A — CI workflow (validation only)

**Trigger:** Every push/PR to `main`, `master`, `develop`.

```yaml
on:
  push:
    branches: [main, master, develop]
  pull_request:
    branches: [main, master, develop]
```

### CI Job 1: `build`

**Steps explained:**

| Step | Code | Purpose |
|------|------|---------|
| Checkout | `actions/checkout@v4` | Clone repo |
| Setup Node | `node-version: "20"` | Match `package.json` engines |
| Install | `npm install` | Install monorepo deps |
| Build backend | `npm run build -w backend` | Compile TypeScript → `backend/dist` |
| Build frontend | `npm run build -w frontend` | Vite build → `frontend/dist` |
| Validate K8s | `kubectl kustomize k8s/overlays/...` | Ensure manifests render without error |

**K8s validation (key part for AWS):**

```bash
# Production overlay (GHCR images)
cp k8s/overlays/production/secrets.env.example k8s/overlays/production/secrets.env
GITHUB_REPOSITORY="${{ github.repository }}" IMAGE_TAG=ci-test bash scripts/k8s-cd-prepare.sh
kubectl kustomize k8s/overlays/production

# AWS overlay (ECR images, no in-cluster Postgres)
cp k8s/overlays/aws-production/secrets.env.example k8s/overlays/aws-production/secrets.env
AWS_ACCOUNT_ID=123456789012 IMAGE_TAG=ci-test bash scripts/k8s-aws-prepare.sh
kubectl kustomize k8s/overlays/aws-production

# Argo CD AWS GitOps overlay
AWS_ACCOUNT_ID=123456789012 IMAGE_TAG=ci-test bash scripts/argocd-update-gitops-aws-images.sh
kubectl kustomize k8s/overlays/gitops-aws
```

**Why fake `AWS_ACCOUNT_ID`?** CI has no real AWS account; it only checks that Kustomize renders valid YAML.

---

### CI Job 2: `database`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
```

**Steps:**
1. Start Postgres 16 as a GitHub Actions service container
2. `npm run db:migrate -w backend` — run SQL migrations
3. `npm run db:seed -w backend` — insert demo users

**Proves:** Database layer works before merge.

---

### CI Job 3: `docker`

```yaml
- uses: docker/build-push-action@v6
  with:
    file: docker/backend.Dockerfile
    push: false    # CI does NOT push — only builds
    tags: enterprise-backend:ci
```

Builds 3 images locally (no registry push):
- `backend` — Node.js API
- `frontend` — Compose/nginx
- `frontend-k8s` — K8s/nginx

---

### CI Job 4: `terraform`

```bash
terraform fmt -check -recursive   # code style
terraform init -backend=false     # no remote state needed in CI
terraform validate                # syntax + provider checks
```

**Proves:** Infrastructure code is valid before merge.

---

## Part 2B — CD workflow (build + deploy)

**Trigger:** Push to `main`/`master`, version tags, or manual `workflow_dispatch`.

### CD overview — 5 jobs

```mermaid
flowchart LR
    publish[publish → GHCR]
    ecr[ecr → mirror ECR]
    k8s[kubernetes → generic K8s]
    aws[aws-kubernetes → EKS]
    gitops[gitops → Argo CD commit]

    publish --> ecr
    publish --> k8s
    publish --> aws
    publish --> gitops
    ecr --> aws
    ecr --> gitops
```

---

### CD Job 1: `publish` — Build and push to GHCR

**Matrix strategy** — builds 3 images in parallel:

```yaml
strategy:
  matrix:
    include:
      - dockerfile: docker/backend.Dockerfile
        image: backend
      - dockerfile: docker/frontend.Dockerfile
        image: frontend
      - dockerfile: docker/frontend.k8s.Dockerfile
        image: frontend-k8s
```

**Login to GHCR:**

```yaml
- uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}
```

**Image tags generated:**

```yaml
tags: |
  type=sha,prefix=                    # ghcr.io/owner/repo/backend:abc123def
  type=raw,value=latest,enable=...    # ghcr.io/owner/repo/backend:latest
```

**Result:** Every `main` push produces images tagged with git SHA + `latest`.

---

### CD Job 2: `ecr` — Mirror GHCR → Amazon ECR

**Runs when:**

```yaml
if: vars.PUSH_ECR == 'true' ||
    vars.DEPLOY_AWS_EKS == 'true' ||
    vars.USE_ARGOCD_GITOPS_AWS == 'true' ||
    inputs.deploy_aws_eks == true ||
    inputs.gitops_commit_aws == true
```

**Steps:**

1. **AWS credentials** — OIDC role or access keys
2. **Pull from GHCR** — images built in `publish` job
3. **Push to ECR** — repos created by Terraform

```bash
BACKEND_GHCR="ghcr.io/owner/repo/backend:${SHA}"
BACKEND_ECR="${ACCOUNT}.dkr.ecr.us-east-1.amazonaws.com/enterprise-app-production/backend:${SHA}"

docker pull "${BACKEND_GHCR}"
docker tag "${BACKEND_GHCR}" "${BACKEND_ECR}"
docker push "${BACKEND_ECR}"
```

**Why mirror?** Terraform creates ECR in your AWS account; EKS nodes pull from ECR (same account, IAM auth). GHCR is the CI build cache; ECR is the runtime registry on AWS.

---

### CD Job 3: `aws-kubernetes` — Deploy app to EKS (kubectl)

**Runs when:** `DEPLOY_AWS_EKS=true` or manual **deploy_aws_eks** checked.

**Needs:** `publish` + `ecr` jobs succeeded.

#### Step-by-step inside the job

**1. Configure AWS + kubectl**

```bash
aws eks update-kubeconfig --region us-east-1 --name enterprise-app-production
kubectl get nodes
```

Uses IAM credentials — no `KUBE_CONFIG` secret needed for EKS.

**2. Write secrets**

```bash
# Option A: GitHub secret K8S_AWS_SECRETS_ENV (full secrets.env text)
# Option B: scripts/k8s-aws-sync-secrets.sh (reads Terraform Secrets Manager)
```

**Script `k8s-aws-sync-secrets.sh`:**

```bash
SECRET_JSON=$(aws secretsmanager get-secret-value \
  --secret-id enterprise-app-production/app-secrets \
  --query SecretString --output text)

# Writes k8s/overlays/aws-production/secrets.env:
# JWT_SECRET=...
# DATABASE_URL=postgresql://app_user:...@rds-host:5432/enterprise_db?sslmode=require
# REDIS_URL=rediss://:token@redis-host:6379
```

**3. Set ECR image tags in Kustomize**

**Script `k8s-aws-prepare.sh`:**

```bash
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
BACKEND_IMAGE="${ECR_REGISTRY}/enterprise-app-production/backend:${IMAGE_TAG}"

kustomize edit set image "enterprise-backend=${BACKEND_IMAGE}"
kustomize edit set image "enterprise-frontend=${FRONTEND_IMAGE}"
```

**4. Deploy with ordered rollout**

**Script `k8s-aws-deploy.sh`:**

| Step | Command | Why |
|------|---------|-----|
| 1 | `k8s-aws-prepare.sh` | ECR tags + secrets |
| 2 | `kubectl kustomize` | Validate YAML |
| 3 | `kubectl apply -k aws-production` | Create all resources |
| 4 | `kubectl delete job db-migrate db-seed` | Jobs are immutable in K8s |
| 5 | `kubectl apply -k aws-production` | Recreate jobs |
| 6 | Wait `job/db-migrate` | Create tables in RDS |
| 7 | Wait `job/db-seed` | Demo data |
| 8 | Wait `deployment/backend` | API ready |
| 9 | Wait `deployment/frontend` | UI ready |

---

### What `k8s/overlays/aws-production` deploys

**File:** `k8s/overlays/aws-production/kustomization.yaml`

```yaml
resources:
  - ../../base                    # all base manifests

secretGenerator:
  - name: app-secrets
    envs:
      - secrets.env               # DATABASE_URL, REDIS_URL, JWT_SECRET

patches:
  - delete-in-cluster-datastores  # REMOVE postgres + redis pods
  - backend-aws                   # no wait-postgres init; REDIS_URL from secret
  - configmap-aws                 # DB_SSL=true
  - networkpolicy-aws             # egress to RDS/Redis ports
```

**Compared to base `k8s/base/`:**

| Resource | Base (local) | aws-production |
|----------|--------------|----------------|
| Postgres pod | Yes | **Removed** — use RDS |
| Redis pod | Yes | **Removed** — use ElastiCache |
| Backend init | wait-postgres, wait-redis | **None** |
| DB_SSL | false | **true** |
| Images | local tags | **ECR URLs** |

---

### CD Job 4: `gitops` — Argo CD (Git-driven deploy)

**Alternative to `aws-kubernetes`**. Use **one or the other**, not both.

**Runs when:** `USE_ARGOCD_GITOPS_AWS=true` or manual **gitops_commit_aws**.

**Flow:**

```
CD → ECR mirror → argocd-update-gitops-aws-images.sh
    → git commit k8s/overlays/gitops-aws/kustomization.yaml
    → git push
    → Argo CD on EKS detects change
    → Argo syncs cluster automatically
```

**Script `argocd-update-gitops-aws-images.sh`:**

```bash
BACKEND_IMAGE="${ECR_REGISTRY}/enterprise-app-production/backend:${IMAGE_TAG}"
kustomize edit set image "enterprise-backend=${BACKEND_IMAGE}:${IMAGE_TAG}"
# commits to gitops-aws/kustomization.yaml
```

**Argo Application:** `k8s/argocd/applications/enterprise-app-aws.yaml`

```yaml
spec:
  source:
    path: k8s/overlays/gitops-aws    # same patches as aws-production, no secrets in Git
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

**One-time bootstrap:**

```bash
bash scripts/argocd-install.sh
bash scripts/argocd-bootstrap-aws.sh   # creates app-secrets from Secrets Manager
```

---

# Part 3 — How Terraform + CI/CD connect

## Complete timeline (first deployment)  3.0

| Order | Action | Tool |
|-------|--------|------|
| 1 | Create VPC, EKS, RDS, Redis, ECR, Secrets | `terraform apply` |
| 2 | Configure kubectl | `aws eks update-kubeconfig` |
| 3 | (Optional) Install Argo CD | `argocd-install.sh` + `argocd-bootstrap-aws.sh` |
| 4 | Set GitHub vars: `PUSH_ECR`, `DEPLOY_AWS_EKS` or `USE_ARGOCD_GITOPS_AWS` | GitHub Settings |
| 5 | Set GitHub secrets: `AWS_ROLE_ARN` | GitHub Settings |
| 6 | Push code to `main` | Git |
| 7 | CD builds images → ECR → deploys EKS | GitHub Actions |
| 8 | Point DNS to NLB hostname | Route 53 / your DNS |
| 9 | App live | — |

## Complete timeline (every code push after setup)

```
git push main
  → CI (on PR: build, test, validate — no deploy)
  → CD publish (GHCR)
  → CD ecr (mirror to ECR)
  → CD aws-kubernetes OR gitops (deploy)
  → App updated on EKS
```

---

# Part 4 — Choose your AWS deploy mode

| Mode | GitHub variable | What deploys | Best for |
|------|-----------------|--------------|----------|
| **kubectl CD** | `DEPLOY_AWS_EKS=true` | CD runs `k8s-aws-deploy.sh` | Simple CI-driven deploy |
| **Argo CD GitOps** | `USE_ARGOCD_GITOPS_AWS=true` + `PUSH_ECR=true` | Argo syncs from `gitops-aws` | Production, rollback via Git |

**Do not enable both** `DEPLOY_AWS_EKS` and `USE_ARGOCD_GITOPS_AWS`.

---

# Part 5 — GitHub configuration reference

## Variables (Settings → Actions → Variables)

| Variable | Example | Used by |
|----------|---------|---------|
| `AWS_REGION` | `us-east-1` | ECR, EKS, Secrets Manager |
| `AWS_EKS_CLUSTER_NAME` | `enterprise-app-production` | `aws eks update-kubeconfig` |
| `PROJECT_NAME` | `enterprise-app` | ECR repo path |
| `ENVIRONMENT` | `production` | ECR repo path |
| `PUSH_ECR` | `true` | Mirror images to ECR |
| `DEPLOY_AWS_EKS` | `true` | Auto kubectl deploy |
| `USE_ARGOCD_GITOPS_AWS` | `true` | Commit ECR tags to Git for Argo |

## Secrets (Settings → Actions → Secrets)

| Secret | Purpose |
|--------|---------|
| `AWS_ROLE_ARN` | OIDC — recommended |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | Alternative to OIDC |
| `K8S_AWS_SECRETS_ENV` | Optional — skip Secrets Manager sync |

---

# Part 6 — Key files map

```
terraform/
├── main.tf              # VPC, EKS, RDS, Redis, Secrets, Ingress
├── variables.tf         # Inputs (region, sizing)
├── outputs.tf           # Cluster name, ECR URLs, next steps
└── modules/
    ├── ecr/             # Container registry
    ├── rds/             # PostgreSQL
    └── elasticache/     # Redis

.github/workflows/
├── ci.yml               # Validate on PR (no deploy)
└── cd.yml               # Build + push + optional AWS deploy

k8s/overlays/
├── aws-production/      # kubectl deploy (has secretGenerator)
└── gitops-aws/          # Argo CD deploy (secrets outside Git)

scripts/
├── k8s-aws-sync-secrets.sh      # Secrets Manager → secrets.env
├── k8s-aws-prepare.sh           # ECR image tags in Kustomize
├── k8s-aws-deploy.sh            # Ordered kubectl rollout
├── argocd-bootstrap-aws.sh      # One-time Argo + secrets setup
└── argocd-update-gitops-aws-images.sh  # CD commits ECR tags to Git
```

---

# Part 7 — Troubleshooting

| Problem | Check |
|---------|--------|
| Terraform fails on EKS | IAM permissions, region limits |
| `ecr` job skipped | Set `PUSH_ECR=true` or `DEPLOY_AWS_EKS=true` |
| `aws-kubernetes` skipped | Needs `ecr` success + `DEPLOY_AWS_EKS=true` |
| ImagePullBackOff | ECR mirror ran? Node IAM has ECR pull policy? |
| db-migrate fails | RDS security group, `DATABASE_URL`, `DB_SSL=true` |
| Argo OutOfSync Secret | Expected — secrets managed outside Git |
| NLB hostname pending | Wait 2–5 min; re-run `terraform output ingress_nlb_hostname` |

---

## Related docs

- [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md) — hands-on commands
- [CI_CD.md](CI_CD.md) — workflow reference
- [ARGOCD.md](ARGOCD.md) — Argo CD setup
- [KUBERNETES.md](KUBERNETES.md) — K8s concepts
