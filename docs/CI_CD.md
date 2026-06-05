# CI/CD Pipeline

GitHub Actions workflows live in `.github/workflows/`.

## CI (`ci.yml`)

Runs on every **push** and **pull request** to `main`, `master`, or `develop`.

| Job | What it does |
|-----|----------------|
| **build** | `npm install`, compile backend + frontend TypeScript |
| **database** | Starts Postgres 16, runs migrations + seed |
| **docker** | Builds backend, frontend (Compose), frontend-k8s images (no push), validates `docker compose config` |
| **build** (k8s) | `kubectl kustomize` local + production overlays (incl. `k8s-cd-prepare.sh` dry-run) |

### Local equivalent

```bash
npm install
npm run build
docker compose up postgres -d
npm run db:migrate && npm run db:seed
docker compose build
```

## CD (`cd.yml`)

Runs on **push to `main`/`master`** and on **version tags** (`v1.0.0`, `v1.2.3`).

| Job | What it does |
|-----|----------------|
| **publish** | Build & push 3 images to **GHCR** |
| **kubernetes** | Prepare production Kustomize overlay, upload manifests, optional cluster deploy |

### Image names

```
ghcr.io/<owner>/<repo>/backend:latest
ghcr.io/<owner>/<repo>/frontend:latest          # Docker Compose (nginx → backend hostname)
ghcr.io/<owner>/<repo>/frontend-k8s:latest     # Kubernetes (nginx → backend-service)
```

Replace `<owner>/<repo>` with your GitHub org/user and repository name (lowercase).

### Enable CD

1. Push this repo to GitHub.
2. Ensure **Actions** are enabled: Repository → Settings → Actions.
3. `GITHUB_TOKEN` is provided automatically for GHCR push (workflow has `packages: write`).
4. After first `main` push, images appear under **Packages** on your GitHub profile/org.

### Pull images on a server

```bash
export GHCR_OWNER=your-github-username
export IMAGE_TAG=latest
echo "$GITHUB_TOKEN" | docker login ghcr.io -u USERNAME --password-stdin

docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

For private packages, use a [Personal Access Token](https://github.com/settings/tokens) with `read:packages`.

### Manual CD trigger

GitHub → **Actions** → **CD** → **Run workflow** → optionally check **Deploy to Kubernetes**.

## Kubernetes deployment (CD)

Every CD run on `main` / tags:

1. Pushes images tagged with **git SHA** and `latest`
2. Runs `scripts/k8s-cd-prepare.sh` to set GHCR image tags in `k8s/overlays/production`
3. Uploads rendered YAML as artifact **k8s-production-manifests**
4. Prints `kubectl apply` commands in the workflow summary

### Auto-deploy to a cluster (optional)

| Secret / variable | Purpose |
|-------------------|---------|
| `KUBE_CONFIG` | Base64-encoded kubeconfig (`cat ~/.kube/config \| base64 -w0`) |
| `K8S_SECRETS_ENV` | Full contents of `k8s/overlays/production/secrets.env` |
| `DEPLOY_K8S` | Repository variable set to `true` to deploy on every `main` push |

**Or** run CD manually with **deploy_kubernetes** checked.

### Manual deploy from your machine

```bash
export GITHUB_REPOSITORY=your-user/node_typescript_advance_app
export IMAGE_TAG=latest   # or git SHA from CD
cp k8s/overlays/production/secrets.env.example k8s/overlays/production/secrets.env
# edit secrets.env with real values
bash scripts/k8s-cd-prepare.sh
kubectl apply -k k8s/overlays/production
```

See [KUBERNETES.md](KUBERNETES.md) for cluster prerequisites.

## Branch protection (recommended)

On `main`:

- Require CI workflow to pass before merge
- Require pull request reviews

## Customize

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Add tests, ESLint, security scan |
| `.github/workflows/cd.yml` | Kubernetes deploy job (`kubernetes`), GHCR publish |
| `docker-compose.prod.yml` | Pin GHCR images in production |

## Other CI platforms

The same steps apply for **GitLab CI**, **Azure Pipelines**, or **Jenkins**:

1. `npm ci` / `npm install`
2. `npm run build`
3. `docker compose build`
4. On release: `docker push` to your registry
