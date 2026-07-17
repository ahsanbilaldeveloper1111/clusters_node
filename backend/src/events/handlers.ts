import { eventBus } from './event-bus.js';
import * as auditRepo from '../database/repositories/audit.repository.js';
import { logger } from '../utils/logger.js';

let registered = false;

/** Side-effect handlers — keep route handlers thin (event-driven style) */
export function registerDomainEventHandlers(): void {
  if (registered) return;
  registered = true;

  eventBus.on('OrderCreated', async (e) => {
    await auditRepo.writeAudit({
      entityType: 'order',
      entityId: e.orderId,
      action: 'created',
      actorId: e.userId,
      payload: { total: e.total, via: 'domain-event' },
    });
  });

  eventBus.on('OrderCancelled', async (e) => {
    await auditRepo.writeAudit({
      entityType: 'order',
      entityId: e.orderId,
      action: 'cancelled',
      actorId: e.userId,
      payload: { previousStatus: e.previousStatus, via: 'domain-event' },
    });
  });

  eventBus.on('UserRegistered', async (e) => {
    await auditRepo.writeAudit({
      entityType: 'user',
      entityId: e.userId,
      action: 'registered',
      actorId: e.userId,
      payload: { email: e.email, via: 'domain-event' },
    });
  });

  eventBus.on('ProductUpdated', async (e) => {
    await auditRepo.writeAudit({
      entityType: 'product',
      entityId: e.productId,
      action: 'updated',
      actorId: e.actorId,
      payload: { via: 'domain-event' },
    });
  });

  eventBus.on('AiInsightGenerated', (e) => {
    logger.info({ mode: e.mode, questionLength: e.questionLength }, 'AI insight generated');
  });

  logger.info('Domain event handlers registered');
}
