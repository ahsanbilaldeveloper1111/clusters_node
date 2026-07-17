import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { CircuitOpenError } from '../lib/circuit-breaker.js';
import { getCorrelationId } from '../lib/request-context.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const correlationId = getCorrelationId();

  if (err instanceof CircuitOpenError) {
    res.status(503).json({
      error: {
        code: 'CIRCUIT_OPEN',
        message: err.message,
        correlationId,
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details, correlationId },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: err.flatten(),
        correlationId,
      },
    });
    return;
  }

  logger.error({ err, correlationId }, 'Unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error', correlationId },
  });
}
