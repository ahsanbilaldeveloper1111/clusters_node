import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    pid: process.pid,
    worker: process.env['WORKER_ID'] ?? 'primary',
  },
});

export type Logger = typeof logger;
