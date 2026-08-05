/**
 * HTTP server — runs inside each cluster worker process.
 * OpenTelemetry must start before Express/pg are imported (auto-instrumentation).
 */
import { startTelemetry } from './observability/telemetry.js';

await startTelemetry();

const { createServer } = await import('node:http');
const { env } = await import('./config/env.js');
const { createApp } = await import('./app.js');
const { logger } = await import('./utils/logger.js');
const { pool } = await import('./database/pool.js');
const { getRedis } = await import('./cache/redis.js');
const { startMessagingWorkers, stopMessagingWorkers } = await import('./messaging/outbox-worker.js');

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

  await startMessagingWorkers();

  server.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, pid: process.pid, workerId: process.env['WORKER_ID'] },
      'Server listening'
    );
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Graceful shutdown started');
  stopMessagingWorkers();
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
  console.error(err);
  process.exit(1);
});
