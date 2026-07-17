import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export interface RequestContext {
  correlationId: string;
  userId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getCorrelationId(): string {
  return requestContext.getStore()?.correlationId ?? 'no-context';
}

export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id') || req.header('x-correlation-id');
  const correlationId = incoming && incoming.length <= 64 ? incoming : randomUUID();
  res.setHeader('X-Request-Id', correlationId);
  requestContext.run({ correlationId }, () => next());
}
