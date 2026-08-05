/**
 * Extra security headers + production CORS allowlist.
 */
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

/** Permissions-Policy / Referrer / COOP beyond default Helmet. */
export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  if (env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  next();
}

/** Reject unexpected Content-Type on JSON mutating requests. */
export function enforceJsonContentType(req: Request, res: Response, next: NextFunction): void {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();
  if (req.path.startsWith('/api/docs') || req.path === '/health') return next();
  const ct = req.headers['content-type'] ?? '';
  if (!ct.includes('application/json') && Number(req.headers['content-length'] ?? 0) > 0) {
    res.status(415).json({
      error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Content-Type must be application/json' },
    });
    return;
  }
  next();
}

export function resolveCorsOrigin(): boolean | string | RegExp | (string | RegExp)[] {
  if (env.CORS_ORIGINS && env.CORS_ORIGINS.length > 0) {
    return env.CORS_ORIGINS;
  }
  // Dev default: reflect request origin (credentials-friendly)
  return true;
}
