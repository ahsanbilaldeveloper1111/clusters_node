# Advanced concepts in this codebase

Interview-friendly map of patterns implemented in this project (with file paths).

## Distributed / reliability

| Concept | Where | Why it matters |
|---------|-------|----------------|
| **Correlation IDs** | [`backend/src/lib/request-context.ts`](../backend/src/lib/request-context.ts) | Trace a request across logs; `X-Request-Id` on every response |
| **Circuit breaker** | [`backend/src/lib/circuit-breaker.ts`](../backend/src/lib/circuit-breaker.ts) | Fail fast / degrade when Redis or OpenAI is down |
| **Idempotency keys** | [`backend/src/lib/idempotency.ts`](../backend/src/lib/idempotency.ts) + `Idempotency-Key` on `POST /api/orders` | Safe client retries without double-charging stock |
| **Optimistic locking** | `products.version` + `expectedVersion` on PATCH | Prevent lost updates under concurrent edits |
| **Graceful degradation** | Redis cache via Result type | App stays up if cache/circuit fails |
| **Retry + jitter** | [`backend/src/lib/retry.ts`](../backend/src/lib/retry.ts) | Resilient webhook delivery without thundering herds |
| **Transactional outbox** | [`backend/src/messaging/`](../backend/src/messaging/) + `database/init/06-outbox-webhooks.sql` | Reliable messaging; same TX as order write |
| **Redis Streams** | `messaging/redis-streams.ts` | At-least-once broker (Kafka/SQS stand-in) |
| **HMAC webhooks** | `messaging/webhooks.ts` | Partner integrations with signed payloads |

## Architecture / design patterns

| Concept | Where | Why it matters |
|---------|-------|----------------|
| **Repository pattern** | `backend/src/database/repositories/*` | Isolate SQL from HTTP layer |
| **Domain events (Observer)** | [`backend/src/events/`](../backend/src/events/) | Decouple audit logging from order/auth flows |
| **Strategy (AI)** | Demo vs OpenAI providers in `ai.service.ts` | Swap implementations behind one interface |
| **Result / Either** | [`backend/src/lib/result.ts`](../backend/src/lib/result.ts) | Explicit success/failure without exceptions for cache |
| **Feature flags** | [`backend/src/config/features.ts`](../backend/src/config/features.ts) | Toggle AI / idempotency / events / outbox / webhooks |
| **Unit of Work** | `withTransaction` in `pool.ts` | Atomic order create + stock decrement + outbox insert |
| **CQRS-lite** | `services/cqrs-read.service.ts` · `GET /api/platform/read-model/commerce` | Separate cached read model from command repos |
| **API versioning** | `/api/v1/*` aliases in `app.ts` | Non-breaking API evolution |

## Observability

| Concept | Where |
|---------|-------|
| **Prometheus metrics** | `/metrics` |
| **OpenTelemetry traces** | `backend/src/observability/telemetry.ts` → Jaeger OTLP |
| **Grafana stack** | `docker-compose.observability.yml` |

## Runtime / Node.js

| Concept | Where |
|---------|-------|
| **Cluster mode** | `backend/src/cluster/primary.ts` |
| **Worker Threads** | `backend/src/workers/` |
| **AsyncLocalStorage** | correlation context across async calls |
| **Structured logging** | Pino + correlation id in error responses |

## Demo how to show these

1. Open **System** page → see `advanced.concepts`, circuit states, feature flags.
2. `GET /api/platform/messaging/status` → outbox / webhook counters.
3. Place an order twice with the same header:
   ```bash
   curl -X POST http://localhost:3000/api/v1/orders \
     -H "Authorization: Bearer $TOKEN" \
     -H "Idempotency-Key: demo-order-1" \
     -H "Content-Type: application/json" \
     -d '{"items":[{"productId":"<uuid>","quantity":1}]}'
   ```
   Second call returns the same order (no double stock hit).
4. Edit a product with stale `expectedVersion` → `409 OPTIMISTIC_LOCK`.
5. Check response header `X-Request-Id` and matching `correlationId` in error JSON.
6. Optional observability: `docker compose -f docker-compose.yml -f docker-compose.observability.yml up -d`

For Principal / Architect / DevOps interview framing, see **[HIRING_PRINCIPAL_ARCHITECT_DEVOPS.md](HIRING_PRINCIPAL_ARCHITECT_DEVOPS.md)**.

## Env flags

```bash
FEATURE_AI_INSIGHTS=true
FEATURE_IDEMPOTENCY=true
FEATURE_CIRCUIT_BREAKER=true
FEATURE_DOMAIN_EVENTS=true
FEATURE_OUTBOX=true
FEATURE_WEBHOOKS=true
OTEL_ENABLED=false
```
