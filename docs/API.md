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
