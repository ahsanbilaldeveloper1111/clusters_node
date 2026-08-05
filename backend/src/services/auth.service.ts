import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import type { Request } from 'express';
import { env } from '../config/env.js';
import { features } from '../config/features.js';
import * as userRepo from '../database/repositories/user.repository.js';
import * as refreshRepo from '../database/repositories/refresh-token.repository.js';
import { UnauthorizedError, BadRequestError } from '../utils/errors.js';
import { verifyPassword } from '../security/password.js';
import { verifyTotpCode } from '../security/totp.js';
import {
  assertNotLocked,
  clearFailedLogins,
  logSecurityEvent,
  recordFailedLogin,
} from '../security/login-lockout.js';
import { isAccessJtiRevoked, revokeAccessJti } from '../security/token-denylist.js';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  type: 'access';
  jti: string;
}

export interface AuthResult {
  token: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  mfaRequired?: boolean;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    totpEnabled?: boolean;
  };
}

function hashRefreshToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function signAccessToken(payload: Omit<TokenPayload, 'type' | 'jti'> & { jti?: string }): string {
  const jti = payload.jti ?? crypto.randomUUID();
  const full: TokenPayload = { ...payload, type: 'access', jti };
  return jwt.sign(full, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    jwtid: jti,
  } as jwt.SignOptions);
}

function refreshExpiryDate(): Date {
  const days = env.JWT_REFRESH_EXPIRES_DAYS;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function accessExpiryDate(): Date {
  // Approximate from string like 15m / 1h — denylist TTL
  const raw = env.JWT_ACCESS_EXPIRES_IN;
  const d = new Date();
  const m = /^(\d+)([smhd])$/.exec(raw);
  if (!m) {
    d.setMinutes(d.getMinutes() + 15);
    return d;
  }
  const n = Number(m[1]);
  const unit = m[2];
  if (unit === 's') d.setSeconds(d.getSeconds() + n);
  else if (unit === 'm') d.setMinutes(d.getMinutes() + n);
  else if (unit === 'h') d.setHours(d.getHours() + n);
  else d.setDate(d.getDate() + n);
  return d;
}

export async function login(
  email: string,
  password: string,
  meta?: { userAgent?: string; ipAddress?: string },
  totpCode?: string
): Promise<AuthResult> {
  const normalized = email.toLowerCase();
  await assertNotLocked(normalized);

  const user = await userRepo.findByEmail(normalized);
  if (!user) {
    await logSecurityEvent({
      eventType: 'login_failed',
      email: normalized,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      details: { reason: 'unknown_user' },
    });
    throw new UnauthorizedError('Invalid credentials');
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    await recordFailedLogin(normalized);
    await logSecurityEvent({
      eventType: 'login_failed',
      userId: user.id,
      email: normalized,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      details: { reason: 'bad_password' },
    });
    throw new UnauthorizedError('Invalid credentials');
  }

  if (features.mfa() && user.totp_enabled) {
    if (!totpCode) {
      return {
        token: '',
        accessToken: '',
        refreshToken: '',
        expiresIn: env.JWT_ACCESS_EXPIRES_IN,
        mfaRequired: true,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
          totpEnabled: true,
        },
      };
    }
    if (!user.totp_secret || !verifyTotpCode(user.totp_secret, totpCode)) {
      await recordFailedLogin(normalized);
      await logSecurityEvent({
        eventType: 'mfa_failed',
        userId: user.id,
        email: normalized,
        ipAddress: meta?.ipAddress,
        details: {},
      });
      throw new UnauthorizedError('Invalid MFA code');
    }
  }

  await clearFailedLogins(normalized);
  const payload = { sub: user.id, email: user.email, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  await refreshRepo.createRefreshToken(
    user.id,
    hashRefreshToken(refreshToken),
    refreshExpiryDate(),
    meta
  );

  await logSecurityEvent({
    eventType: 'login_success',
    userId: user.id,
    email: normalized,
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    details: { mfa: Boolean(user.totp_enabled) },
  });

  return {
    token: accessToken,
    accessToken,
    refreshToken,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      totpEnabled: user.totp_enabled,
    },
  };
}

