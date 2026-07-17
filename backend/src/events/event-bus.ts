/**
 * In-process domain event bus (Observer pattern).
 * Demonstrates event-driven decoupling without Kafka for the portfolio.
 */
import { EventEmitter } from 'node:events';
import { logger } from '../utils/logger.js';
import { getCorrelationId } from './request-context.js';

export type DomainEvent =
  | { type: 'OrderCreated'; orderId: string; userId: string; total: number }
  | { type: 'OrderCancelled'; orderId: string; userId: string; previousStatus: string }
  | { type: 'UserRegistered'; userId: string; email: string }
  | { type: 'ProductUpdated'; productId: string; actorId: string }
  | { type: 'AiInsightGenerated'; mode: string; questionLength: number };

type EventType = DomainEvent['type'];

type Handler<T extends EventType = EventType> = (
  event: Extract<DomainEvent, { type: T }>
) => void | Promise<void>;

class DomainEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  on<T extends EventType>(type: T, handler: Handler<T>): void {
    this.emitter.on(type, (event: DomainEvent) => {
      void Promise.resolve(handler(event as Extract<DomainEvent, { type: T }>)).catch((err) => {
        logger.error({ err, type, correlationId: getCorrelationId() }, 'Domain event handler failed');
      });
    });
  }

  emit(event: DomainEvent): void {
    logger.info(
      { eventType: event.type, correlationId: getCorrelationId(), event },
      'Domain event emitted'
    );
    this.emitter.emit(event.type, event);
  }

  listenerCount(type: EventType): number {
    return this.emitter.listenerCount(type);
  }
}

export const eventBus = new DomainEventBus();
