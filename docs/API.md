# API Reference

Base URL: `http://localhost:3000/api` (dev) or `http://localhost:8080/api` (Docker via nginx)

**Interactive docs:** `http://localhost:3000/api/docs` (Swagger UI)  
**OpenAPI JSON:** `http://localhost:3000/api/openapi.json` (generated at runtime from Zod)

OpenAPI is **not** hand-edited. Schemas live in `backend/src/openapi/schemas.ts`; paths are registered in `backend/src/openapi/document.ts`. Routes import the same Zod schemas for validation.

```bash
npm run openapi:generate -w backend   # optional: write openapi.generated.json
```

## Auth

### POST `/auth/register`

```json
{ "email": "new@example.com", "password": "Password123!", "fullName": "New User" }
```

Creates a `customer` account and returns access + refresh tokens.

### POST `/auth/login`

```json
{ "email": "admin@enterprise.local", "password": "Password123!" }
```

**Response:**

```json
{
  "data": {
    "token": "eyJhbG...",
    "accessToken": "eyJhbG...",
    "refreshToken": "...",
    "expiresIn": "15m",
    "user": { "id": "...", "email": "...", "fullName": "...", "role": "admin" }
  }
}
```

### POST `/auth/refresh`

```json
{ "refreshToken": "..." }
```

Returns a new access + refresh token pair (rotation).

### POST `/auth/logout`

```json
{ "refreshToken": "..." }
```

Revokes the refresh token server-side.

## AI (authenticated: admin, manager)

### POST `/ai/insights`

Multi-turn chat grounded in live SQL. Optional `history` (last 10 turns) and `context`.

```json
{
  "question": "Which categories drive the most revenue?",
  "context": "general",
  "history": [
    { "role": "user", "content": "How many orders?" },
    { "role": "assistant", "content": "..." }
  ]
}
```

**Response:**

```json
{
  "data": {
    "answer": "...",
    "mode": "demo",
    "model": "rule-based-demo",
    "sources": ["orders", "products"],
    "context": "general",
    "generatedAt": "2026-..."
  }
}
```

### POST `/ai/summarize`

```json
{ "target": "orders" }
```

`target`: `orders` | `products` | `catalog`

### POST `/ai/recommend`

```json
{ "limit": 5, "focus": "low stock electronics" }
```

Returns `{ recommendations: [{ productId, name, category, stock, reason }], mode, model, generatedAt }`.

Set `OPENAI_API_KEY` on the API for `mode: "openai"` (circuit breaker falls back to demo).

## Products

### GET `/products`

List products. Optional: `?category=Electronics`  
**Pagination:** `?page=1&limit=20&q=laptop` returns `{ items, page, limit, total, totalPages }`.

Cached in Redis for 120s when Redis is available (non-paginated list).

### GET `/products/search?q=keyboard`

Trigram similarity search.

### GET `/products/:id`

Single product by UUID.

### POST `/products` (admin, manager)

Create product (`sku`, `name`, `price`, `stock`, …).

### PATCH `/products/:id` (admin, manager)

Supports optimistic locking via `expectedVersion` (returns `409 OPTIMISTIC_LOCK` on conflict).

### DELETE `/products/:id` (admin)

## Orders (authenticated)

### GET `/orders`

Own orders. Staff can use `?page=1&all=true` for all orders.

### POST `/orders`

Create order with stock reservation (`FOR UPDATE` + transaction).

Optional header for safe retries:

```
Idempotency-Key: <unique-client-key>
```

### POST `/orders/:id/cancel`

Cancel order and restore stock (not allowed if shipped/delivered).

## Audit (admin, manager)

### GET `/audit?page=1&entityType=order`

Paginated audit trail of product/order/user events.

## Analytics (authenticated: admin, manager)

Header: `Authorization: Bearer <token>`

### GET `/orders`

List orders for the authenticated user.

### POST `/orders`

```json
{
  "items": [{ "productId": "uuid", "quantity": 1 }],
  "shippingAddress": { "city": "NYC", "zip": "10001" }
}
```

Creates order in a transaction with stock deduction.

## Analytics (admin/manager)

### GET `/analytics/sales-by-category`

CTE + `RANK()` revenue by category.

### GET `/analytics/user-summaries`

Window functions per user.

### GET `/analytics/top-products`

LATERAL join — top stock per category.

### POST `/analytics/calls/last-called-at`

Returns the most recent `called_at` for each requested remote party number. Numbers with no calls return `last_called_at: null`.

```json
{
  "remote_party_numbers": ["15551234567", "15559876543", "15550009999"]
}
```

**Response:**

```json
{
  "data": [
    { "remote_party_number": "15550009999", "last_called_at": null },
    { "remote_party_number": "15551234567", "last_called_at": "2026-05-22T12:00:00.000Z" },
    { "remote_party_number": "15559876543", "last_called_at": "2026-05-23T10:00:00.000Z" }
  ]
}
```

Max **50,000** numbers per request.

### POST `/analytics/calls/count`

Returns a single total: how many `call_analytics` rows match any number in the filter list. Uses a temp table + indexed join so large filter sets (up to **5,000,000** distinct numbers) stay efficient.

```json
{
  "remote_party_numbers": ["15551234567", "15559876543"]
}
```

**Response:**

```json
{
  "data": {
    "call_count": 3,
    "filter_count": 2
  }
}
```

`filter_count` is the number of distinct values loaded into the filter set. Request body limit: **100MB** (registered before the global JSON parser).

### POST `/analytics/compute`

Offloads CPU work to a Worker Thread.

```json
{ "task": "primes", "limit": 500000 }
```

Tasks: `primes` | `aggregate` | `hash`

## System

### GET `/health` (no prefix — root)

Health check for load balancers and Docker.

### GET `/system/info` (authenticated)

Node.js runtime and cluster worker metadata.

## Error format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": {}
  }
}
```

## Default users (after seed)

| Email | Role | Password |
|-------|------|----------|
| admin@enterprise.local | admin | Password123! |
| manager@enterprise.local | manager | Password123! |
| customer@enterprise.local | customer | Password123! |
