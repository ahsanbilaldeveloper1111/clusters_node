/**
 * Outbox poller + stream consumer + webhook dispatcher.
 * Runs inside each worker process when FEATURE_OUTBOX=true.
 */
import { logger } from '../utils/logger.js';
import { features } from '../config/features.js';
import {
  claimUnpublished,
  markPublished,
  markPublishFailed,
} from './outbox.js';
import { consumeStreamOnce, ensureStreamGroup, publishToStream } from './redis-streams.js';
import { dispatchWebhookForEvent } from './webhooks.js';

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const rows = await claimUnpublished(25);
    for (const row of rows) {
      try {
        const streamId = await publishToStream(row);
        if (streamId === null) {
          // No Redis — mark published locally so demos still progress; log the gap.
          logger.warn({ outboxId: row.id }, 'Outbox publish skipped (Redis unavailable)');
        }
        await markPublished(row.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await markPublishFailed(row.id, msg);
        logger.error({ err, outboxId: row.id }, 'Outbox publish failed');
      }
    }

    await consumeStreamOnce(async (fields) => {
      await dispatchWebhookForEvent({
        eventType: fields['eventType'] ?? 'Unknown',
        aggregateType: fields['aggregateType'] ?? '',
        aggregateId: fields['aggregateId'] ?? '',
        correlationId: fields['correlationId'] || undefined,
        payload: JSON.parse(fields['payload'] ?? '{}') as Record<string, unknown>,
      });
    });
  } finally {
    running = false;
  }
}

export async function startMessagingWorkers(): Promise<void> {
  if (!features.outbox()) {
    logger.info('Outbox messaging disabled (FEATURE_OUTBOX=false)');
    return;
  }
  await ensureStreamGroup();
  timer = setInterval(() => {
    void tick();
  }, 1500);
  // Allow process to exit even if timer is pending (dev / tests)
  timer.unref?.();
  logger.info('Outbox + Redis Streams workers started');
}

export function stopMessagingWorkers(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
