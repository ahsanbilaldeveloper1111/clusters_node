# CI/CD Pipeline

GitHub Actions workflows live in `.github/workflows/`.

## CI (`ci.yml`)

Runs on every **push** and **pull request** to `main`, `master`, or `develop`.

| Job | What it does |
|-----|----------------|
| **build** | `npm install`, compile backend + frontend TypeScript |
| **build** (k8s) | `kubectl kustomize` local, production, **aws-production**, and gitops overlays |
| **database** | Starts Postgres 16, runs migrations + seed |
| **docker** | Builds backend, frontend (Compose), frontend-k8s images (no push), validates `docker compose config` |
| **terraform** | `terraform fmt -check`, `init`, `validate` for AWS infrastructure |

### Local equivalent

```bash
npm install
npm run build
docker compose up postgres -d
npm run db:migrate && npm run db:seed
docker compose build
kubectl kustomize k8s/overlays/aws-production  # after preparing secrets.env.example
cd terraform && terraform validate
```

## CD (`cd.yml`)

Runs on **push to `main`/`master`** and on **version tags** (`v1.0.0`, `v1.2.3`).

| Job | What it does |
|-----|----------------|
| **publish** | Build & push 3 images to **GHCR** |
| **ecr** | Mirror `backend` + `frontend-k8s` from GHCR to **Amazon ECR** (when enabled) |
| **kubernetes** | Prepare production overlay, upload manifests, optional generic K8s deploy |
| **aws-kubernetes** | Prepare `aws-production` overlay, deploy to **AWS EKS** (RDS + ElastiCache) |
| **gitops** | Commit GHCR tags to `gitops/` or ECR tags to `gitops-aws/` for Argo CD |

### Image names (GHCR)

```
ghcr.io/<owner>/<repo>/backend:latest
ghcr.io/<owner>/<repo>/frontend:latest          # Docker Compose (nginx → backend hostname)
ghcr.io/<owner>/<repo>/frontend-k8s:latest     # Kubernetes (nginx → backend-service)
```

### Image names (ECR — after `terraform apply`)

```
<account>.dkr.ecr.<region>.amazonaws.com/enterprise-app-production/backend:<sha>
<account>.dkr.ecr.<region>.amazonaws.com/enterprise-app-production/frontend-k8s:<sha>
```

### Enable CD (GHCR only)

1. Push this repo to GitHub.
2. Ensure **Actions** are enabled: Repository → Settings → Actions.
3. `GITHUB_TOKEN` is provided automatically for GHCR push (workflow has `packages: write`).
4. After first `main` push, images appear under **Packages** on your GitHub profile/org.

### Manual CD trigger

GitHub → **Actions** → **CD** → **Run workflow**:

| Input | Purpose |
|-------|---------|
| **deploy_kubernetes** | Deploy to generic K8s using `k8s/overlays/production` |
| **deploy_aws_eks** | Deploy to AWS EKS using `k8s/overlays/aws-production` |
| **gitops_commit** | Commit GHCR tags to `k8s/overlays/gitops` |
| **gitops_commit_aws** | Commit ECR tags to `k8s/overlays/gitops-aws` (Argo CD on AWS) |

## Kubernetes deployment — generic cluster

Every CD run on `main` / tags:

1. Pushes images tagged with **git SHA** and `latest`
2. Runs `scripts/k8s-cd-prepare.sh` to set GHCR image tags in `k8s/overlays/production`
3. Uploads rendered YAML as artifact **k8s-production-manifests**

### Auto-deploy (optional)

| Secret / variable | Purpose |
|-------------------|---------|
| `KUBE_CONFIG` | Base64-encoded kubeconfig |
| `K8S_SECRETS_ENV` | Full contents of `k8s/overlays/production/secrets.env` |
| `DEPLOY_K8S` | Repository variable set to `true` |

**Or** run CD manually with **deploy_kubernetes** checked.

## AWS EKS deployment

Requires [Terraform infrastructure](AWS_DEPLOYMENT.md) applied first (VPC, EKS, RDS, ElastiCache, ECR, Secrets Manager).

### Enable ECR mirror

| Variable | Purpose |
|----------|---------|
| `PUSH_ECR` | Set to `true` to mirror GHCR images to ECR on every CD run |

### Enable AWS EKS auto-deploy

