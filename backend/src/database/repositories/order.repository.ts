import { withTransaction, query } from '../pool.js';
import type pg from 'pg';
import { AppError, NotFoundError } from '../../utils/errors.js';
import type { PaginatedResult } from '../../utils/pagination.js';
import { toPaginated } from '../../utils/pagination.js';

export interface CreateOrderItem {
  productId: string;
  quantity: number;
}

export interface OrderRow {
  id: string;
  user_id: string;
  status: string;
  total_amount: string;
  created_at: Date;
}

export async function createOrder(
  userId: string,
  items: CreateOrderItem[],
  shippingAddress: Record<string, unknown>
): Promise<OrderRow> {
  return withTransaction(async (client: pg.PoolClient) => {
    const orderResult = await client.query<OrderRow>(
      `INSERT INTO orders (user_id, status, shipping_address)
       VALUES ($1, 'pending', $2)
       RETURNING id, user_id, status, total_amount, created_at`,
      [userId, JSON.stringify(shippingAddress)]
    );
    const order = orderResult.rows[0];
    if (!order) throw new Error('Failed to create order');

    let total = 0;
    for (const item of items) {
      const product = await client.query<{ price: string; stock: number; name: string }>(
        `SELECT price, stock, name FROM products WHERE id = $1 FOR UPDATE`,
        [item.productId]
      );
      const p = product.rows[0];
      if (!p) throw new AppError(`Product ${item.productId} not found`, 404, 'NOT_FOUND');
      if (p.stock < item.quantity) {
        throw new AppError(`Insufficient stock for ${p.name}`, 409, 'INSUFFICIENT_STOCK');
      }

      const price = parseFloat(p.price);
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [order.id, item.productId, item.quantity, price]
      );
      await client.query(`UPDATE products SET stock = stock - $1 WHERE id = $2`, [
        item.quantity,
        item.productId,
      ]);
      total += price * item.quantity;
    }

    await client.query(`UPDATE orders SET total_amount = $1, status = 'processing' WHERE id = $2`, [
      total,
      order.id,
    ]);

    order.total_amount = String(total);
    order.status = 'processing';
    return order;
  });
}

export async function cancelOrder(orderId: string, actorId: string, isAdmin: boolean): Promise<OrderRow> {
  return withTransaction(async (client: pg.PoolClient) => {
    const { rows } = await client.query<OrderRow>(
      `SELECT id, user_id, status, total_amount, created_at FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    const order = rows[0];
    if (!order) throw new NotFoundError('Order');
    if (!isAdmin && order.user_id !== actorId) {
      throw new AppError('Not allowed to cancel this order', 403, 'FORBIDDEN');
    }
    if (order.status === 'cancelled') return order;
    if (['shipped', 'delivered'].includes(order.status)) {
      throw new AppError(`Cannot cancel order in status ${order.status}`, 409, 'INVALID_STATUS');
    }

    const items = await client.query<{ product_id: string; quantity: number }>(
      `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    for (const item of items.rows) {
      await client.query(`UPDATE products SET stock = stock + $1 WHERE id = $2`, [
        item.quantity,
        item.product_id,
      ]);
    }

    const updated = await client.query<OrderRow>(
      `UPDATE orders SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1
       RETURNING id, user_id, status, total_amount, created_at`,
      [orderId]
    );

    return updated.rows[0]!;
  });
}

export async function findById(orderId: string): Promise<OrderRow | null> {
  const { rows } = await query<OrderRow>(
    `SELECT id, user_id, status, total_amount, created_at FROM orders WHERE id = $1`,
    [orderId]
  );
  return rows[0] ?? null;
}

export async function getOrdersByUser(userId: string): Promise<OrderRow[]> {
  const { rows } = await query<OrderRow>(
    `SELECT id, user_id, status, total_amount, created_at
     FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

export async function listPaginated(opts: {
  userId?: string;
  status?: string;
  page: number;
  limit: number;
  offset: number;
}): Promise<PaginatedResult<OrderRow>> {
  const filters: string[] = [];
  const params: unknown[] = [];
  if (opts.userId) {
    params.push(opts.userId);
    filters.push(`user_id = $${params.length}`);
  }
  if (opts.status) {
    params.push(opts.status);
    filters.push(`status = $${params.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM orders ${where}`,
    params
  );
  const total = Number(countResult.rows[0]?.count ?? 0);
  params.push(opts.limit, opts.offset);
  const { rows } = await query<OrderRow>(
    `SELECT id, user_id, status, total_amount, created_at
     FROM orders ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return toPaginated(rows, total, opts.page, opts.limit);
}
