# Security practices in this project

For the full modern security-development guide (MFA, SSRF, DevSecOps CI, OWASP map), see
**[SECURITY_DEVELOPMENT.md](SECURITY_DEVELOPMENT.md)**.

To practice explaining security (and the whole project) in interviews, see
**[INTERVIEW_EXPLANATION.md](INTERVIEW_EXPLANATION.md)**.

## Authentication

- **Access tokens** — short-lived JWT (default 15 minutes) with unique **`jti`**.
- **Refresh tokens** — opaque random tokens, **SHA-256 hashed** at rest in `refresh_tokens`.
- **Rotation** — each `/api/auth/refresh` revokes the old refresh token and issues a new pair.
- **Logout** — revokes refresh token and **denylists** access `jti` until expiry.
- **Password KDF** — **scrypt** for new registrations; bcrypt still verified for seeded/legacy users.
- **Password policy** — min 10 chars, upper/lower/digit/special, banned common words.
- **Login lockout** — 5 failures → 15 minute lock; events in `security_events`.
- **TOTP MFA** — `POST /api/auth/mfa/setup|enable|disable` (flag `FEATURE_MFA`).

## API hardening

| Control | Implementation |
|---------|----------------|
| HTTP headers | Helmet + Permissions-Policy, nosniff, frame deny, COOP/CORP, HSTS (prod) |
| CORS | Allowlist via `CORS_ORIGINS` (comma-separated); otherwise reflect in dev |
| Rate limiting | Global 500/15min; auth routes 30/15min |
| Content-Type | Mutating JSON routes require `application/json` |
| Input validation | Zod on auth, AI, and route handlers |
| RBAC | `admin` / `manager` / `customer` via JWT claims |
| SSRF | Webhook fetches blocked from private/metadata IPs |
| Secrets | `JWT_SECRET` from env; K8s Secrets / AWS Secrets Manager |
| Disclosure | `GET /.well-known/security.txt` |

## Observability & privacy

- Pino + pino-http **redact** passwords, tokens, MFA codes, Authorization headers
- `security_events` table for login/MFA outcomes
- `GET /api/platform/security/posture` — live control inventory + OWASP mapping

## CI / supply chain

- `npm audit --audit-level=high`
- Dependabot weekly npm updates
- **CodeQL** SAST
- **Semgrep** (OWASP + TypeScript rules)
- **Gitleaks** secret scanning
- **Trivy** container image scan
- **CycloneDX SBOM** artifact upload
- Docker images built in CI (no secrets in layers)
- Terraform `fmt` + `validate` in CI

## AI endpoint

- `/api/ai/*` requires authenticated `admin` or `manager`
- Prompts grounded in aggregated business data
- `OPENAI_API_KEY` optional — demo mode avoids external API calls

## Production checklist

- [ ] Rotate `JWT_SECRET` and use Secrets Manager / External Secrets on EKS
- [ ] Set `CORS_ORIGINS` to exact frontend origins (disable reflect-all)
- [ ] Enable TLS at Ingress / ALB (HSTS already prepared for production)
- [ ] Enforce MFA for admin/manager (`FEATURE_MFA=true`)
- [ ] Scrape `/metrics`; alert on 5xx and auth failure spikes
- [ ] Keep DB migrations backward-compatible during blue/green cutover
- [ ] Store SBOM from CI with each release
