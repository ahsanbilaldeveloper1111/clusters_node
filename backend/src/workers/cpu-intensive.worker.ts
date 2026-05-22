/**
 * Worker Thread — offloads CPU-bound work from the main event loop.
 * Used for analytics aggregation, prime calculation demos, report generation.
 */
import { parentPort, workerData } from 'node:worker_threads';

interface WorkerInput {
  task: 'primes' | 'aggregate' | 'hash';
  limit?: number;
  numbers?: number[];
}

interface WorkerOutput {
  task: string;
  result: unknown;
  durationMs: number;
}

function sievePrimes(limit: number): number[] {
  const sieve = new Uint8Array(limit + 1);
  const primes: number[] = [];
  for (let i = 2; i <= limit; i++) {
    if (sieve[i] === 0) {
      primes.push(i);
      for (let j = i * i; j <= limit; j += i) sieve[j] = 1;
    }
  }
  return primes;
}

function aggregate(numbers: number[]): { sum: number; avg: number; min: number; max: number } {
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const n of numbers) {
    sum += n;
    if (n < min) min = n;
    if (n > max) max = n;
  }
  return { sum, avg: sum / numbers.length, min, max };
}

function simpleHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16);
}

const input = workerData as WorkerInput;
const start = performance.now();
let result: unknown;

switch (input.task) {
  case 'primes':
    result = { count: sievePrimes(input.limit ?? 100_000).length, limit: input.limit };
    break;
  case 'aggregate':
    result = aggregate(input.numbers ?? []);
    break;
  case 'hash':
    result = { hash: simpleHash(String(input.limit ?? 'default')) };
    break;
  default:
    throw new Error(`Unknown task: ${(input as WorkerInput).task}`);
}

const output: WorkerOutput = {
  task: input.task,
  result,
  durationMs: performance.now() - start,
};

parentPort?.postMessage(output);
