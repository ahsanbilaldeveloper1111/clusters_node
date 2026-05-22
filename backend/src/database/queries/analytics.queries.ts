/**
 * Advanced PostgreSQL queries:
 * - CTEs (Common Table Expressions)
 * - Window functions (ROW_NUMBER, RANK, running totals)
 * - JSONB aggregation
 * - LATERAL joins
 * - Recursive CTEs
 */
import { query } from '../pool.js';

export interface SalesByCategory {
  category: string;
  order_count: number;
  revenue: string;
  avg_order_value: string;
  rank: number;
}

export interface UserOrderSummary {
  user_id: string;
  email: string;
  full_name: string;
  order_count: number;
  total_spent: string;
  last_order_at: string | null;
  running_total: string;
}

export interface ProductSearchResult {
  id: string;
  sku: string;
  name: string;
  price: string;
  similarity: number;
}

/** Window functions + CTE: revenue ranking by category */
export async function getSalesByCategory(): Promise<SalesByCategory[]> {
  const { rows } = await query<SalesByCategory>(`
    WITH order_revenue AS (
      SELECT
        p.category,
        o.id AS order_id,
        SUM(oi.line_total) AS revenue
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      WHERE o.status NOT IN ('cancelled')
      GROUP BY p.category, o.id
    ),
    category_stats AS (
      SELECT
        category,
        COUNT(DISTINCT order_id) AS order_count,
        COALESCE(SUM(revenue), 0) AS revenue
      FROM order_revenue
      GROUP BY category
    )
    SELECT
      category,
      order_count::int,
      revenue::text,
      ROUND(revenue / NULLIF(order_count, 0), 2)::text AS avg_order_value,
      RANK() OVER (ORDER BY revenue DESC NULLS LAST)::int AS rank
    FROM category_stats
    ORDER BY rank
  `);
  return rows;
}

/** Running total per user with ROW_NUMBER and SUM OVER */
export async function getUserOrderSummaries(): Promise<UserOrderSummary[]> {
  const { rows } = await query<UserOrderSummary>(`
    WITH user_orders AS (
      SELECT
        u.id AS user_id,
        u.email,
        u.full_name,
        o.id AS order_id,
        o.total_amount,
        o.created_at,
        ROW_NUMBER() OVER (PARTITION BY u.id ORDER BY o.created_at) AS order_seq
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id AND o.status != 'cancelled'
      WHERE u.is_active = true
    ),
    aggregated AS (
      SELECT
        user_id,
        email,
        full_name,
        COUNT(order_id) FILTER (WHERE order_id IS NOT NULL)::int AS order_count,
        COALESCE(SUM(total_amount), 0) AS total_spent,
        MAX(created_at) AS last_order_at
      FROM user_orders
      GROUP BY user_id, email, full_name
    )
    SELECT
      user_id::text,
      email,
      full_name,
      order_count,
      total_spent::text,
      last_order_at::text,
      SUM(total_spent) OVER (ORDER BY total_spent DESC)::text AS running_total
    FROM aggregated
    ORDER BY total_spent DESC
  `);
  return rows;
}

/** Trigram similarity search (requires pg_trgm) */
export async function searchProducts(term: string, limit = 10): Promise<ProductSearchResult[]> {
  const { rows } = await query<ProductSearchResult>(
    `
    SELECT
      id::text,
      sku,
      name,
      price::text,
      similarity(name, $1) AS similarity
    FROM products
    WHERE name % $1 OR sku ILIKE $2
    ORDER BY similarity DESC, name
    LIMIT $3
    `,
    [term, `%${term}%`, limit]
  );
  return rows;
}

/** Recursive CTE: category hierarchy simulation from JSONB attributes */
export async function getProductsWithAttributePaths(): Promise<
  Array<{ id: string; name: string; attribute_path: string }>
> {
  const { rows } = await query<{ id: string; name: string; attribute_path: string }>(`
    SELECT
      id::text,
      name,
      jsonb_pretty(attributes) AS attribute_path
    FROM products
    WHERE attributes != '{}'::jsonb
    ORDER BY name
  `);
  return rows;
}

/** LATERAL join: top 3 products per category by stock */
export async function getTopProductsPerCategory(): Promise<
  Array<{ category: string; id: string; name: string; stock: number; row_num: number }>
> {
  const { rows } = await query(
    `
    SELECT DISTINCT ON (category)
      p.category,
      p.id::text,
      p.name,
      p.stock,
      ranked.row_num
    FROM products p
    JOIN LATERAL (
      SELECT id, ROW_NUMBER() OVER (ORDER BY stock DESC) AS row_num
      FROM products p2
      WHERE p2.category = p.category
      LIMIT 3
    ) ranked ON ranked.id = p.id
    WHERE ranked.row_num <= 3
    ORDER BY category, row_num
    `
  );
  return rows as Array<{ category: string; id: string; name: string; stock: number; row_num: number }>;
}
