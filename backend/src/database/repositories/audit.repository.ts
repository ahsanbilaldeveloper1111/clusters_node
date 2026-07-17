import { query } from '../pool.js';
import type { PaginatedResult } from '../../utils/pagination.js';
import { toPaginated } from '../../utils/pagination.js';

export interface AuditLogRow {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: Date;
}

export async function listPaginated(opts: {
  entityType?: string;
  page: number;
  limit: number;
  offset: number;
}): Promise<PaginatedResult<AuditLogRow>> {
  const filters: string[] = [];
  const params: unknown[] = [];
  if (opts.entityType) {
    params.push(opts.entityType);
    filters.push(`entity_type = $${params.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM audit_logs ${where}`,
    params
  );
  const total = Number(countResult.rows[0]?.count ?? 0);
  params.push(opts.limit, opts.offset);
  const { rows } = await query<AuditLogRow>(
    `SELECT id::text, entity_type, entity_id::text, action, actor_id::text, payload, created_at
     FROM audit_logs ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return toPaginated(rows, total, opts.page, opts.limit);
}

export async function writeAudit(opts: {
  entityType: string;
  entityId?: string;
  action: string;
  actorId?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO audit_logs (entity_type, entity_id, action, actor_id, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      opts.entityType,
      opts.entityId ?? null,
      opts.action,
      opts.actorId ?? null,
      JSON.stringify(opts.payload ?? {}),
    ]
  );
}
