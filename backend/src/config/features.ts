/**
 * Feature flags — env-driven toggles (strategy for gradual rollout demos).
 */
import { env } from '../config/env.js';

export const features = {
  aiInsights: () => env.FEATURE_AI_INSIGHTS,
  idempotency: () => env.FEATURE_IDEMPOTENCY,
  circuitBreaker: () => env.FEATURE_CIRCUIT_BREAKER,
  domainEvents: () => env.FEATURE_DOMAIN_EVENTS,
  outbox: () => env.FEATURE_OUTBOX,
  webhooks: () => env.FEATURE_WEBHOOKS,
  mfa: () => env.FEATURE_MFA,
} as const;

export type FeatureName = keyof typeof features;
