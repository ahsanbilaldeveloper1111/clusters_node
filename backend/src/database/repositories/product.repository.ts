import { query } from '../pool.js';

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price: string;
  stock: number;
  category: string | null;
  attributes: Record<string, unknown>;
}

export async function listAll(category?: string): Promise<ProductRow[]> {
  if (category) {
    const { rows } = await query<ProductRow>(
      `SELECT id, sku, name, description, price, stock, category, attributes
       FROM products WHERE category = $1 ORDER BY name`,
      [category]
    );
    return rows;
  }
  const { rows } = await query<ProductRow>(
    `SELECT id, sku, name, description, price, stock, category, attributes FROM products ORDER BY name`
  );
  return rows;
}

export async function findById(id: string): Promise<ProductRow | null> {
  const { rows } = await query<ProductRow>(
    `SELECT id, sku, name, description, price, stock, category, attributes FROM products WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}