export async function refreshAccessToken(
  refreshToken: string,
  meta?: { userAgent?: string; ipAddress?: string }
): Promise<AuthResult> {
  const row = await refreshRepo.findValidByHash(hashRefreshToken(refreshToken));
  if (!row) throw new UnauthorizedError('Invalid or expired refresh token');

  const user = await userRepo.findById(row.user_id);
  if (!user || !user.is_active) throw new UnauthorizedError('User inactive');

  await refreshRepo.revokeByHash(hashRefreshToken(refreshToken));
  const newRefresh = crypto.randomBytes(48).toString('base64url');
  await refreshRepo.createRefreshToken(
    user.id,
    hashRefreshToken(newRefresh),
    refreshExpiryDate(),
    meta
  );

  const payload = { sub: user.id, email: user.email, role: user.role };
  const accessToken = signAccessToken(payload);

  return {
    token: accessToken,
    accessToken,
    refreshToken: newRefresh,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      totpEnabled: user.totp_enabled,
    },
  };
}

export async function logout(refreshToken: string, accessToken?: string): Promise<void> {
  await refreshRepo.revokeByHash(hashRefreshToken(refreshToken));
  if (accessToken) {
    try {
      const payload = jwt.verify(accessToken, env.JWT_SECRET) as TokenPayload;
      if (payload.jti) {
        await revokeAccessJti(payload.jti, payload.sub, accessExpiryDate());
      }
    } catch {
      /* ignore invalid access on logout */
    }
  }
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    if (payload.type !== 'access') throw new UnauthorizedError('Invalid token type');
    if (payload.jti && (await isAccessJtiRevoked(payload.jti))) {
      throw new UnauthorizedError('Token revoked');
    }
    return payload;
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export function requestMeta(req: Request): { userAgent?: string; ipAddress?: string } {
  const userAgent = req.headers['user-agent'];
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : req.socket.remoteAddress ?? undefined;
  return {
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    ipAddress: ip,
  };
}

export async function beginTotpSetup(userId: string, email: string) {
  if (!features.mfa()) throw new BadRequestError('MFA feature is disabled');
  const { generateTotpSecret, totpOtpAuthUri } = await import('../security/totp.js');
  const secret = generateTotpSecret();
  await userRepo.setTotpSecret(userId, secret);
  await logSecurityEvent({ eventType: 'mfa_setup_started', userId, email });
  return {
    secret,
    otpauthUrl: totpOtpAuthUri(secret, email),
    note: 'Scan with authenticator app, then POST /api/auth/mfa/enable with a 6-digit code',
  };
}

export async function confirmTotpEnable(userId: string, code: string) {
  if (!features.mfa()) throw new BadRequestError('MFA feature is disabled');
  const user = await userRepo.findById(userId);
  if (!user?.totp_secret) throw new BadRequestError('Start MFA setup first');
  if (!verifyTotpCode(user.totp_secret, code)) throw new UnauthorizedError('Invalid MFA code');
  await userRepo.enableTotp(userId);
  await logSecurityEvent({ eventType: 'mfa_enabled', userId, email: user.email });
  return { enabled: true };
}

export async function disableTotpForUser(userId: string, code: string) {
  const user = await userRepo.findById(userId);
  if (!user?.totp_secret || !user.totp_enabled) throw new BadRequestError('MFA is not enabled');
  if (!verifyTotpCode(user.totp_secret, code)) throw new UnauthorizedError('Invalid MFA code');
  await userRepo.disableTotp(userId);
  await logSecurityEvent({ eventType: 'mfa_disabled', userId, email: user.email });
  return { enabled: false };
}
