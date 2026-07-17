import { query } from '../database/pool.js';
import { AppError } from '../utils/errors.js';

export interface IdempotencyRecord {
  key: string;
  user_id: string;
  method: string;
  path: string;
  status_code: number;
  response_body: unknown;
}

/** Returns cached response if key was already processed for this user+route */
export async function findIdempotentResponse(
  key: string,
  userId: string,
  method: string,
  path: string
): Promise<IdempotencyRecord | null> {
  const { rows } = await query<IdempotencyRecord>(
    `SELECT key, user_id, method, path, status_code, response_body
     FROM idempotency_keys
     WHERE key = $1 AND user_id = $2 AND method = $3 AND path = $4
       AND expires_at > NOW()`,
    [key, userId, method, path]
  );
  return rows[0] ?? null;
}

export async function saveIdempotentResponse(opts: {
  key: string;
  userId: string;
  method: string;
  path: string;
  statusCode: number;
  body: unknown;
  ttlHours?: number;
}): Promise<void> {
  const ttl = opts.ttlHours ?? 24;
  try {
    await query(
      `INSERT INTO idempotency_keys (key, user_id, method, path, status_code, response_body, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($7 || ' hours')::interval)
       ON CONFLICT (key) DO NOTHING`,
      [
        opts.key,
        opts.userId,
        opts.method,
        opts.path,
        opts.statusCode,
        JSON.stringify(opts.body),
        String(ttl),
      ]
    );
  } catch (e) {
    throw new AppError('Failed to persist idempotency key', 500, 'IDEMPOTENCY_ERROR', e);
  }
}
