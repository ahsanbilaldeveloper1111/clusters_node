# PostgreSQL Database

## Schema

| Table | Purpose |
|-------|---------|
| `users` | Auth, roles (`admin`, `manager`, `customer`), JSONB `metadata` |
| `products` | Catalog with JSONB `attributes`, stock |
| `orders` | User orders, status enum, JSONB `shipping_address` |
| `order_items` | Line items with **generated** `line_total` column |
| `audit_logs` | Change tracking with JSONB `payload` |

### Extensions

- `uuid-ossp` — UUID primary keys
- `pg_trgm` — Trigram similarity for product name search

## Advanced queries (in `analytics.queries.ts`)

### 1. CTE + window function — sales by category

Uses a **Common Table Expression** to aggregate revenue per order, then `RANK() OVER` to rank categories:

```sql
WITH order_revenue AS (...),
     category_stats AS (...)
SELECT category, order_count, revenue,
       RANK() OVER (ORDER BY revenue DESC) AS rank
FROM category_stats;
```

### 2. Window functions — user order summaries

`ROW_NUMBER() OVER (PARTITION BY user_id)` and `SUM() OVER` for running totals across users.

### 3. Trigram search — `searchProducts()`

```sql
SELECT ..., similarity(name, $1) AS similarity
FROM products
WHERE name % $1  -- pg_trgm similarity operator
ORDER BY similarity DESC;
```

Requires index: `gin (email gin_trgm_ops)` on names — see schema indexes.

### 4. LATERAL join — top products per category

```sql
JOIN LATERAL (
  SELECT id, ROW_NUMBER() OVER (ORDER BY stock DESC) AS row_num
  FROM products p2 WHERE p2.category = p.category
  LIMIT 3
) ranked ON ...
```

### 5. Transactions — `createOrder()`

Order creation uses `withTransaction()`:

1. `BEGIN`
2. `INSERT` order
3. For each item: `SELECT ... FOR UPDATE` (row lock), check stock, insert line, decrement stock
4. Update order total, insert audit log
5. `COMMIT` or `ROLLBACK` on error

## Migrations

**Docker init:** SQL in `database/init/` runs on first Postgres container start.

**Programmatic:** `npm run db:migrate` tracks applied files in `schema_migrations`.

## Seeding

```bash
npm run db:seed
```

Creates users (password `Password123!`) and sample products. Uses `ON CONFLICT` for idempotent runs.

## Connection pool

Configured via `DATABASE_URL`, `DB_POOL_MIN`, `DB_POOL_MAX`. Each cluster worker has its own pool — size pools accordingly:

```
max_connections_pg >= workers × DB_POOL_MAX + overhead
```

## JSONB usage

- User `metadata`: `{ "department": "IT" }`
- Product `attributes`: `{ "brand": "TechCorp" }`
- GIN indexes enable fast containment queries on attributes
