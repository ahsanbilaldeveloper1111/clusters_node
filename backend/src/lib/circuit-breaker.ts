/**
 * Circuit Breaker — fail fast when a dependency is unhealthy.
 * States: closed → open (after threshold failures) → half-open (probe) → closed.
 */
export type CircuitState = 'closed' | 'open' | 'half_open';

export class CircuitOpenError extends Error {
  constructor(public readonly circuitName: string) {
    super(`Circuit breaker open: ${circuitName}`);
    this.name = 'CircuitOpenError';
  }
}

export class CircuitBreaker {
  private failures = 0;
  private state: CircuitState = 'closed';
  private openedAt = 0;
  private halfOpenInFlight = false;

  constructor(
    private readonly name: string,
    private readonly options: {
      failureThreshold: number;
      resetTimeoutMs: number;
    } = { failureThreshold: 5, resetTimeoutMs: 30_000 }
  ) {}

  getStatus(): { name: string; state: CircuitState; failures: number } {
    this.maybeTransitionToHalfOpen();
    return { name: this.name, state: this.state, failures: this.failures };
  }

  async exec<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeTransitionToHalfOpen();

    if (this.state === 'open') {
      throw new CircuitOpenError(this.name);
    }

    if (this.state === 'half_open') {
      if (this.halfOpenInFlight) throw new CircuitOpenError(this.name);
      this.halfOpenInFlight = true;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    } finally {
      this.halfOpenInFlight = false;
    }
  }

  private maybeTransitionToHalfOpen(): void {
    if (this.state === 'open' && Date.now() - this.openedAt >= this.options.resetTimeoutMs) {
      this.state = 'half_open';
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures += 1;
    if (this.state === 'half_open' || this.failures >= this.options.failureThreshold) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }
}

/** Shared breakers for external/shared deps */
export const redisCircuit = new CircuitBreaker('redis', {
  failureThreshold: 3,
  resetTimeoutMs: 15_000,
});

export const aiCircuit = new CircuitBreaker('openai', {
  failureThreshold: 3,
  resetTimeoutMs: 60_000,
});
