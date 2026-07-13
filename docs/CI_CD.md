# CI/CD Pipeline

> **Full AWS walkthrough (Terraform + CI/CD with code explanations):** [AWS_FULL_DEPLOYMENT_GUIDE.md](AWS_FULL_DEPLOYMENT_GUIDE.md)

GitHub Actions workflows live in `.github/workflows/`.

## CI (`ci.yml`)

Runs on every **push** and **pull request** to `main`, `master`, or `develop`.

| Job | What it does |
|-----|----------------|
| **build** | `npm install`, compile backend + frontend TypeScript |
| **build** (k8s) | `kubectl kustomize` local, **blue-green**, production, **blue-green-production**, **aws-production**, and gitops overlays |
| **database** | Starts Postgres 16, runs migrations + seed |
| **docker** | Builds backend, frontend, frontend-k8s, **Lambda document-upload** images (no push), validates `docker compose config` |
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
| **lambda-documents** | Build/push **document-upload Lambda** Docker image to ECR + `aws lambda update-function-code` |
| **kubernetes** | Prepare production overlay, upload manifests, optional generic K8s deploy |
| **blue-green** | Optional blue/green deploy (GHCR / generic K8s) |
| **blue-green-aws** | Optional blue/green on **AWS EKS** (ECR + RDS/ElastiCache) |
| **aws-kubernetes** | Prepare `aws-production` overlay, deploy to **AWS EKS** (rolling) |
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
| **deploy_blue_green** | Blue/green deploy using `k8s/overlays/blue-green-production` |
| **deploy_blue_green_aws** | Blue/green on AWS EKS using `k8s/overlays/blue-green-aws` |
| **blue_green_switch** | When blue/green is on, flip traffic after standby is ready (default true) |
| **deploy_aws_eks** | Deploy to AWS EKS using `k8s/overlays/aws-production` |
| **gitops_commit** | Commit GHCR tags to `k8s/overlays/gitops` |
| **gitops_commit_aws** | Commit ECR tags to `k8s/overlays/gitops-aws` (Argo CD on AWS) |
| **deploy_lambda_documents** | Build/push Lambda Docker image and update function |

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

## Blue/green deployment (optional)

Replaces rolling `backend`/`frontend` Deployments with color slots. Full guide: [BLUE_GREEN.md](BLUE_GREEN.md).

| Secret / variable | Purpose |
|-------------------|---------|
| `KUBE_CONFIG` | Same as rolling deploy |
| `K8S_SECRETS_ENV` | Same as rolling deploy |
| `DEPLOY_BLUE_GREEN` | `true` — blue/green on every `main` push |
| `BLUE_GREEN_SWITCH` | `false` — deploy standby only (no traffic flip) |
| `BLUE_GREEN_SCALE_DOWN_OLD` | `false` — keep previous color scaled up after switch |
| `BOOTSTRAP_BLUE_GREEN` | `false` — fail if color slots are missing (default bootstraps) |

**Or** run CD with **deploy_blue_green** checked.

CD flow: **publish** → prepare `blue-green-production` → deploy to **inactive** color → optional **switch**.

Do **not** set both `DEPLOY_K8S=true` and `DEPLOY_BLUE_GREEN=true` for the same cluster.

### AWS EKS blue/green

| Secret / variable | Purpose |
|-------------------|---------|
| AWS credentials / `AWS_EKS_CLUSTER_NAME` | Same as rolling AWS deploy |
| `K8S_AWS_SECRETS_ENV` or Secrets Manager | App secrets |
| `DEPLOY_BLUE_GREEN_AWS` | `true` — blue/green on EKS each `main` push |

**Or** run CD with **deploy_blue_green_aws** checked.

```bash
# From your machine (after terraform + ECR push)
export IMAGE_TAG=<sha>
npm run k8s:aws:blue-green
```

Do **not** set both `DEPLOY_AWS_EKS=true` and `DEPLOY_BLUE_GREEN_AWS=true`.

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

### Lambda document-upload (Docker → ECR → Lambda)

Requires `terraform apply` with `enable_documents_lambda = true` (creates Lambda, S3, API Gateway, ECR).

| Variable / input | Purpose |
|------------------|---------|
| `DEPLOY_LAMBDA_DOCUMENTS` | `true` — deploy Lambda on every `main` push |
| `PUSH_ECR` | Also triggers Lambda CD job |
| `DEPLOY_AWS_EKS` | Also triggers Lambda CD job |
| **deploy_lambda_documents** | Manual CD workflow checkbox |

**CD `lambda-documents` job:**

1. `docker build --platform linux/amd64` (`lambda/document-upload/Dockerfile`)
2. `docker push` → `{account}.dkr.ecr.{region}.amazonaws.com/enterprise-app-production/document-upload-lambda:{sha}`
3. `aws lambda update-function-code --image-uri ...`

**CI** validates the Lambda Dockerfile builds on every PR (no push).

Details: [LAMBDA_DOCUMENTS.md](LAMBDA_DOCUMENTS.md)

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
| `.github/workflows/ci.yml` | Build, k8s manifest validation (incl. blue-green), terraform validate |
| `.github/workflows/cd.yml` | GHCR publish, ECR mirror, K8s / blue-green / AWS EKS deploy |
| `docker-compose.prod.yml` | Pin GHCR images in production |
| `terraform/` | AWS infrastructure |
| `k8s/overlays/aws-production/` | kubectl AWS deploy overlay |
| `k8s/overlays/blue-green/` | Local blue/green overlay |
| `k8s/overlays/blue-green-production/` | Production blue/green overlay (GHCR) |
| `k8s/overlays/gitops-aws/` | Argo CD AWS GitOps overlay (ECR) |

## Other CI platforms

The same steps apply for **GitLab CI**, **Azure Pipelines**, or **Jenkins**:

1. `npm ci` / `npm install`
2. `npm run build`
3. `docker compose build`
4. On release: `docker push` to GHCR and/or ECR
5. `kubectl apply -k k8s/overlays/aws-production` for AWS
