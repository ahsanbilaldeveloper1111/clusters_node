/**
 * CQRS-lite read models — separate read paths from command (write) repositories.
 * Architect talking point: scale reads independently; cache analytics aggressively.
 */
import { getSalesByCategory, getUserOrderSummaries } from '../database/queries/analytics.queries.js';
import { cacheGet, cacheSet } from '../cache/redis.js';
import { query } from '../database/pool.js';

const TTL = 60;

export async function getCommerceReadModel() {
  const cacheKey = 'cqrs:commerce-read-model';
  const cached = await cacheGet<{
    salesByCategory: unknown[];
    topCustomers: unknown[];
    orderStatusCounts: unknown[];
    generatedAt: string;
  }>(cacheKey);
  if (cached) return { ...cached, cacheHit: true as const };

  const [salesByCategory, userSummaries, { rows: orderStatusCounts }] = await Promise.all([
    getSalesByCategory(),
    getUserOrderSummaries(),
    query<{ status: string; count: string }>(`
      SELECT status, COUNT(*)::text AS count
      FROM orders
      GROUP BY status
      ORDER BY count DESC
    `),
  ]);

  const topCustomers = userSummaries
    .slice()
    .sort((a, b) => Number(b.total_spent ?? 0) - Number(a.total_spent ?? 0))
    .slice(0, 5);

  const model = {
    salesByCategory,
    topCustomers,
    orderStatusCounts: orderStatusCounts.map((r) => ({
      status: r.status,
      count: Number(r.count),
    })),
    generatedAt: new Date().toISOString(),
  };
  await cacheSet(cacheKey, model, TTL);
  return { ...model, cacheHit: false as const };
}