| Secret / variable | Purpose |
|-------------------|---------|
| `AWS_ROLE_ARN` | IAM role for GitHub OIDC (recommended) |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | Alternative to OIDC |
| `AWS_REGION` | e.g. `us-east-1` (default) |
| `AWS_EKS_CLUSTER_NAME` | e.g. `enterprise-app-production` (default) |
| `PROJECT_NAME` | ECR repo prefix, default `enterprise-app` |
| `ENVIRONMENT` | ECR repo suffix, default `production` |
| `K8S_AWS_SECRETS_ENV` | Optional — contents of `aws-production/secrets.env`; if unset, CI reads Secrets Manager |
| `DEPLOY_AWS_EKS` | Set to `true` to deploy on every `main` push |

**Or** run CD manually with **deploy_aws_eks** checked.

### AWS CD flow

1. **publish** → push images to GHCR
2. **ecr** → pull from GHCR, retag, push to ECR (`backend`, `frontend-k8s`)
3. **aws-kubernetes** →
   - `aws eks update-kubeconfig`
   - sync secrets (`K8S_AWS_SECRETS_ENV` or Secrets Manager)
   - `scripts/k8s-aws-prepare.sh` (ECR image tags)
   - upload artifact **k8s-aws-production-manifests**
   - `scripts/k8s-aws-deploy.sh` (migrate → seed → backend → frontend)

### AWS Argo CD GitOps (recommended)

Use **instead of** `DEPLOY_AWS_EKS` when you want Git-driven deploys on EKS.

| Variable | Purpose |
|----------|---------|
| `USE_ARGOCD_GITOPS_AWS` | `true` — commit ECR tags to `gitops-aws` on each CD run |
| `PUSH_ECR` | `true` — required so ECR has images before Argo syncs |

One-time on EKS:

```bash
bash scripts/argocd-install.sh
bash scripts/argocd-bootstrap-aws.sh
```

CD flow: **publish** → **ecr** → **gitops** (commits `gitops-aws`) → **Argo CD syncs EKS**

Do **not** set both `DEPLOY_AWS_EKS=true` and `USE_ARGOCD_GITOPS_AWS=true` — pick one deploy model.

### IAM permissions for GitHub Actions

The AWS role/user needs at minimum:

- `ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:PutImage`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`
- `eks:DescribeCluster` (for `update-kubeconfig`)
- `secretsmanager:GetSecretValue` (if not using `K8S_AWS_SECRETS_ENV`)

The EKS cluster access entry / `aws-auth` must allow the role to deploy (cluster creator admin from Terraform covers the deployer if same account).

### Manual AWS deploy from your machine

```bash
export IMAGE_TAG=<git-sha>
bash scripts/k8s-aws-sync-secrets.sh
bash scripts/k8s-aws-deploy.sh
```

See [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md) for full setup.

## Argo CD GitOps (recommended for production)

Instead of `kubectl apply` from CI, use **Argo CD** to sync from Git:

1. CD pushes images to GHCR (and ECR when `PUSH_ECR=true`)
2. CD commits tags to `k8s/overlays/gitops/` (when `USE_ARGOCD_GITOPS=true`)
3. CD commits ECR tags to `k8s/overlays/gitops-aws/` (when `USE_ARGOCD_GITOPS_AWS=true`)
4. Argo CD auto-syncs the cluster

| Overlay | Cluster | Registry |
|---------|---------|----------|
| `gitops` | Generic K8s | GHCR |
| `gitops-aws` | AWS EKS | ECR |

Setup: [ARGOCD.md](ARGOCD.md) · AWS: [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md)

## Branch protection (recommended)

On `main`:

- Require CI workflow to pass before merge
- Require pull request reviews

## Customize

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Build, k8s manifest validation, terraform validate |
| `.github/workflows/cd.yml` | GHCR publish, ECR mirror, K8s + AWS EKS deploy |
| `docker-compose.prod.yml` | Pin GHCR images in production |
| `terraform/` | AWS infrastructure |
| `k8s/overlays/aws-production/` | kubectl AWS deploy overlay |
| `k8s/overlays/gitops-aws/` | Argo CD AWS GitOps overlay (ECR) |

## Other CI platforms

The same steps apply for **GitLab CI**, **Azure Pipelines**, or **Jenkins**:

1. `npm ci` / `npm install`
2. `npm run build`
3. `docker compose build`
4. On release: `docker push` to GHCR and/or ECR
5. `kubectl apply -k k8s/overlays/aws-production` for AWS
