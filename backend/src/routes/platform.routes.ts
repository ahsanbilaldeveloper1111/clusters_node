import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { getCommerceReadModel } from '../services/cqrs-read.service.js';
import { outboxStats } from '../messaging/outbox.js';
import { webhookStats } from '../messaging/webhooks.js';
import { features } from '../config/features.js';
import { env } from '../config/env.js';
import { getSecurityPosture } from '../security/posture.js';

const router = Router();

/** CQRS read side — analytics projections (not the write/order repos). */
router.get(
  '/read-model/commerce',
  authenticate,
  requireRole('admin', 'manager'),
  async (_req, res, next) => {
    try {
      const data = await getCommerceReadModel();
      res.json({
        data: {
          ...data,
          pattern: 'CQRS-lite',
          note: 'Commands use order/product repositories; this endpoint is a dedicated read model with Redis cache-aside.',
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/** Messaging / outbox / webhook health for System & interview demos. */
router.get(
  '/messaging/status',
  authenticate,
  requireRole('admin', 'manager'),
  async (_req, res, next) => {
    try {
      const [outbox, webhooks] = await Promise.all([
        features.outbox()
          ? outboxStats()
          : Promise.resolve({ pending: 0, published: 0, failedAttempts: 0 }),
        features.webhooks()
          ? webhookStats()
          : Promise.resolve({ pending: 0, delivered: 0, failed: 0 }),
      ]);
      res.json({
        data: {
          outboxEnabled: features.outbox(),
          webhooksEnabled: features.webhooks() && Boolean(env.WEBHOOK_URL),
          otelEnabled: env.OTEL_ENABLED,
          otelEndpoint: env.OTEL_ENABLED ? env.OTEL_EXPORTER_OTLP_ENDPOINT : null,
          stream: 'enterprise:events',
          outbox,
          webhooks,
          patterns: [
            'transactional-outbox',
            'redis-streams',
            'hmac-webhooks',
            'retry-with-jitter',
            'cqrs-lite-read-model',
            'opentelemetry-otlp',
            'api-versioning-v1',
          ],
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/** Security posture — active controls mapped to OWASP for interviews. */
router.get(
  '/security/posture',
  authenticate,
  requireRole('admin', 'manager'),
  async (_req, res, next) => {
    try {
      const data = await getSecurityPosture();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
