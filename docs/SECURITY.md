# Security practices in this project

## Authentication

- **Access tokens** — short-lived JWT (default 15 minutes).
- **Refresh tokens** — opaque random tokens, **SHA-256 hashed** at rest in `refresh_tokens` table.
- **Rotation** — each `/api/auth/refresh` revokes the old refresh token and issues a new pair.
- **Logout** — revokes refresh token server-side.

## API hardening

| Control | Implementation |
|---------|----------------|
| HTTP headers | Helmet |
| Rate limiting | Global 500/15min; auth routes 30/15min |
| Input validation | Zod on auth, AI, and route handlers |
| RBAC | `admin` / `manager` / `customer` via JWT claims |
| Secrets | `JWT_SECRET` from env; K8s Secrets in deploy overlays |

## CI / supply chain

- `npm audit --audit-level=high` in CI (security job)
- Dependabot weekly npm updates
- Docker images built in CI (no secrets in layers)
- Terraform `fmt` + `validate` in CI

## AI endpoint

- `/api/ai/insights` requires authenticated `admin` or `manager`
- Prompts are grounded in aggregated business data only (no raw PII in demo mode)
- `OPENAI_API_KEY` optional — demo mode avoids external API calls

## Production checklist

- [ ] Rotate `JWT_SECRET` and use Secrets Manager / External Secrets on EKS
- [ ] Restrict CORS origins (not `origin: true`)
- [ ] Enable TLS at Ingress / ALB
- [ ] Scrape `/metrics` with Prometheus; alert on 5xx rate
- [ ] Keep DB migrations backward-compatible during blue/green cutover
