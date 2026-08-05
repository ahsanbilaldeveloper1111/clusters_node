/**
 * Retry with exponential backoff + jitter.
 * Principal/architect talking point: resilient outbound I/O without thundering herds.
 */
export interface RetryOptions {
  retries?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  /** Retry only when predicate returns true (default: always). */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeDelay(attempt: number, min: number, max: number, factor: number): number {
  const exp = Math.min(max, min * factor ** attempt);
  const jitter = Math.random() * 0.3 * exp;
  return Math.min(max, Math.floor(exp * 0.85 + jitter));
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const minDelayMs = opts.minDelayMs ?? 100;
  const maxDelayMs = opts.maxDelayMs ?? 5_000;
  const factor = opts.factor ?? 2;
  const shouldRetry = opts.shouldRetry ?? (() => true);

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= retries || !shouldRetry(err, attempt)) throw err;
      const delay = computeDelay(attempt, minDelayMs, maxDelayMs, factor);
      opts.onRetry?.(err, attempt + 1, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}
