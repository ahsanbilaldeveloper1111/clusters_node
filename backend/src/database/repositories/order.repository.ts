import { withTransaction, query } from '../pool.js';
import type pg from 'pg';

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
      const product = await client.query<{ price: string; stock: number }>(
        `SELECT price, stock FROM products WHERE id = $1 FOR UPDATE`,
        [item.productId]
      );
      const p = product.rows[0];
      if (!p) throw new Error(`Product ${item.productId} not found`);
      if (p.stock < item.quantity) throw new Error(`Insufficient stock for ${item.productId}`);

      const price = parseFloat(p.price);
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [order.id, item.productId, item.quantity, price]
      );
      await client.query(
        `UPDATE products SET stock = stock - $1 WHERE id = $2`,
        [item.quantity, item.productId]
      );
      total += price * item.quantity;
    }

    await client.query(
      `UPDATE orders SET total_amount = $1, status = 'processing' WHERE id = $2`,
      [total, order.id]
    );

    await client.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, actor_id, payload)
       VALUES ('order', $1, 'created', $2, $3)`,
      [order.id, userId, JSON.stringify({ itemCount: items.length, total })]
    );

    order.total_amount = String(total);
    order.status = 'processing';
    return order;
  });
}

export async function getOrdersByUser(userId: string): Promise<OrderRow[]> {
  const { rows } = await query<OrderRow>(
    `SELECT id, user_id, status, total_amount, created_at
     FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}
