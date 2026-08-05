# Interview explanation guide (DETAILED)

This document is for **practicing interviews out loud**.  
It explains the project **in depth** — what it is, how each part works step by step, and exactly what you should say.

**How to use it**

1. Read one section.  
2. Cover the page and say the answer in your own words.  
3. Check the “Follow-up questions” — those are what interviewers ask next.  
4. If you share screen, open the file listed under **Point at**.

Shorter related docs:

- [SECURITY_DEVELOPMENT.md](SECURITY_DEVELOPMENT.md)  
- [HIRING_PRINCIPAL_ARCHITECT_DEVOPS.md](HIRING_PRINCIPAL_ARCHITECT_DEVOPS.md)  
- [LEARN_AI_ML.md](LEARN_AI_ML.md)  
- [ADVANCED_CONCEPTS.md](ADVANCED_CONCEPTS.md)

---

## Table of contents

1. [Project overview (what is this?)](#1-project-overview-what-is-this)  
2. [Opening speech (memorize)](#2-opening-speech-memorize)  
3. [Architecture — detailed](#3-architecture--detailed)  
4. [Security — detailed (most important for many interviews)](#4-security--detailed)  
5. [Reliability patterns — detailed](#5-reliability-patterns--detailed)  
6. [Observability — detailed](#6-observability--detailed)  
7. [DevOps / Platform — detailed](#7-devops--platform--detailed)  
8. [AI Assistant — detailed](#8-ai-assistant--detailed)  
9. [ML Lab — detailed](#9-ml-lab--detailed)  
10. [End-to-end request walkthrough](#10-end-to-end-request-walkthrough)  
11. [STAR stories](#11-star-stories)  
12. [10-minute live demo](#12-10-minute-live-demo)  
13. [Hard questions + model answers](#13-hard-questions--model-answers)  
14. [Night-before checklist](#14-night-before-checklist)

---

## 1. Project overview (what is this?)

### In simple words

This repo is a **full-stack enterprise-style commerce app**:

- Users can register/login  
- Browse products, place/cancel orders  
- Admins/managers get analytics, AI assistant, ML lab, audit, system info  
- It runs locally with Docker, and can deploy to Kubernetes / AWS  

It is built as a **portfolio for hiring** (Principal SE, Architect, DevOps), so it includes production patterns — not only CRUD.

### Tech stack (say this clearly)

| Layer | Technology |
|-------|------------|
| Language | TypeScript |
| API | Node.js, Express |
| UI | React + Vite |
| DB | PostgreSQL |
| Cache / streams | Redis |
| Auth | JWT + refresh + optional TOTP MFA |
| Docs API | OpenAPI from Zod + Swagger |
| Deploy | Docker, Kubernetes, Terraform, Argo CD |
| Observability | Prometheus, optional OpenTelemetry → Jaeger, Grafana |
| AI | Optional OpenAI + demo fallback |
| ML | From-scratch algorithms in TypeScript |

### Roles in the app

| Role | Can do |
|------|--------|
| `customer` | Products, own orders |
| `manager` | Analytics, AI, ML, audit |
| `admin` | Everything above + system |

Default demo login: `admin@enterprise.local` / `Password123!`

---

## 2. Opening speech (memorize)

Say this in ~30–40 seconds:

> “I built a Node and TypeScript commerce platform as a senior-level portfolio.  
> Beyond products and orders, it shows reliability patterns like idempotency, a transactional outbox, and circuit breakers; security like scrypt passwords, TOTP MFA, SSRF protection, and a DevSecOps CI pipeline; observability with Prometheus and OpenTelemetry; and delivery with Kubernetes, Argo CD blue/green, and Terraform on AWS.  
> I also added an AI assistant grounded in live SQL data, and an ML lab that trains models from scratch so I can explain how learning actually works.  
> Happy to go deep on architecture, security, or platform — whichever you prefer.”

Then stop and let them choose.

---

## 3. Architecture — detailed

### One-liner

> “Layered backend with clear boundaries, plus an outbox for reliable events and a CQRS-lite read path for analytics.”

### What “layered” means (explain like this)

```
Browser / curl
    ↓
Express route          ← HTTP + auth + Zod parse
    ↓
Service (optional)     ← business rules
    ↓
Repository             ← SQL only
    ↓
PostgreSQL
```

**Why interviewers like this:**  
You can change SQL without rewriting HTTP handlers. You can test business rules separately. It scales as a team grows.

**Point at:** `backend/src/routes/` → `services/` → `database/repositories/`

### Detailed: placing an order (step by step)

When a client calls `POST /api/orders` (or `/api/v1/orders`):

1. **Auth middleware** checks Bearer JWT (and denylist).  
2. **RBAC** allows any logged-in user to create their own order.  
3. **Zod** validates body (`items`, `shippingAddress`).  
4. Optional **Idempotency-Key**: if we’ve seen this key before, return the saved response (no second stock hit).  
5. **Repository `createOrder`** starts a DB transaction:  
   - Insert order  
   - Lock each product row (`FOR UPDATE`)  
   - Check stock  
   - Insert line items, decrement stock  
   - Update order total/status  
   - **Insert outbox event** in the same transaction  
6. Commit.  
7. In-process domain event may also fire for audit logging.  
8. Background **outbox worker** publishes to Redis Streams.  
9. Stream consumer may send an **HMAC webhook** (with SSRF checks + retries).

### Why transactional outbox? (detailed interview answer)

**Problem (dual-write):**

```
1) COMMIT order in Postgres     ✅
2) Publish "OrderCreated"       ❌  (Redis/Kafka down)
→ Order exists, but no one notified. Data is inconsistent.
```

**Outbox solution:**

```
BEGIN
  insert order
  insert outbox_events row   ← "please publish OrderCreated"
COMMIT
```

Later, a poller reads unpublished outbox rows and publishes them.  
If publish fails, the row stays unpublished and is retried.

**What you say:**

> “The outbox makes the business write and the intent to publish atomic. Consumers must be idempotent because delivery is at-least-once. In production I’d keep the outbox table and change only the publisher to SQS or Kafka.”

**Point at:**

- `database/init/06-outbox-webhooks.sql`  
- `backend/src/messaging/outbox.ts`  
- `backend/src/database/repositories/order.repository.ts`

### CQRS-lite (detailed)

**CQRS** = Command Query Responsibility Segregation.  
Commands (writes) and queries (reads) use different models.

In this project:

- **Commands:** create/cancel order, update product → repositories  
- **Queries for dashboards:** `GET /api/platform/read-model/commerce` → aggregated read model + Redis cache  

**What you say:**

> “I’m not running two databases. It’s CQRS-lite: write path stays normalized transactional SQL; read path is a purpose-built projection with cache-aside. That lets us tune and cache reads without complicating writes.”

**Point at:** `backend/src/services/cqrs-read.service.ts`

### API versioning

Same handlers are mounted at `/api/...` and `/api/v1/...`.

**What you say:**

> “Versioning lets us evolve contracts without breaking old clients. Today v1 is an alias; later we could fork only the routes that change.”

---

## 4. Security — detailed

### One-liner

> “Defense in depth: identity, abuse prevention, safe outbound calls, hardened HTTP, private logs, and supply-chain scanning in CI.”

### Big picture diagram

```
Internet
   │
   ▼
Rate limit + Helmet + security headers + CORS allowlist
   │
   ▼
JWT auth (+ jti denylist) + RBAC
   │
   ▼
Zod validation + parameterized SQL
   │
   ├── passwords: scrypt / bcrypt verify + policy + lockout + MFA
   ├── webhooks: HMAC + SSRF guard + retry
   └── logs: PII redaction + security_events
   │
CI: Gitleaks, Semgrep, CodeQL, npm audit, Trivy, SBOM
```

### 4.1 Authentication flow (step by step)

#### Login without MFA

1. Client `POST /api/auth/login` with email/password.  
2. Auth rate limiter (30 / 15 min).  
3. Check account not locked.  
4. Load user; verify password (scrypt or bcrypt).  
5. If MFA enabled and no code → return `mfaRequired: true` (no tokens yet).  
6. Else issue:  
   - Access JWT (~15m) with claims: `sub`, `email`, `role`, `type=access`, **`jti`**  
   - Refresh token (random, long) — store **SHA-256 hash** only  
7. Write `security_events` = `login_success`.

#### Login with MFA

1. Same as above until password OK.  
2. Verify 6-digit TOTP against user’s secret (time window ±1 step).  
3. Only then issue tokens.

#### Refresh

1. Client sends refresh token.  
2. Lookup by hash; must be unexpired/unrevoked.  
3. **Rotate:** revoke old refresh, create new refresh + new access.  
4. Stolen old refresh becomes useless after use (rotation).

#### Logout

1. Revoke refresh hash.  
2. If access token provided, denylist its `jti` until access would expire.  
3. Even if someone copied the JWT, API rejects it after logout.

**Point at:** `backend/src/services/auth.service.ts`

### 4.2 Passwords (detailed explanation)

**Never store plaintext.**

**New users (register):**

1. `assertPasswordPolicy` — min 10 chars, upper, lower, digit, special, no banned words.  
2. Hash with **scrypt** (memory-hard KDF).  
3. Store string like: `scrypt$16384$8$1$<salt>$<hash>`  
4. Save `password_algo = scrypt`.

**Why scrypt (what to say):**

> “SHA-256 is fast — attackers can try billions of passwords per second offline. Scrypt is memory-hard, so brute force is expensive. We use Node’s built-in crypto — no extra native dependency. Legacy demo users still use bcrypt; verify accepts both so we can migrate safely.”

**Point at:** `backend/src/security/password.ts`

### 4.3 TOTP MFA (detailed)

TOTP = Time-based One-Time Password (RFC 6238).

**How it works conceptually:**

```
shared secret (base32)
        +
current time slice (30 seconds)
        ↓
HMAC-SHA1 → 6-digit code
```

App and authenticator compute the same code if clocks are close.

**Enrollment steps in this app:**

1. Authenticated user: `POST /api/auth/mfa/setup`  
2. Server generates secret, stores it, returns `otpauth://` URL  
3. User scans in Google Authenticator / Authy  
4. `POST /api/auth/mfa/enable` with current 6-digit code  
5. `totp_enabled = true`  
6. Future logins need password + `totpCode`

**What you say:**

> “I implemented TOTP with Node crypto myself so I can explain the algorithm — not only call a library. We allow a small time window so clock skew doesn’t lock people out.”

**Point at:** `backend/src/security/totp.ts`

### 4.4 Login lockout (detailed)

1. Failed password or MFA → `failed_login_count++`  
2. At 5 failures → `locked_until = now + 15 minutes`  
3. Next login attempts get **403** until lock expires  
4. Successful login clears counters  
5. All of this is logged in `security_events`

**What you say:**

> “This mitigates credential stuffing and password spraying. It’s complementary to rate limits — rate limit is per IP/route; lockout is per account.”

**Point at:** `backend/src/security/login-lockout.ts`

### 4.5 RBAC (authorization)

Authentication = who you are.  
Authorization = what you’re allowed to do.

JWT carries `role`. Middleware `requireRole('admin','manager')` protects AI, ML, analytics, security posture, etc.

**What you say:**

> “We keep authorization checks at the edge of each sensitive route. Customers never reach AI or security posture endpoints.”

**Point at:** `backend/src/middleware/auth.middleware.ts`

### 4.6 SSRF protection (detailed — interview favorite)

**SSRF** = Server-Side Request Forgery.  
Attacker tricks your server into calling an internal URL.

Classic cloud attack:

```
WEBHOOK_URL = http://169.254.169.254/latest/meta-data/
→ server fetches cloud credentials
```

**Our guard (`assertSafeOutboundUrl`):**

1. Parse URL — only `http`/`https`  
2. Reject URLs with embedded username/password  
3. If host is an IP → block private/loopback/link-local/metadata ranges  
4. If host is a name → DNS lookup **all** addresses → block if any are private  

**What you say:**

> “Any time the server fetches a configured or user-influenced URL, SSRF is a risk. Before webhook delivery we resolve DNS and block RFC1918, loopback, and link-local ranges including 169.254.0.0/16. That stops metadata service attacks.”

**Point at:** `backend/src/security/ssrf.ts`

### 4.7 HMAC webhooks (detailed)

1. Build JSON envelope of the event.  
2. `signature = HMAC_SHA256(secret, timestamp + "." + body)`  
3. Send headers: `X-Webhook-Timestamp`, `X-Webhook-Signature`  
4. Partner verifies with the same secret (timing-safe compare).  
5. Retries with exponential backoff + jitter on 5xx.

**What you say:**

> “HMAC proves the payload came from us and wasn’t tampered with. Timestamp limits replay. Retries with jitter avoid thundering herds when the partner is down.”

**Point at:** `backend/src/messaging/webhooks.ts`

### 4.8 HTTP hardening

| Control | Why |
|---------|-----|
| Helmet | Baseline secure headers |
| HSTS (prod) | Force HTTPS after first visit |
| X-Frame-Options DENY | Clickjacking |
| nosniff | Stop MIME sniffing |
| Permissions-Policy | Disable camera/mic/geo |
| CORS allowlist | Stop random sites calling API with cookies/tokens from a browser |
| JSON content-type check | Reduce some CSRF-ish / odd content attacks |
| Hide `X-Powered-By` | Don’t advertise Express |
| trust proxy | Correct client IP behind ingress |

**Point at:** `backend/src/security/headers.ts`, `app.ts`

### 4.9 Logging privacy

Pino redacts: passwords, tokens, Authorization headers, MFA codes, secrets.

**What you say:**

> “Logs are useless for security if they themselves leak secrets. We redact sensitive fields centrally so developers can’t accidentally log tokens.”

### 4.10 Security posture API

`GET /api/platform/security/posture` returns:

- which controls are on  
- MFA / lockout counts  
- OWASP mapping list  

**What you say:**

> “I treat security as something observable — same as latency. This endpoint is how I’d brief an auditor or interviewer on what’s actually enabled.”

**Point at:** `backend/src/security/posture.ts`

### 4.11 DevSecOps CI (detailed)

| Tool | Catches |
|------|---------|
| **Gitleaks** | Secrets accidentally committed |
| **Semgrep** | Insecure code patterns (OWASP rules) |
| **CodeQL** | Deeper semantic vulnerabilities |
| **npm audit / Dependabot** | Vulnerable libraries |
| **Trivy** | CVEs in container images |
| **CycloneDX SBOM** | Inventory of what’s in the release |

**What you say:**

> “Shift-left security: find issues before production. Different tools catch different classes of risk — secrets, code, dependencies, and images. SBOM supports vulnerability response later.”

**Point at:** `.github/workflows/ci.yml`

### 4.12 OWASP Top 10 — your talk track

| Item | How this project addresses it |
|------|-------------------------------|
| A01 Broken Access Control | JWT + RBAC on sensitive routes |
| A02 Cryptographic Failures | scrypt/bcrypt, hashed refresh, HMAC |
| A03 Injection | Parameterized SQL + Zod |
| A04 Insecure Design | Lockout, MFA, outbox, SSRF |
| A05 Security Misconfiguration | Helmet, headers, CORS, no X-Powered-By |
| A07 Identification/Auth Failures | MFA, lockout, rotation, denylist |
| A08 Software/Data Integrity | SBOM + CI scanning |
| A09 Logging/Monitoring Failures | security_events + redaction + metrics/traces |
| A10 SSRF | assertSafeOutboundUrl |

---

## 5. Reliability patterns — detailed

### Idempotency keys

**Problem:** Mobile app timeouts; user taps “Buy” twice → two orders / double stock decrement.

**Solution:** Client sends `Idempotency-Key: demo-order-1`.  
Server stores response for that user+method+path+key.  
Second request returns the first response.

**What you say:**

> “Idempotency makes retries safe. The key is scoped to the user and route so keys don’t collide across customers.”

**Point at:** `backend/src/lib/idempotency.ts`

### Optimistic locking

Product has `version`. Update must send expected version.  
If someone else updated first → `409 OPTIMISTIC_LOCK`.

**What you say:**

> “We don’t hold long DB locks for edits. We detect lost updates with a version column — classic optimistic concurrency.”

### Circuit breaker

States: **closed** (normal) → **open** (fail fast after N failures) → **half-open** (trial request).

Used for Redis and OpenAI.

**What you say:**

> “If a dependency is sick, failing fast is better than waiting on timeouts and exhausting our own threads. For AI we fall back to demo mode; for Redis we skip cache.”

**Point at:** `backend/src/lib/circuit-breaker.ts`

### Retry + jitter

Webhook delivery retries with exponential backoff and random jitter.

**What you say:**

> “Without jitter, all workers retry at the same moment and stampede the partner. Jitter spreads load.”

---

## 6. Observability — detailed

### Three pillars

| Pillar | In this project |
|--------|-----------------|
| Metrics | Prometheus `/metrics` |
| Logs | Pino JSON + correlation id |
| Traces | OpenTelemetry → Jaeger (optional compose) |

### Correlation ID flow

1. Client may send `X-Request-Id`.  
2. Else server generates UUID.  
3. Stored in AsyncLocalStorage.  
4. Returned as response header.  
5. Included in logs/errors.

**What you say:**

> “When a user reports an error, one id lets us stitch logs across workers and dependencies.”

### Health probes

| Endpoint | Meaning for Kubernetes |
|----------|-------------------------|
| `/health/live` | Process up — don’t restart just because DB is slow |
| `/health/ready` | Safe to receive traffic (DB check) |

**What you say:**

> “Splitting liveness and readiness avoids restart loops when a dependency blips.”

### Demo command

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d
```

- Grafana: `http://localhost:3001` (admin/admin)  
- Jaeger: `http://localhost:16686`  
- Prometheus: `http://localhost:9090`

---

## 7. DevOps / Platform — detailed

### Pipeline story

```
Code push
  → GitHub Actions CI (build, test, lint, security scans, kustomize/terraform validate)
  → Images to registry (ECR in AWS story)
  → Argo CD syncs desired state from git
  → Blue/green: deploy green → health check → flip service → rollback if bad
```

### What each piece is (simple definitions)

| Term | Meaning |
|------|---------|
| Docker | Package app + runtime |
| Kubernetes | Orchestrate containers, probes, scale |
| Kustomize | Overlay YAML for local/prod/aws without templates |
| Terraform | Create cloud infra as code |
| Argo CD | GitOps — cluster matches git |
| Blue/green | Two environments; switch traffic after green is healthy |
| HPA | Auto-scale pods on CPU/memory |
| PDB | Don’t evict too many pods during maintenance |
| NetworkPolicy | Limit pod network connections |

### Honest senior closing

> “What I implemented is blue/green with health-gated cutover. Canary would be next for progressive traffic. Streams is a Kafka/SQS stand-in. For identity at enterprise scale I’d add OIDC against Cognito or Okta and keep our RBAC claims.”

---

## 8. AI Assistant — detailed

### One-liner

> “An LLM feature that answers from a live SQL snapshot — not from invented numbers.”

### Step-by-step

1. Admin/manager opens `/ai`.  
2. `GET /api/ai/status` builds a **BusinessSnapshot** (orders, revenue, low stock, etc.) — no LLM yet.  
3. User asks a question → `POST /api/ai/insights`.  
4. Server rebuilds snapshot.  
5. If `OPENAI_API_KEY` set → OpenAI Chat Completions with system prompt: use only provided JSON.  
6. Else → demo rules using the same snapshot.  
7. Circuit breaker: repeated OpenAI failures → demo fallback.  
8. Enterprise tab uses industry playbooks (retail, supply chain, finance, operations).

### What you say

> “The hard part isn’t calling OpenAI — it’s grounding. We serialize real aggregates into the prompt and instruct the model not to invent metrics. Demo mode proves the product works without a key.”

**Point at:** `backend/src/services/ai/snapshot.ts`, `ai.service.ts`

---

## 9. ML Lab — detailed

### One-liner

> “Classic ML implemented from scratch so I can explain training, not only call .fit().”

### Pipeline you should recite

```
Data (products SQL)
 → Features (numeric vectors)
 → Train/test split
 → Train (gradient descent / k-means / TF-IDF)
 → Evaluate (MAE, accuracy, etc.)
 → Inspect weights / clusters / similar docs
```

### Four experiments

| Task | Learns | Output |
|------|--------|--------|
| Linear regression | Predict price | Weights + MAE/RMSE/R² |
| Logistic regression | Low-stock class (without using stock feature) | Precision/recall |
| K-means | Groups without labels | Clusters + inertia |
| TF-IDF | Text → vectors | Cosine-ranked matches |

### What you say

> “Supervised learning needs X and y. Unsupervised only needs X. Gradient descent repeatedly nudges weights to reduce loss. We hold out a test set so we measure generalization, not memorization.”

**Point at:** `backend/src/services/ml/algorithms.ts` · UI `/ml`  
**Doc:** [LEARN_AI_ML.md](LEARN_AI_ML.md)

---

## 10. End-to-end request walkthrough

Use this when they say “walk me through a request.”

### Example: Place order

```
1. Client → POST /api/v1/orders
   Headers: Authorization: Bearer <access>, Idempotency-Key: abc, X-Request-Id: ...

2. correlationMiddleware sets/echoes request id

3. rate limiter

4. authenticate → verify JWT signature, expiry, type=access, jti not denylisted

5. Zod validates body

6. idempotency lookup (optional hit → return cached 201)

7. withTransaction:
     lock products, decrement stock, insert order/items
     insert outbox OrderCreated

8. save idempotent response

9. return order JSON + X-Request-Id

10. async: outbox poller → Redis Stream → webhook (SSRF+HMAC+retry)
    optional: domain event → audit log
```

Practice saying this without looking.

---

## 11. STAR stories

### Reliability

- **S:** Need safe order creation under retries and async integrations  
- **T:** No double stock hits; no lost notifications  
- **A:** Idempotency keys + transactional outbox + Streams + HMAC webhooks  
- **R:** Retries are safe; messaging status visible via platform API  

### Security

- **S:** API needed more than basic JWT  
- **T:** Abuse resistance, post-logout token invalidation, safe webhooks  
- **A:** scrypt, lockout, TOTP, jti denylist, SSRF guard, DevSecOps CI  
- **R:** Posture API maps controls to OWASP; can demo MFA enrollment  

### Delivery

- **S:** Deploy without long downtime  
- **T:** Safe cutover + rollback  
- **A:** K8s blue/green, probes, Argo CD, Terraform  
- **R:** Health-gated switch; documented runbooks  

---

## 12. 10-minute live demo

| Time | Action | Say |
|------|--------|-----|
| 0:00 | Opening speech | Section 2 |
| 0:40 | System page / feature flags | “These are runtime toggles” |
| 1:30 | `GET .../security/posture` | Walk OWASP list |
| 3:00 | Idempotent order twice | “Same key → same order” |
| 4:00 | Messaging status | Outbox published count |
| 5:00 | `/ai` one question | “Grounded in snapshot” |
| 6:30 | `/ml` regression once | “Loss trends down” |
| 8:00 | Show CI workflow + blue/green doc | DevSecOps + delivery |
| 9:30 | Gaps + next steps | Kafka/OIDC/canary |

---

## 13. Hard questions + model answers

**Q: Isn’t JWT stateless? Why a denylist?**  
> “Access tokens are still verified cryptographically, but logout and forced revoke need a short-lived denylist keyed by jti until natural expiry. Refresh tokens are stateful already.”

**Q: Why not argon2?**  
> “Argon2 is excellent; I used Node scrypt to avoid native addons in this portfolio while still teaching memory-hard KDFs. Migration path is the same PHC-style string.”

**Q: How do you prevent SQL injection?**  
> “No string-concatenated SQL for user input. Parameterized queries via `pg` and Zod validation before we touch the DB.”

**Q: What’s the biggest production gap?**  
> “Replace Redis Streams with managed Kafka/SQS, add enterprise OIDC, and consider canary. The designs — outbox, RBAC, probes — stay.”

**Q: How does this scale?**  
> “Node cluster for multi-core, Postgres pool, Redis cache, HPA on Kubernetes, read model caching. Writes stay transactional; reads can scale out.”

**Q: Explain circuit breaker vs retry.**  
> “Retry helps transient blips. Circuit breaker stops calling a dependency that’s clearly down, so we fail fast and protect ourselves.”

---

## 14. Night-before checklist

- [ ] Opening speech fluently  
- [ ] Draw layering + outbox on paper  
- [ ] Explain SSRF + `169.254.169.254`  
- [ ] Explain scrypt vs plain hashing  
- [ ] Explain MFA enrollment steps  
- [ ] Explain idempotency with an example  
- [ ] Name CI security tools (6)  
- [ ] Admit 2 gaps + next steps  
- [ ] Know demo login and `/ai`, `/ml`, posture URL  

### Closing line

> “I built this to show I can own a system end-to-end — features, failure modes, security, operability, and how I’d evolve it in production.”

---

## Quick file map (screen share)

| Topic | File |
|-------|------|
| Outbox | `backend/src/messaging/outbox.ts` |
| Order + outbox write | `backend/src/database/repositories/order.repository.ts` |
| Passwords | `backend/src/security/password.ts` |
| MFA | `backend/src/security/totp.ts` |
| SSRF | `backend/src/security/ssrf.ts` |
| Security posture | `backend/src/security/posture.ts` |
| Auth orchestration | `backend/src/services/auth.service.ts` |
| Circuit breaker | `backend/src/lib/circuit-breaker.ts` |
| AI snapshot | `backend/src/services/ai/snapshot.ts` |
| ML algorithms | `backend/src/services/ml/algorithms.ts` |
| CI | `.github/workflows/ci.yml` |
| Blue/green | `docs/BLUE_GREEN.md` |
