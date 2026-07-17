import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import type { Request } from 'express';
import { env } from '../config/env.js';
import * as userRepo from '../database/repositories/user.repository.js';
import * as refreshRepo from '../database/repositories/refresh-token.repository.js';
import { UnauthorizedError } from '../utils/errors.js';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  type: 'access';
}

export interface AuthResult {
  token: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
}

function hashRefreshToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function signAccessToken(payload: Omit<TokenPayload, 'type'>): string {
  const full: TokenPayload = { ...payload, type: 'access' };
  return jwt.sign(full, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);
}

function refreshExpiryDate(): Date {
  const days = env.JWT_REFRESH_EXPIRES_DAYS;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export async function login(
  email: string,
  password: string,
  meta?: { userAgent?: string; ipAddress?: string }
): Promise<AuthResult> {
  const user = await userRepo.findByEmail(email);
  if (!user) throw new UnauthorizedError('Invalid credentials');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new UnauthorizedError('Invalid credentials');

  const payload = { sub: user.id, email: user.email, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  await refreshRepo.createRefreshToken(
    user.id,
    hashRefreshToken(refreshToken),
    refreshExpiryDate(),
    meta
  );

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

  // Rotate refresh token
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
    },
  };
}

export async function logout(refreshToken: string): Promise<void> {
  await refreshRepo.revokeByHash(hashRefreshToken(refreshToken));
}

export function verifyToken(token: string): TokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    if (payload.type !== 'access') throw new UnauthorizedError('Invalid token type');
    return payload;
  } catch {
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
