import type { QueryResultRow } from 'pg';
import { query } from '../pool.js';

export interface RefreshTokenRow extends QueryResultRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
}

export async function createRefreshToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
  meta?: { userAgent?: string; ipAddress?: string }
): Promise<void> {
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5::inet)`,
    [userId, tokenHash, expiresAt, meta?.userAgent ?? null, meta?.ipAddress ?? null]
  );
}

export async function findValidByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
  const { rows } = await query<RefreshTokenRow>(
    `SELECT id, user_id, token_hash, expires_at, revoked_at
     FROM refresh_tokens
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()`,
    [tokenHash]
  );
  return rows[0] ?? null;
}

export async function revokeByHash(tokenHash: string): Promise<void> {
  await query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}
