import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { redisCircuit, CircuitOpenError } from '../lib/circuit-breaker.js';
import { features } from '../config/features.js';
import { ok, err, type Result } from '../lib/result.js';

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (!redis) {
    redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    redis.on('error', (err: Error) => logger.warn({ err }, 'Redis error'));
  }
  return redis;
}

async function withRedisCircuit<T>(fn: (client: Redis) => Promise<T>): Promise<Result<T, string>> {
  const client = getRedis();
  if (!client) return err('redis_disabled');

  try {
    if (features.circuitBreaker()) {
      const value = await redisCircuit.exec(() => fn(client));
      return ok(value);
    }
    return ok(await fn(client));
  } catch (e) {
    if (e instanceof CircuitOpenError) {
      logger.warn('Redis circuit open — degrading gracefully');
      return err('circuit_open');
    }
    return err(e instanceof Error ? e.message : 'redis_error');
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const result = await withRedisCircuit(async (client) => {
    const raw = await client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  });
  return result.ok ? result.value : null;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
  await withRedisCircuit(async (client) => {
    await client.setex(key, ttlSeconds, JSON.stringify(value));
  });
}

export async function cacheDel(pattern: string): Promise<void> {
  await withRedisCircuit(async (client) => {
    const keys = await client.keys(pattern);
    if (keys.length) await client.del(...keys);
  });
}
