# CI/CD Pipeline

GitHub Actions workflows live in `.github/workflows/`.

## CI (`ci.yml`)

Runs on every **push** and **pull request** to `main`, `master`, or `develop`.

| Job | What it does |
|-----|----------------|
| **build** | `npm install`, compile backend + frontend TypeScript |
| **database** | Starts Postgres 16, runs migrations + seed |
| **docker** | Builds backend & frontend Docker images (no push), validates `docker compose config` |

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

| Step | What it does |
|------|----------------|
| Build | Multi-stage Docker build for backend + frontend |
| Push | Publishes to **GitHub Container Registry** (GHCR) |

### Image names

```
ghcr.io/<owner>/<repo>/backend:latest
ghcr.io/<owner>/<repo>/frontend:latest
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

GitHub → **Actions** → **CD** → **Run workflow**.

## Branch protection (recommended)

On `main`:

- Require CI workflow to pass before merge
- Require pull request reviews

## Customize

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Add tests, ESLint, security scan |
| `.github/workflows/cd.yml` | Add deploy to AWS/Azure/SSH |
| `docker-compose.prod.yml` | Pin GHCR images in production |

## Other CI platforms

The same steps apply for **GitLab CI**, **Azure Pipelines**, or **Jenkins**:

1. `npm ci` / `npm install`
2. `npm run build`
3. `docker compose build`
4. On release: `docker push` to your registry
