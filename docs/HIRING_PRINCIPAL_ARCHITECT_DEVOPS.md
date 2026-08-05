# Hiring guide — Principal SE / Software Architect / DevOps

This project is built as an **interview portfolio** for senior roles. Use this doc to map
technologies → talking points → live demos.

Related:

- [INTERVIEW_EXPLANATION.md](INTERVIEW_EXPLANATION.md) — **practice scripts / what to say out loud**
- [ADVANCED_CONCEPTS.md](ADVANCED_CONCEPTS.md) — pattern → file map  
- [LEARN_AI_ML.md](LEARN_AI_ML.md) — AI/ML lab walkthrough  
- [DEMO.md](DEMO.md) — 10-minute live script  
- [SECURITY_DEVELOPMENT.md](SECURITY_DEVELOPMENT.md) — security deep dive  

---

## Role → what to emphasize

| Role | Lead with | Support with |
|------|-----------|--------------|
| **Principal Software Engineer** | Reliability (idempotency, outbox, circuit breaker, retries), observability (OTel + metrics), API versioning | AI grounding, CQRS-lite, feature flags |
| **Software Architect** | End-to-end architecture (layered + events + outbox), tradeoffs (in-process bus → Redis Streams), CQRS read model | Security (RBAC, HMAC webhooks), OpenAPI-from-Zod |
| **DevOps / Platform** | Terraform → EKS → Argo CD blue/green, CI (CodeQL + Trivy), Prometheus/Grafana/Jaeger | HPA/PDB/NetworkPolicy, graceful shutdown, k6 load |

---

## Stack matrix (what exists)

### Platform & DevOps

| Technology | Where | Interview line |
|------------|-------|----------------|
| Docker multi-stage | `docker/*.Dockerfile` | Non-root, minimal prod image |
| Kubernetes + Kustomize | `k8s/` | Base + overlays; HPA, PDB, NetworkPolicy |
| Blue/green deploy | `k8s/components/blue-green/`, `docs/BLUE_GREEN.md` | Health-gated cutover + rollback |
| Argo CD GitOps | `k8s/argocd/`, `docs/ARGOCD.md` | Desired-state continuous delivery |
| Terraform (AWS) | `terraform/` | VPC, EKS, RDS, ElastiCache, Secrets Manager, Lambda |
| GitHub Actions CI/CD | `.github/workflows/` | Build, migrate, test, Kustomize validate, Terraform |
| CodeQL SAST | CI `codeql` job | Shift-left static analysis |
| Trivy image scan | CI `trivy` job | Container CVE gate |
| k6 load smoke | `load/k6-smoke.js` | SLO-ish thresholds on p95 / error rate |

### Reliability & distributed systems

| Technology | Where | Interview line |
|------------|-------|----------------|
| Idempotency keys | `backend/src/lib/idempotency.ts` | Safe client retries |
| Optimistic locking | `products.version` | Lost-update prevention |
| Circuit breaker | `backend/src/lib/circuit-breaker.ts` | Fail-fast + degrade |
| Retry + jitter | `backend/src/lib/retry.ts` | Avoid thundering herd |
| Transactional outbox | `database/init/06-outbox-webhooks.sql`, `messaging/outbox*.ts` | No dual-write loss |
| Redis Streams | `messaging/redis-streams.ts` | At-least-once broker stand-in for Kafka/SQS |
| Domain events | `events/event-bus.ts` | In-process Observer; outbox is the durable path |
| Graceful shutdown | `server.ts`, K8s `preStop` | Drain before kill |
| Health live/ready | `/health/live`, `/health/ready` | Probe separation |

### Observability

| Technology | Where | Interview line |
|------------|-------|----------------|
| Prometheus metrics | `/metrics`, `metrics.middleware.ts` | RED-style HTTP histograms |
| Correlation IDs | `request-context.ts` | Trace a request across logs |
| OpenTelemetry OTLP | `observability/telemetry.ts` | Traces → Jaeger |
| Grafana + Prometheus + Jaeger | `docker-compose.observability.yml` | Metrics + traces in one stack |
| Structured logging | Pino | JSON logs with correlation |

### Architecture & API

| Technology | Where | Interview line |
|------------|-------|----------------|
| Layered architecture | routes → services → repos | Clear boundaries |
| Repository + Unit of Work | `order.repository.ts`, `withTransaction` | Atomic writes |
| CQRS-lite read model | `cqrs-read.service.ts`, `GET /api/platform/read-model/commerce` | Separate read path + cache |
| API versioning `/api/v1` | `app.ts` | Non-breaking evolution |
| OpenAPI from Zod | `openapi/` | Single source of truth |
| HMAC webhooks | `messaging/webhooks.ts` | Partner integrations |
| Feature flags | `config/features.ts` | Progressive delivery toggles |
| Strategy (AI providers) | `services/ai/` | Swap OpenAI vs demo |
| RBAC | auth middleware + frontend permissions | Least privilege |

