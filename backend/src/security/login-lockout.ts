/**
 * Login lockout — progressive delay after failed attempts (OWASP ASVS).
 */
import { query } from '../database/pool.js';
import { ForbiddenError } from '../utils/errors.js';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function assertNotLocked(email: string): Promise<void> {
  const { rows } = await query<{ locked_until: Date | null; failed_login_count: number }>(
    `SELECT locked_until, failed_login_count FROM users WHERE email = $1`,
    [email.toLowerCase()]
  );
  const row = rows[0];
  if (!row?.locked_until) return;
  if (new Date(row.locked_until).getTime() > Date.now()) {
    throw new ForbiddenError(
      `Account temporarily locked after failed logins. Try again after ${new Date(row.locked_until).toISOString()}`
    );
  }
}

export async function recordFailedLogin(email: string): Promise<void> {
  await query(
    `UPDATE users SET
       failed_login_count = failed_login_count + 1,
       locked_until = CASE
         WHEN failed_login_count + 1 >= $2 THEN NOW() + ($3 || ' minutes')::interval
         ELSE locked_until
       END
     WHERE email = $1`,
    [email.toLowerCase(), MAX_ATTEMPTS, String(LOCK_MINUTES)]
  );
}

export async function clearFailedLogins(email: string): Promise<void> {
  await query(
    `UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE email = $1`,
    [email.toLowerCase()]
  );
}

export async function logSecurityEvent(input: {
  eventType: string;
  userId?: string;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO security_events (event_type, user_id, email, ip_address, user_agent, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.eventType,
      input.userId ?? null,
      input.email ?? null,
      input.ipAddress ?? null,
      input.userAgent ?? null,
      JSON.stringify(input.details ?? {}),
    ]
  );
}
