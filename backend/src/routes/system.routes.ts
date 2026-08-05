import { Router } from 'express';
import cluster from 'node:cluster';
import os from 'node:os';
import { healthCheck } from '../database/pool.js';
import { getRedis } from '../cache/redis.js';
import { getMetrics, getMetricsContentType } from '../middleware/metrics.middleware.js';
import { redisCircuit, aiCircuit } from '../lib/circuit-breaker.js';
import { features } from '../config/features.js';
import { eventBus } from '../events/event-bus.js';
import { getCorrelationId } from '../lib/request-context.js';

const router = Router();

/** Liveness — process is up (do not check DB; avoids restart loops when DB is slow) */
router.get('/health/live', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    worker: {
      pid: process.pid,
      isPrimary: cluster.isPrimary,
      workerId: process.env['WORKER_ID'] ?? null,
    },
    uptime: process.uptime(),
  });
});

async function readinessHandler(
  _req: import('express').Request,
  res: import('express').Response
): Promise<void> {
  const dbOk = await healthCheck();
  let redisOk = true;
  const redis = getRedis();
  if (redis) {
    try {
      await redis.ping();
    } catch {
      redisOk = false;
    }
  }
  const healthy = dbOk;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    checks: { database: dbOk, redis: redisOk },
    worker: {
      pid: process.pid,
      isPrimary: cluster.isPrimary,
      workerId: process.env['WORKER_ID'] ?? null,
    },
    uptime: process.uptime(),
  });
}

/** Readiness — dependencies must be healthy before receiving traffic */
router.get('/health/ready', readinessHandler);

/** Backwards-compatible alias (load balancers, Docker healthcheck) */
router.get('/health', readinessHandler);

/** Prometheus metrics (scrape from in-cluster Prometheus or local dev) */
router.get('/metrics', async (_req, res, next) => {
  try {
    res.set('Content-Type', getMetricsContentType());
    res.end(await getMetrics());
  } catch (err) {
    next(err);
  }
});

router.get('/api/system/info', (_req, res) => {
  res.json({
    data: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length,
      memory: process.memoryUsage(),
      cluster: {
        isPrimary: cluster.isPrimary,
        workerId: process.env['WORKER_ID'],
      },
      correlationId: getCorrelationId(),
      advanced: {
        featureFlags: {
          aiInsights: features.aiInsights(),
          idempotency: features.idempotency(),
          circuitBreaker: features.circuitBreaker(),
          domainEvents: features.domainEvents(),
          outbox: features.outbox(),
          webhooks: features.webhooks(),
          mfa: features.mfa(),
        },
        circuitBreakers: [redisCircuit.getStatus(), aiCircuit.getStatus()],
        domainEventListeners: {
          OrderCreated: eventBus.listenerCount('OrderCreated'),
          OrderCancelled: eventBus.listenerCount('OrderCancelled'),
          UserRegistered: eventBus.listenerCount('UserRegistered'),
          ProductUpdated: eventBus.listenerCount('ProductUpdated'),
          AiInsightGenerated: eventBus.listenerCount('AiInsightGenerated'),
        },
        concepts: [
          'correlation-ids',
          'circuit-breaker',
          'domain-events',
          'idempotency-keys',
          'optimistic-locking',
          'result-either',
          'feature-flags',
          'repository-pattern',
          'strategy-ai-providers',
          'transactional-outbox',
          'redis-streams',
          'hmac-webhooks',
          'retry-with-jitter',
          'cqrs-lite',
          'opentelemetry',
          'api-versioning-v1',
          'scrypt-password-kdf',
          'totp-mfa',
          'login-lockout',
          'jwt-jti-denylist',
          'ssrf-guard',
          'pii-log-redaction',
          'security-txt',
        ],
      },
    },
  });
});

export default router;
