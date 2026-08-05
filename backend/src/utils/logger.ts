import pino from 'pino';
import { env } from '../config/env.js';

/** PII / secret redaction paths for structured logs (OWASP logging). */
const redactPaths = [
  'password',
  'passwordHash',
  'password_hash',
  'refreshToken',
  'accessToken',
  'token',
  'authorization',
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'body.password',
  'body.refreshToken',
  'body.totpCode',
  'body.code',
  'totp_secret',
  'OPENAI_API_KEY',
  'JWT_SECRET',
  'WEBHOOK_SECRET',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    pid: process.pid,
    worker: process.env['WORKER_ID'] ?? 'primary',
  },
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
});

export type Logger = typeof logger;
