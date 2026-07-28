import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/error.middleware.js';
import { metricsMiddleware } from './middleware/metrics.middleware.js';
import { correlationMiddleware } from './lib/request-context.js';
import { registerDomainEventHandlers } from './events/handlers.js';
import authRoutes from './routes/auth.routes.js';
import productRoutes from './routes/products.routes.js';
import orderRoutes from './routes/orders.routes.js';
import analyticsRoutes, { handleCallCount } from './routes/analytics.routes.js';
import aiRoutes from './routes/ai.routes.js';
import docsRoutes from './routes/docs.routes.js';
import auditRoutes from './routes/audit.routes.js';
import { authenticate, requireRole } from './middleware/auth.middleware.js';
import systemRoutes from './routes/system.routes.js';

export function createApp(): express.Application {
  registerDomainEventHandlers();
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(cors({ origin: true, credentials: true }));
  app.use(compression());
  app.use(correlationMiddleware);
  app.use(metricsMiddleware);

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
          (req.url?.startsWith('/api/docs') ?? false),
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

  app.use(systemRoutes);
  app.use(docsRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/audit', auditRoutes);

  app.use(errorHandler);

  return app;
}
