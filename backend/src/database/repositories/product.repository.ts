import { query } from '../pool.js';
import type { PaginatedResult } from '../../utils/pagination.js';
import { toPaginated } from '../../utils/pagination.js';
import { AppError } from '../../utils/errors.js';

export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  price: string;
  stock: number;
  category: string | null;
  attributes: Record<string, unknown>;
  version: number;
}

export interface CreateProductInput {
  sku: string;
  name: string;
  description?: string | null;
  price: number;
  stock: number;
  category?: string | null;
  attributes?: Record<string, unknown>;
}

export interface UpdateProductInput {
  name?: string;
  description?: string | null;
  price?: number;
  stock?: number;
  category?: string | null;
  attributes?: Record<string, unknown>;
  /** Optimistic concurrency — client sends expected version */
  expectedVersion?: number;
}

export async function listAll(category?: string): Promise<ProductRow[]> {
  if (category) {
    const { rows } = await query<ProductRow>(
      `SELECT id, sku, name, description, price, stock, category, attributes, version
       FROM products WHERE category = $1 ORDER BY name`,
      [category]
    );
    return rows;
  }
  const { rows } = await query<ProductRow>(
    `SELECT id, sku, name, description, price, stock, category, attributes, version FROM products ORDER BY name`
  );
  return rows;
}

export async function listPaginated(opts: {
  category?: string;
  q?: string;
  page: number;
  limit: number;
  offset: number;
}): Promise<PaginatedResult<ProductRow>> {
  const filters: string[] = [];
  const params: unknown[] = [];

  if (opts.category) {
    params.push(opts.category);
    filters.push(`category = $${params.length}`);
  }
  if (opts.q) {
    params.push(`%${opts.q}%`);
    filters.push(`(name ILIKE $${params.length} OR sku ILIKE $${params.length})`);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM products ${where}`,
    params
  );
  const total = Number(countResult.rows[0]?.count ?? 0);

  params.push(opts.limit, opts.offset);
  const { rows } = await query<ProductRow>(
    `SELECT id, sku, name, description, price, stock, category, attributes, version
     FROM products ${where}
     ORDER BY name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return toPaginated(rows, total, opts.page, opts.limit);
}

export async function findById(id: string): Promise<ProductRow | null> {
  const { rows } = await query<ProductRow>(
    `SELECT id, sku, name, description, price, stock, category, attributes, COALESCE(version, 1) AS version
     FROM products WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function create(input: CreateProductInput): Promise<ProductRow> {
  const { rows } = await query<ProductRow>(
    `INSERT INTO products (sku, name, description, price, stock, category, attributes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, sku, name, description, price, stock, category, attributes, version`,
    [
      input.sku,
      input.name,
      input.description ?? null,
      input.price,
      input.stock,
      input.category ?? null,
      JSON.stringify(input.attributes ?? {}),
    ]
  );
  return rows[0]!;
}

export async function update(id: string, input: UpdateProductInput): Promise<ProductRow | null> {
  const existing = await findById(id);
  if (!existing) return null;

  if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
    throw new AppError(
      `Product version conflict: expected ${input.expectedVersion}, found ${existing.version}`,
      409,
      'OPTIMISTIC_LOCK'
    );
  }

  const { rows } = await query<ProductRow>(
    `UPDATE products SET
       name = $2,
       description = $3,
       price = $4,
       stock = $5,
       category = $6,
       attributes = $7,
       version = version + 1
     WHERE id = $1 AND version = $8
     RETURNING id, sku, name, description, price, stock, category, attributes, version`,
    [
      id,
      input.name ?? existing.name,
      input.description !== undefined ? input.description : existing.description,
      input.price ?? existing.price,
      input.stock ?? existing.stock,
      input.category !== undefined ? input.category : existing.category,
      JSON.stringify(input.attributes ?? existing.attributes),
      existing.version,
    ]
  );
  if (!rows[0]) {
    throw new AppError('Product was modified by another request', 409, 'OPTIMISTIC_LOCK');
  }
  return rows[0];
}

export async function remove(id: string): Promise<boolean> {
  const { rowCount } = await query(`DELETE FROM products WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
