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

## Architecture / design patterns

| Concept | Where | Why it matters |
|---------|-------|----------------|
| **Repository pattern** | `backend/src/database/repositories/*` | Isolate SQL from HTTP layer |
| **Domain events (Observer)** | [`backend/src/events/`](../backend/src/events/) | Decouple audit logging from order/auth flows |
| **Strategy (AI)** | Demo vs OpenAI providers in `ai.service.ts` | Swap implementations behind one interface |
| **Result / Either** | [`backend/src/lib/result.ts`](../backend/src/lib/result.ts) | Explicit success/failure without exceptions for cache |
| **Feature flags** | [`backend/src/config/features.ts`](../backend/src/config/features.ts) | Toggle AI / idempotency / events / breakers via env |
| **Unit of Work** | `withTransaction` in `pool.ts` | Atomic order create + stock decrement |

## Runtime / Node.js

| Concept | Where |
|---------|-------|
| **Cluster mode** | `backend/src/cluster/primary.ts` |
| **Worker Threads** | `backend/src/workers/` |
| **AsyncLocalStorage** | correlation context across async calls |
| **Structured logging** | Pino + correlation id in error responses |

## Demo how to show these

1. Open **System** page → see `advanced.concepts`, circuit states, feature flags.
2. Place an order twice with the same header:
   ```bash
   curl -X POST http://localhost:3000/api/orders \
     -H "Authorization: Bearer $TOKEN" \
     -H "Idempotency-Key: demo-order-1" \
     -H "Content-Type: application/json" \
     -d '{"items":[{"productId":"<uuid>","quantity":1}]}'
   ```
   Second call returns the same order (no double stock hit).
3. Edit a product with stale `expectedVersion` → `409 OPTIMISTIC_LOCK`.
4. Check response header `X-Request-Id` and matching `correlationId` in error JSON.

## Env flags

```bash
FEATURE_AI_INSIGHTS=true
FEATURE_IDEMPOTENCY=true
FEATURE_CIRCUIT_BREAKER=true
FEATURE_DOMAIN_EVENTS=true
```
