/**
 * Security posture summary — what controls are active (for System UI + interviews).
 */
import { env } from '../config/env.js';
import { features } from '../config/features.js';
import { query } from '../database/pool.js';

export async function getSecurityPosture() {
  const [{ rows: mfaRows }, { rows: lockRows }, { rows: eventRows }] = await Promise.all([
    query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM users WHERE totp_enabled = true`),
    query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE locked_until IS NOT NULL AND locked_until > NOW()`
    ),
    query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM security_events WHERE created_at > NOW() - INTERVAL '24 hours'`
    ),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    controls: {
      helmet: true,
      securityHeaders: true,
      corsAllowlistConfigured: Boolean(env.CORS_ORIGINS?.length),
      rateLimiting: true,
      zodValidation: true,
      rbac: true,
      jwtAccessShortLived: env.JWT_ACCESS_EXPIRES_IN,
      refreshTokenRotation: true,
      refreshTokenHashedAtRest: true,
      passwordKdf: 'scrypt (new) + bcrypt (legacy verify)',
      passwordPolicy: 'min 10, upper/lower/digit/special, banned words',
      loginLockout: '5 failures → 15 min lock',
      totpMfa: features.mfa(),
      accessTokenDenylist: true,
      ssrfGuardOnWebhooks: true,
      hmacWebhooks: features.webhooks(),
      piiLogRedaction: true,
      auditTrail: true,
      idempotencyKeys: features.idempotency(),
      transactionalOutbox: features.outbox(),
      openTelemetry: env.OTEL_ENABLED,
      httpsHstsInProduction: env.NODE_ENV === 'production',
    },
    stats: {
      usersWithMfa: Number(mfaRows[0]?.count ?? 0),
      lockedAccounts: Number(lockRows[0]?.count ?? 0),
      securityEventsLast24h: Number(eventRows[0]?.count ?? 0),
    },
    supplyChain: [
      'Dependabot',
      'npm audit (CI)',
      'CodeQL SAST',
      'Trivy image scan',
      'Gitleaks secret scan',
      'Semgrep SAST',
      'CycloneDX SBOM',
    ],
    owaspMapped: [
      'A01 Broken Access Control → RBAC + auth middleware',
      'A02 Cryptographic Failures → scrypt/bcrypt, hashed refresh tokens, HMAC webhooks',
      'A03 Injection → parameterized SQL + Zod',
      'A04 Insecure Design → lockout, MFA, outbox, SSRF guard',
      'A05 Security Misconfiguration → Helmet + hardened headers + CORS allowlist',
      'A07 Identification/Auth Failures → MFA, lockout, token rotation/denylist',
      'A09 Logging/Monitoring → security_events + PII-redacted logs + OTel',
      'A10 SSRF → assertSafeOutboundUrl on webhooks',
    ],
  };
}
