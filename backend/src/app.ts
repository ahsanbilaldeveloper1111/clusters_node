import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/error.middleware.js';
import { metricsMiddleware } from './middleware/metrics.middleware.js';
import { correlationMiddleware } from './lib/request-context.js';
import {
  enforceJsonContentType,
  resolveCorsOrigin,
  securityHeadersMiddleware,
} from './security/headers.js';
import { registerDomainEventHandlers } from './events/handlers.js';
import authRoutes from './routes/auth.routes.js';
import productRoutes from './routes/products.routes.js';
import orderRoutes from './routes/orders.routes.js';
import analyticsRoutes, { handleCallCount } from './routes/analytics.routes.js';
import aiRoutes from './routes/ai.routes.js';
import mlRoutes from './routes/ml.routes.js';
import platformRoutes from './routes/platform.routes.js';
import docsRoutes from './routes/docs.routes.js';
import auditRoutes from './routes/audit.routes.js';
import { authenticate, requireRole } from './middleware/auth.middleware.js';
import systemRoutes from './routes/system.routes.js';

export function createApp(): express.Application {
  registerDomainEventHandlers();
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: env.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false,
      hsts:
        env.NODE_ENV === 'production'
          ? { maxAge: 63072000, includeSubDomains: true, preload: true }
          : false,
    })
  );
  app.use(securityHeadersMiddleware);
  app.use(
    cors({
      origin: resolveCorsOrigin(),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Idempotency-Key',
        'X-Request-Id',
        'X-Correlation-Id',
      ],
    })
  );
  app.use(compression());
  app.use(correlationMiddleware);
  app.use(metricsMiddleware);
  app.use(enforceJsonContentType);

  /** Large payload for millions of filter numbers (must run before global json parser) */
  app.post(
    '/api/analytics/calls/count',
    express.json({ limit: '100mb' }),
    authenticate,
    requireRole('admin', 'manager'),
    handleCallCount
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req: { url?: string }) =>
          req.url === '/health' ||
          req.url === '/metrics' ||
          req.url === '/.well-known/security.txt' ||
          (req.url?.startsWith('/api/docs') ?? false),
      },
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        censor: '[REDACTED]',
      },
    })
  );

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 500,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get('/.well-known/security.txt', (_req, res) => {
    res.type('text/plain').send(
      [
        'Contact: mailto:security@enterprise.local',
        'Preferred-Languages: en',
        'Canonical: https://enterprise.local/.well-known/security.txt',
        'Policy: https://enterprise.local/docs/SECURITY_DEVELOPMENT.md',
        `Expires: ${new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()}`,
      ].join('\n')
    );
  });

  app.use(systemRoutes);
  app.use(docsRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/ml', mlRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/platform', platformRoutes);

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/products', productRoutes);
  app.use('/api/v1/orders', orderRoutes);
  app.use('/api/v1/analytics', analyticsRoutes);
  app.use('/api/v1/ai', aiRoutes);
  app.use('/api/v1/ml', mlRoutes);
  app.use('/api/v1/audit', auditRoutes);
  app.use('/api/v1/platform', platformRoutes);

  app.use(errorHandler);

  return app;
}
