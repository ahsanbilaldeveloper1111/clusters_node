# 10-minute recruiter demo script

Use this to walk a hiring manager through the project live or on a screen share.

**Full feature explanations:** [FEATURES.md](FEATURES.md)

## Before the demo (2 min)

```bash
cp .env.example .env
docker compose up --build -d
docker compose exec backend npm run db:migrate -w backend
docker compose exec backend npm run db:seed -w backend
```

Open:
- **App:** http://localhost:8081
- **API docs:** http://localhost:3000/api/docs
- **Metrics:** http://localhost:3000/metrics
- **Health:** http://localhost:3000/health

Login: `admin@enterprise.local` / `Password123!`

## Talking points (8 min)

### 1. Full-stack product (2 min)
- Show **Dashboard** — health checks, orders, cluster worker info.
- **Products** — Redis-cached catalog + trigram search (PostgreSQL `pg_trgm`).
- Mention: Express + React monorepo, TypeScript strict mode, Zod validation.

### 2. Security (2 min)
- JWT with **short-lived access tokens** (15m) + **refresh token rotation** (hashed in DB).
- Helmet, rate limiting, role-based access (`admin` / `manager` / `customer`).
- Point to CI: `npm audit`, API integration tests, lint + typecheck.
- Open **Swagger** at `/api/docs` — OpenAPI 3.1 contract.
- Open **System** → show correlation ID, circuit breakers, feature flags (see [ADVANCED_CONCEPTS.md](ADVANCED_CONCEPTS.md)).

### 3. AI feature (2 min)
- Open **AI Assistant** page (admin/manager).
- Ask: *"Which categories drive revenue?"* or *"Any low stock risks?"*
- Explain: answers grounded in **live SQL analytics**; set `OPENAI_API_KEY` for real LLM mode.

### 4. Platform / DevOps (2 min)
- Mention (don't need to run live): **Terraform** (VPC, EKS, RDS, ElastiCache), **Argo CD GitOps**, **blue/green on AWS** with auto-abort/rollback.
- CI builds Docker images, validates all Kustomize overlays, runs Terraform validate.
- CD publishes to GHCR + ECR, optional GitOps commits.

## One-liner for your resume

> Full-stack TypeScript enterprise app with JWT refresh rotation, AI business insights, Prometheus metrics, OpenAPI, Vitest API tests, and production CI/CD to Kubernetes on AWS (Terraform, Argo CD, blue/green).

## Optional deep dives if asked

| Topic | Doc |
|-------|-----|
| Blue/green + rollback | [BLUE_GREEN.md](BLUE_GREEN.md) |
| Argo CD | [ARGOCD.md](ARGOCD.md) |
| AWS | [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md) |
| CI/CD | [CI_CD.md](CI_CD.md) |
