/**
 * Access-token denylist by JWT `jti` (logout / forced revoke before expiry).
 */
import { query } from '../database/pool.js';
import { getRedis } from '../cache/redis.js';

const PREFIX = 'deny:jti:';

export async function revokeAccessJti(jti: string, userId: string, expiresAt: Date): Promise<void> {
  await query(
    `INSERT INTO revoked_access_tokens (jti, user_id, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (jti) DO NOTHING`,
    [jti, userId, expiresAt.toISOString()]
  );
  const ttl = Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const redis = getRedis();
  if (redis) {
    try {
      await redis.setex(`${PREFIX}${jti}`, ttl, '1');
    } catch {
      /* ignore */
    }
  }
}

export async function isAccessJtiRevoked(jti: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    try {
      const hit = await redis.get(`${PREFIX}${jti}`);
      if (hit) return true;
    } catch {
      /* fall through to DB */
    }
  }

  const { rows } = await query<{ jti: string }>(
    `SELECT jti FROM revoked_access_tokens WHERE jti = $1 AND expires_at > NOW()`,
    [jti]
  );
  return Boolean(rows[0]);
}