### Data & Node runtime

| Technology | Where | Interview line |
|------------|-------|----------------|
| PostgreSQL advanced SQL | CTEs, window, JSONB, trigram | DB-side analytics |
| Redis cache-aside | `cache/redis.ts` | Graceful when Redis down |
| Cluster + Worker Threads | `cluster/`, `workers/` | Multi-core Node |
| Tracked migrations | `database/migrate.ts` | Repeatable schema |

### AI / ML (differentiation)

| Technology | Where | Interview line |
|------------|-------|----------------|
| Grounded LLM assistant | `/ai`, `services/ai/` | Snapshot grounding + circuit fallback |
| Enterprise industry playbooks | `ai/industries.ts` | Domain framing |
| From-scratch ML lab | `/ml`, `services/ml/` | You can explain GD / TF-IDF |

---

## Live demo scripts (interview day)

### A) Reliability + outbox (5 min)

1. Open **System** → show feature flags + concepts list.
2. `GET /api/platform/messaging/status` — outbox pending/published.
3. Place an order (UI or curl with `Idempotency-Key`).
4. Re-place with same key → same response (idempotency).
5. Show outbox row published → Redis Stream → webhook delivery (if `WEBHOOK_URL` set).

### B) Observability (5 min)

```bash
docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d
```

1. Hit APIs to generate traffic.
2. Prometheus `http://localhost:9090` — query HTTP metrics.
3. Grafana `http://localhost:3001` (admin/admin) — Prometheus + Jaeger datasources.
4. Jaeger UI `http://localhost:16686` — search service `enterprise-backend`.
5. Show `X-Request-Id` response header matching logs.

### C) DevOps (5 min)

1. Walk Terraform modules (EKS/RDS/ECR).
2. Show Argo CD app + blue/green overlay.
3. Point at CI: CodeQL + Trivy + Kustomize validate.
4. Optional: `k6 run load/k6-smoke.js`.

### D) Architect narrative (verbal)

> Commands write orders inside a DB transaction and insert an **outbox** row in the same TX. A poller publishes to **Redis Streams** (Kafka/SQS stand-in). Consumers deliver **HMAC webhooks** with retries. Reads for dashboards go through a **CQRS-lite** cached read model. We expose **Prometheus** metrics and optional **OpenTelemetry** traces. Delivery is **GitOps blue/green** on EKS.

---

## Honest gaps (say this — it sounds Principal)

| Gap | Next production step |
|-----|----------------------|
| Redis Streams ≠ Kafka | Swap publisher to SQS/Kafka; keep outbox table |
| OIDC not app-native | Add Cognito/Keycloak; keep RBAC claims |
| Canary not implemented | Argo Rollouts beside existing blue/green |
| Soft-fail Trivy/audit in CI | Tighten exit codes once baseline is clean |
| In-process EventEmitter still exists | Prefer outbox for anything cross-service |

Owning the gaps shows judgment.

---

## Env flags (new)

```bash
FEATURE_OUTBOX=true
FEATURE_WEBHOOKS=true
WEBHOOK_URL=
WEBHOOK_SECRET=
OTEL_ENABLED=false
OTEL_SERVICE_NAME=enterprise-backend
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
```

---

## Quick API cheatsheet

| Endpoint | Purpose |
|----------|---------|
| `GET /api/platform/messaging/status` | Outbox + webhook + OTel flags |
| `GET /api/platform/read-model/commerce` | CQRS-lite read model |
| `GET /api/v1/*` | Versioned API alias |
| `GET /metrics` | Prometheus scrape |
| `GET /health/live` · `/health/ready` | K8s probes |

---

## Resume bullets (copy/adapt)

- Designed transactional **outbox + Redis Streams** messaging with HMAC partner **webhooks** and retry/jitter.
- Added **OpenTelemetry** tracing and a local **Prometheus/Grafana/Jaeger** stack alongside existing RED metrics.
- Implemented **CQRS-lite** read models and **`/api/v1`** versioning on a Node/TypeScript commerce platform.
- Hardened CI with **CodeQL** SAST and **Trivy** container scanning; load smoke via **k6**.
- Implemented **scrypt** password hashing, **TOTP MFA**, login lockout, and **JWT jti denylist**.
- Added **SSRF protections** for server-side webhooks and hardened HTTP security headers / CORS allowlisting.
- Built DevSecOps pipeline with **CodeQL, Semgrep, Gitleaks, Trivy, and CycloneDX SBOM**.
- Operated **GitOps blue/green** on Kubernetes (Argo CD) with Terraform-provisioned AWS (EKS/RDS/ElastiCache).
