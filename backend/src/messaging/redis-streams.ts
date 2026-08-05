/**
 * Redis Streams publisher/consumer — portfolio stand-in for Kafka/SQS.
 * Stream key: enterprise:events
 */
import { getRedis } from '../cache/redis.js';
import { logger } from '../utils/logger.js';
import type { UnpublishedOutboxRow } from './outbox.js';

export const EVENT_STREAM = 'enterprise:events';
export const EVENT_GROUP = 'enterprise-workers';
export const EVENT_CONSUMER = `worker-${process.pid}`;

export async function ensureStreamGroup(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.xgroup('CREATE', EVENT_STREAM, EVENT_GROUP, '0', 'MKSTREAM');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('BUSYGROUP')) {
      logger.warn({ err }, 'Could not create Redis stream group');
    }
  }
}

export async function publishToStream(row: UnpublishedOutboxRow): Promise<string | null> {
  const redis = getRedis();
  if (!redis) return null;
  const id = await redis.xadd(
    EVENT_STREAM,
    '*',
    'outboxId',
    row.id,
    'eventType',
    row.event_type,
    'aggregateType',
    row.aggregate_type,
    'aggregateId',
    row.aggregate_id,
    'correlationId',
    row.correlation_id ?? '',
    'payload',
    JSON.stringify(row.payload)
  );
  return id;
}

export type StreamHandler = (fields: Record<string, string>) => Promise<void>;

/** Blocking read from consumer group (at-least-once). */
export async function consumeStreamOnce(handler: StreamHandler, blockMs = 2000): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;

  const result = (await redis.xreadgroup(
    'GROUP',
    EVENT_GROUP,
    EVENT_CONSUMER,
    'COUNT',
    10,
    'BLOCK',
    blockMs,
    'STREAMS',
    EVENT_STREAM,
    '>'
  )) as [string, [string, string[]][]][] | null;

  if (!result?.length) return 0;

  let handled = 0;
  for (const [, messages] of result) {
    for (const [id, flat] of messages) {
      const fields: Record<string, string> = {};
      for (let i = 0; i < flat.length; i += 2) {
        fields[flat[i]!] = flat[i + 1]!;
      }
      try {
        await handler(fields);
        await redis.xack(EVENT_STREAM, EVENT_GROUP, id);
        handled++;
      } catch (err) {
        logger.error({ err, id, fields }, 'Stream message handler failed (will retry via pending)');
      }
    }
  }
  return handled;
}
