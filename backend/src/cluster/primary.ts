/**
 * Cluster primary process — forks worker processes to utilize all CPU cores.
 * Each worker runs an independent Express server instance sharing the same port
 * via SO_REUSEPORT / cluster IPC load balancing.
 */
import cluster from 'node:cluster';
import os from 'node:os';
import { env, resolveWorkerCount } from '../config/env.js';
import { logger } from '../utils/logger.js';

const isPrimary = cluster.isPrimary;

if (!isPrimary) { 
  // Worker entry when spawned directly (dev:worker script)
  await import('../server.js');
} else {
  const workerCount = resolveWorkerCount();

  logger.info(
    {
      cpus: os.cpus().length,
      workers: workerCount,
      nodeEnv: env.NODE_ENV,
    },
    'Starting cluster primary'
  );

  for (let i = 0; i < workerCount; i++) {
    const worker = cluster.fork({ WORKER_ID: String(i + 1) });
    logger.info({ workerId: worker.id, pid: worker.process.pid }, 'Worker forked');
  }

  cluster.on('online', (worker) => {
    logger.info({ workerId: worker.id }, 'Worker online');
  });

  cluster.on('exit', (worker, code, signal) => {
    logger.warn({ workerId: worker.id, code, signal }, 'Worker exited — restarting');
    if (code !== 0 && !worker.exitedAfterDisconnect) {
      cluster.fork({ WORKER_ID: String(worker.id) });
    }
  });

  const shutdown = (signal: NodeJS.Signals) => {
    logger.info({ signal }, 'Primary shutting down workers');
    const workers = cluster.workers;
    if (workers) {
      for (const id of Object.keys(workers)) {
        workers[id]?.kill(signal);
      }
    }
    setTimeout(() => process.exit(0), 5000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
