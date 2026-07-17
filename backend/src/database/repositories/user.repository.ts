import type { QueryResultRow } from 'pg';
import { query } from '../pool.js';

export interface UserRow extends QueryResultRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: 'admin' | 'manager' | 'customer';
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: Date;
}

export async function findByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `SELECT id, email, password_hash, full_name, role, metadata, is_active, created_at
     FROM users WHERE email = $1 AND is_active = true`,
    [email]
  );
  return rows[0] ?? null;
}

export async function findById(id: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `SELECT id, email, password_hash, full_name, role, metadata, is_active, created_at
     FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  fullName: string;
  role?: 'admin' | 'manager' | 'customer';
}): Promise<Omit<UserRow, 'password_hash'>> {
  const { rows } = await query<Omit<UserRow, 'password_hash'>>(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, full_name, role, metadata, is_active, created_at`,
    [input.email, input.passwordHash, input.fullName, input.role ?? 'customer']
  );
  return rows[0]!;
}

export async function listActive(limit = 50, offset = 0): Promise<Omit<UserRow, 'password_hash'>[]> {
  const { rows } = await query(
    `SELECT id, email, full_name, role, metadata, is_active, created_at
     FROM users WHERE is_active = true
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows as Omit<UserRow, 'password_hash'>[];
}
