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
  totp_secret: string | null;
  totp_enabled: boolean;
  password_algo: string;
  failed_login_count: number;
  locked_until: Date | null;
}

const USER_COLS = `id, email, password_hash, full_name, role, metadata, is_active, created_at,
  totp_secret, totp_enabled, password_algo, failed_login_count, locked_until`;

export async function findByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(
    `SELECT ${USER_COLS} FROM users WHERE email = $1 AND is_active = true`,
    [email]
  );
  return rows[0] ?? null;
}

export async function findById(id: string): Promise<UserRow | null> {
  const { rows } = await query<UserRow>(`SELECT ${USER_COLS} FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  fullName: string;
  role?: 'admin' | 'manager' | 'customer';
  passwordAlgo?: string;
}): Promise<Omit<UserRow, 'password_hash' | 'totp_secret'>> {
  const { rows } = await query<Omit<UserRow, 'password_hash' | 'totp_secret'>>(
    `INSERT INTO users (email, password_hash, full_name, role, password_algo)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, full_name, role, metadata, is_active, created_at,
               totp_enabled, password_algo, failed_login_count, locked_until`,
    [
      input.email,
      input.passwordHash,
      input.fullName,
      input.role ?? 'customer',
      input.passwordAlgo ?? 'scrypt',
    ]
  );
  return rows[0]!;
}

export async function setTotpSecret(userId: string, secret: string): Promise<void> {
  await query(`UPDATE users SET totp_secret = $2, totp_enabled = false WHERE id = $1`, [
    userId,
    secret,
  ]);
}

export async function enableTotp(userId: string): Promise<void> {
  await query(`UPDATE users SET totp_enabled = true WHERE id = $1 AND totp_secret IS NOT NULL`, [
    userId,
  ]);
}

export async function disableTotp(userId: string): Promise<void> {
  await query(`UPDATE users SET totp_enabled = false, totp_secret = NULL WHERE id = $1`, [userId]);
}

export async function listActive(limit = 50, offset = 0): Promise<Omit<UserRow, 'password_hash' | 'totp_secret'>[]> {
  const { rows } = await query(
    `SELECT id, email, full_name, role, metadata, is_active, created_at, totp_enabled, password_algo
     FROM users WHERE is_active = true
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows as Omit<UserRow, 'password_hash' | 'totp_secret'>[];
}
