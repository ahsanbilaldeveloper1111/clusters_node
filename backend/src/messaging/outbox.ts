/**
 * Transactional outbox — avoids dual-write loss between DB and message bus.
 * Insert outbox row in the same DB transaction as the business write.
 * A background poller publishes unpublished rows to Redis Streams.
 */
import type pg from 'pg';
import { query } from '../database/pool.js';
import { getCorrelationId } from '../lib/request-context.js';
import { features } from '../config/features.js';

export interface OutboxPayload {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  correlationId?: string;
}

export async function insertOutboxEvent(
  client: pg.PoolClient,
  event: OutboxPayload
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, correlation_id)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     RETURNING id::text`,
    [
      event.aggregateType,
      event.aggregateId,
      event.eventType,
      JSON.stringify(event.payload),
      event.correlationId ?? getCorrelationId(),
    ]
  );
  return rows[0]!.id;
}

/** Convenience for routes that already finished the business TX — still durable. */
export async function enqueueOutboxAfterCommit(event: OutboxPayload): Promise<void> {
  if (!features.outbox()) return;
  await query(
    `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload, correlation_id)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [
      event.aggregateType,
      event.aggregateId,
      event.eventType,
      JSON.stringify(event.payload),
      event.correlationId ?? getCorrelationId(),
    ]
  );
}

export interface UnpublishedOutboxRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  correlation_id: string | null;
  publish_attempts: number;
}

export async function claimUnpublished(limit = 20): Promise<UnpublishedOutboxRow[]> {
  const { withTransaction } = await import('../database/pool.js');
  return withTransaction(async (client) => {
    const { rows } = await client.query<UnpublishedOutboxRow>(
      `SELECT id::text, aggregate_type, aggregate_id, event_type, payload, correlation_id, publish_attempts
       FROM outbox_events
       WHERE published_at IS NULL
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit]
    );
    return rows;
  });
}

export async function markPublished(id: string): Promise<void> {
  await query(`UPDATE outbox_events SET published_at = NOW(), last_error = NULL WHERE id = $1`, [id]);
}

export async function markPublishFailed(id: string, error: string): Promise<void> {
  await query(
    `UPDATE outbox_events
     SET publish_attempts = publish_attempts + 1, last_error = $2
     WHERE id = $1`,
    [id, error.slice(0, 500)]
  );
}

export async function outboxStats(): Promise<{
  pending: number;
  published: number;
  failedAttempts: number;
}> {
  const { rows } = await query<{ pending: string; published: string; failed: string }>(`
    SELECT
      COUNT(*) FILTER (WHERE published_at IS NULL)::text AS pending,
      COUNT(*) FILTER (WHERE published_at IS NOT NULL)::text AS published,
      COALESCE(SUM(publish_attempts) FILTER (WHERE published_at IS NULL), 0)::text AS failed
    FROM outbox_events
  `);
  return {
    pending: Number(rows[0]?.pending ?? 0),
    published: Number(rows[0]?.published ?? 0),
    failedAttempts: Number(rows[0]?.failed ?? 0),
  };
}
