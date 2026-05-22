/**
 * HTTP server — runs inside each cluster worker process.
 */
import { createServer } from 'node:http';
import { env } from './config/env.js';
import { createApp } from './app.js';
+import { logger } from './utils/logger.js';
import { pool } from './database/pool.js';
import { getRedis } from './cache/redis.js';

const app = createApp();
const server = createServer(app);

async function start(): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.ping();
      logger.info('Redis connected');
    } catch (err) {
      logger.warn({ err }, 'Redis unavailable — continuing without cache');
    }
  }

  server.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, pid: process.pid, workerId: process.env['WORKER_ID'] },
      'Server listening'
    );
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Graceful shutdown started');
  server.close(async () => {
    await pool.end();
    const redis = getRedis();
    if (redis) redis.disconnect();
    logger.info('Shutdown complete');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

start().catch((err) => {
  logger.fatal(err);
  process.exit(1);
});
