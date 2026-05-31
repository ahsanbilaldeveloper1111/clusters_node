# API Reference

Base URL: `http://localhost:3000/api` (dev) or `http://localhost:8080/api` (Docker via nginx)

## Auth

### POST `/auth/login`

```json
{ "email": "admin@enterprise.local", "password": "Password123!" }
```

**Response:**

```json
{
  "data": {
    "token": "eyJhbG...",
    "user": { "id": "...", "email": "...", "fullName": "...", "role": "admin" }
  }
}
```

## Products

### GET `/products`

List all products. Optional query: `?category=Electronics`

Cached in Redis for 120s when Redis is available.

### GET `/products/search?q=keyboard`

Trigram similarity search.

### GET `/products/:id`

Single product by UUID.

## Orders (authenticated)

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
