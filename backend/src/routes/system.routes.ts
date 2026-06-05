import { Router } from 'express';
import cluster from 'node:cluster';
import os from 'node:os';
import { healthCheck } from '../database/pool.js';
import { getRedis } from '../cache/redis.js';

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
    },
  });
});

export default router;
