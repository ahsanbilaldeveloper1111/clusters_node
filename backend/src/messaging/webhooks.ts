/**
 * Partner webhooks with HMAC-SHA256 signatures (enterprise integration pattern).
 * Set WEBHOOK_URL + WEBHOOK_SECRET to deliver OrderCreated / OrderCancelled events.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';
import { query } from '../database/pool.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../lib/retry.js';
import { features } from '../config/features.js';
import { assertSafeOutboundUrl } from '../security/ssrf.js';

export interface WebhookEvent {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  correlationId?: string;
  payload: Record<string, unknown>;
}

export function signWebhookBody(body: string, secret: string, timestamp: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function verifyWebhookSignature(
  body: string,
  secret: string,
  timestamp: string,
  signature: string
): boolean {
  const expected = signWebhookBody(body, secret, timestamp);
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function dispatchWebhookForEvent(event: WebhookEvent): Promise<void> {
  if (!features.webhooks()) return;
  const url = env.WEBHOOK_URL;
  const secret = env.WEBHOOK_SECRET;
  if (!url || !secret) return;

  // Only fan out commerce lifecycle events
  if (!['OrderCreated', 'OrderCancelled', 'UserRegistered'].includes(event.eventType)) {
    return;
  }

  const envelope = {
    id: event.aggregateId,
    type: event.eventType,
    createdAt: new Date().toISOString(),
    correlationId: event.correlationId,
    data: event.payload,
  };
  const body = JSON.stringify(envelope);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = signWebhookBody(body, secret, timestamp);

  const { rows } = await query<{ id: string }>(
    `INSERT INTO webhook_deliveries (event_type, target_url, payload, signature, status)
     VALUES ($1, $2, $3::jsonb, $4, 'pending')
     RETURNING id::text`,
    [event.eventType, url, body, signature]
  );
  const deliveryId = rows[0]!.id;

  try {
    await withRetry(
      async () => {
        await assertSafeOutboundUrl(url);
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Timestamp': timestamp,
            'X-Webhook-Signature': signature,
            'X-Correlation-Id': event.correlationId ?? '',
            'User-Agent': 'enterprise-advanced-app-webhooks/1.0',
          },
          body,
        });
        if (res.status >= 500) {
          throw new Error(`Webhook upstream ${res.status}`);
        }
        await query(
          `UPDATE webhook_deliveries
           SET status = $2, attempts = attempts + 1, last_status_code = $3, delivered_at = NOW()
           WHERE id = $1`,
          [deliveryId, res.ok ? 'delivered' : 'rejected', res.status]
        );
        if (!res.ok && res.status < 500) {
          logger.warn({ deliveryId, status: res.status }, 'Webhook rejected by partner');
        }
      },
      {
        retries: 3,
        minDelayMs: 200,
        onRetry: (err, attempt, delayMs) => {
          logger.warn({ err, attempt, delayMs, deliveryId }, 'Webhook retry');
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await query(
      `UPDATE webhook_deliveries
       SET status = 'failed', attempts = attempts + 1, last_error = $2
       WHERE id = $1`,
      [deliveryId, msg.slice(0, 500)]
    );
    logger.error({ err, deliveryId }, 'Webhook delivery failed');
  }
}

export async function webhookStats(): Promise<{
  pending: number;
  delivered: number;
  failed: number;
}> {
  const { rows } = await query<{ pending: string; delivered: string; failed: string }>(`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('pending', 'retry'))::text AS pending,
      COUNT(*) FILTER (WHERE status = 'delivered')::text AS delivered,
      COUNT(*) FILTER (WHERE status = 'failed')::text AS failed
    FROM webhook_deliveries
  `);
  return {
    pending: Number(rows[0]?.pending ?? 0),
    delivered: Number(rows[0]?.delivered ?? 0),
    failed: Number(rows[0]?.failed ?? 0),
  };
}
