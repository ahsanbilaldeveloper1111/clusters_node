/**
 * Spawns a Worker Thread for one-off CPU-bound tasks.
 * Keeps the main event loop free for I/O (HTTP, DB, Redis).
 */
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CpuTaskInput {
  task: 'primes' | 'aggregate' | 'hash';
  limit?: number;
  numbers?: number[];
}

export interface CpuTaskResult {
  task: string;
  result: unknown;
  durationMs: number;
}

const workerFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'cpu-intensive.worker.js'
);

export function runCpuTask(data: CpuTaskInput): Promise<CpuTaskResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerFile, { workerData: data });
    worker.once('message', (msg: CpuTaskResult) => {
      resolve(msg);
      void worker.terminate();
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}
