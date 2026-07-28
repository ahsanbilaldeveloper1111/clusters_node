import { getSalesByCategory } from '../../database/queries/analytics.queries.js';
import { query } from '../../database/pool.js';
import type { AiContext, BusinessSnapshot } from './types.js';

export async function buildBusinessSnapshot(context: AiContext = 'general'): Promise<BusinessSnapshot> {
  const [{ rows: orderStats }, salesByCategory, { rows: stockRows }] = await Promise.all([
    query<{ total_orders: string; total_revenue: string }>(`
      SELECT COUNT(*)::text AS total_orders,
             COALESCE(SUM(total_amount), 0)::text AS total_revenue
      FROM orders WHERE status NOT IN ('cancelled')
    `),
    getSalesByCategory(),
    query<{ low_stock: string }>(`
      SELECT COUNT(*)::text AS low_stock FROM products WHERE stock < 10
    `),
  ]);

  const snapshot: BusinessSnapshot = {
    context,
    totalOrders: Number(orderStats[0]?.total_orders ?? 0),
    totalRevenue: orderStats[0]?.total_revenue ?? '0',
    topCategories: salesByCategory.slice(0, 5).map((c) => ({
      category: c.category,
      revenue: c.revenue,
      order_count: c.order_count,
    })),
    lowStockCount: Number(stockRows[0]?.low_stock ?? 0),
  };

  if (context === 'orders' || context === 'general') {
    const { rows } = await query<{ id: string; status: string; total: string; created_at: string }>(`
      SELECT id::text, status, total_amount::text AS total, created_at::text
      FROM orders
      ORDER BY created_at DESC
      LIMIT 8
    `);
    snapshot.recentOrders = rows;
  }

  if (context === 'products' || context === 'general') {
    const [{ rows: top }, { rows: low }] = await Promise.all([
      query<{ id: string; name: string; category: string; stock: number; price: string }>(`
        SELECT id::text, name, COALESCE(category, 'Uncategorized') AS category, stock, price::text
        FROM products
        ORDER BY stock DESC
        LIMIT 8
      `),
      query<{ id: string; name: string; category: string; stock: number }>(`
        SELECT id::text, name, COALESCE(category, 'Uncategorized') AS category, stock
        FROM products
        WHERE stock < 10
        ORDER BY stock ASC
        LIMIT 8
      `),
    ]);
    snapshot.topProducts = top;
    snapshot.lowStockProducts = low;
  }

  return snapshot;
}

export function snapshotSources(context: AiContext): string[] {
  const base = ['orders', 'order_items', 'products', 'analytics.queries'];
  if (context === 'orders') return ['orders', 'order_items', 'analytics.queries'];
  if (context === 'products') return ['products', 'analytics.queries'];
  return base;
}
