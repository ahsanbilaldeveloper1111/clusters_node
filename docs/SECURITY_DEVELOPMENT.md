# Security development (latest practices in this repo)

Modern **application security + DevSecOps** controls implemented as working demos for
Principal / Architect / Security-minded hiring interviews.

Also see: [SECURITY.md](SECURITY.md) · [HIRING_PRINCIPAL_ARCHITECT_DEVOPS.md](HIRING_PRINCIPAL_ARCHITECT_DEVOPS.md)

---

## Quick map

| Layer | Controls |
|-------|----------|
| **Identity** | Short-lived JWT + `jti`, refresh rotation (hashed at rest), access-token denylist on logout, TOTP MFA |
| **Passwords** | OWASP-style policy, **scrypt** KDF for new users, bcrypt legacy verify |
| **Abuse** | Auth rate limit, progressive **login lockout**, security_events audit |
| **HTTP** | Helmet, HSTS (prod), Permissions-Policy, nosniff, frame deny, JSON content-type enforcement, CORS allowlist |
| **Integrations** | HMAC webhooks + **SSRF guard** (block private/metadata IPs) + retry/jitter |
| **Data** | Parameterized SQL, Zod validation, RBAC |
| **Privacy** | Pino **PII redaction** (passwords, tokens, MFA codes) |
| **Supply chain** | Dependabot, npm audit, **CodeQL**, **Semgrep**, **Gitleaks**, **Trivy**, **CycloneDX SBOM** |
| **Disclosure** | `/.well-known/security.txt` (RFC 9116) |

---

## Application security (how to demo)

### 1. Password policy + scrypt

- Register rejects weak passwords (`assertPasswordPolicy`).
- New hashes stored as `scrypt$N$r$p$salt$hash` (Node `crypto.scrypt`).
- Seeded users keep bcrypt; `verifyPassword` accepts both.

Files: `backend/src/security/password.ts`

### 2. Login lockout

- 5 failed attempts → account locked 15 minutes.
- Events written to `security_events`.

Files: `backend/src/security/login-lockout.ts` · migration `07-security.sql`

### 3. TOTP MFA (RFC 6238)

```http
POST /api/auth/mfa/setup          # returns otpauth:// URI + secret
POST /api/auth/mfa/enable         # { "code": "123456" }
POST /api/auth/login              # password only → mfaRequired
POST /api/auth/login              # + { "totpCode": "123456" }
POST /api/auth/mfa/disable        # { "code": "123456" }
```

Flag: `FEATURE_MFA=true`

Files: `backend/src/security/totp.ts` · `auth.routes.ts`

### 4. JWT denylist (`jti`)

- Access tokens include `jti`.
- Logout revokes refresh **and** denylists access `jti` until expiry.
- `authenticate` rejects revoked tokens.

Files: `token-denylist.ts` · `auth.service.ts`

### 5. SSRF protection on webhooks

Before `fetch(WEBHOOK_URL)`, resolve DNS and block:

- RFC1918, loopback, link-local, `169.254.169.254` metadata range, IPv6 ULA/link-local
- credentialed URLs, non-http(s)

File: `backend/src/security/ssrf.ts`

### 6. Security posture API

```http
GET /api/platform/security/posture
```

Returns active controls, MFA/lock stats, OWASP Top 10 mapping — great interview slide.

### 7. security.txt

```http
GET /.well-known/security.txt
```

---

## DevSecOps (CI)

| Job | Tool | Purpose |
|-----|------|---------|
| `security` | npm audit | Dependency CVEs |
| `codeql` | GitHub CodeQL | Semantic SAST |
| `semgrep` | Semgrep OWASP/TS rules | Fast pattern SAST |
| `gitleaks` | Gitleaks | Secret leak scan |
| `trivy` | Trivy | Container image CVEs |
| `sbom` | CycloneDX | Software Bill of Materials artifact |

Workflow: `.github/workflows/ci.yml`

---

## Env

```bash
FEATURE_MFA=true
CORS_ORIGINS=http://localhost:5173,http://localhost:8081
# WEBHOOK_URL=https://public-partner.example/hooks
# WEBHOOK_SECRET=at-least-16-chars
```

---

## OWASP Top 10 mapping (talk track)

| Item | This project |
|------|----------------|
| A01 Broken Access Control | JWT + RBAC `requireRole` |
| A02 Cryptographic Failures | scrypt/bcrypt, hashed refresh, HMAC |
| A03 Injection | Parameterized SQL + Zod |
| A04 Insecure Design | Lockout, MFA, outbox, SSRF guard |
| A05 Misconfiguration | Helmet, hardened headers, CORS allowlist, hide `X-Powered-By` |
| A07 Auth Failures | MFA, lockout, rotation, denylist |
| A08 Integrity Failures | SBOM + CI scanning (supply chain) |
| A09 Logging Failures | `security_events` + redacted logs + OTel |
| A10 SSRF | `assertSafeOutboundUrl` |

---

## Resume bullets

- Implemented **scrypt** password hashing, **TOTP MFA**, login lockout, and **JWT jti denylist**.
- Added **SSRF protections** for server-side webhooks and hardened HTTP security headers / CORS allowlisting.
- Built DevSecOps pipeline with **CodeQL, Semgrep, Gitleaks, Trivy, and CycloneDX SBOM**.
- Exposed a **security posture** API mapped to OWASP for operational visibility.
