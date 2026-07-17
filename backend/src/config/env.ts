import { config } from 'dotenv';
import { z } from 'zod';
import os from 'node:os';

config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  CLUSTER_WORKERS: z.string().default('auto'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1),
  DB_POOL_MIN: z.coerce.number().default(2),
  DB_POOL_MAX: z.coerce.number().default(20),
  DB_SSL: z
    .union([z.boolean(), z.string()])
    .default(false)
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true' || v === '1')),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16).default('dev-secret-change-in-production-min-16-chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().default(7),
  /** @deprecated use JWT_ACCESS_EXPIRES_IN */
  JWT_EXPIRES_IN: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  FEATURE_AI_INSIGHTS: z
    .union([z.boolean(), z.string()])
    .default(true)
    .transform((v) => (typeof v === 'boolean' ? v : v !== 'false' && v !== '0')),
  FEATURE_IDEMPOTENCY: z
    .union([z.boolean(), z.string()])
    .default(true)
    .transform((v) => (typeof v === 'boolean' ? v : v !== 'false' && v !== '0')),
  FEATURE_CIRCUIT_BREAKER: z
    .union([z.boolean(), z.string()])
    .default(true)
    .transform((v) => (typeof v === 'boolean' ? v : v !== 'false' && v !== '0')),
  FEATURE_DOMAIN_EVENTS: z
    .union([z.boolean(), z.string()])
    .default(true)
    .transform((v) => (typeof v === 'boolean' ? v : v !== 'false' && v !== '0')),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export function resolveWorkerCount(): number {
  if (env.CLUSTER_WORKERS === 'auto') {
    return Math.max(1, os.cpus().length);
  }
  const n = parseInt(env.CLUSTER_WORKERS, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
