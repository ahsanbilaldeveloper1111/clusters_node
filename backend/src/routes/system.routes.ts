import { Router } from 'express';
import cluster from 'node:cluster';
import os from 'node:os';
import { healthCheck } from '../database/pool.js';
import { getRedis } from '../cache/redis.js';

const router = Router();

router.get('/health', async (_req, res) => {
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
    },
  });
});

export default router;
