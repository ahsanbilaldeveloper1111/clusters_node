import { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { createApiClient } from '../services/api.client.js';
import { useAsync } from '../hooks/useAsync.js';

interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

interface PaginatedAudit {
  items: AuditLog[];
  page: number;
  total: number;
  totalPages: number;
}

export default function AuditPage() {
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');

  const { state, refetch } = useAsync(() => {
    const q = new URLSearchParams({ page: String(page), limit: '20' });
    if (entityType) q.set('entityType', entityType);
    return createApiClient(token).get<PaginatedAudit>(`/audit?${q}`);
  }, [token, page, entityType]);

  const data = state.status === 'success' ? state.data : null;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Audit trail</h1>
        <p>Security-relevant events: orders, products, registrations</p>
      </header>

      <div className="toolbar">
        <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>
          <option value="">All entities</option>
          <option value="order">Orders</option>
          <option value="product">Products</option>
          <option value="user">Users</option>
        </select>
        <button type="button" className="btn-ghost" onClick={() => void refetch()}>
          Refresh
        </button>
      </div>

      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'error' && <div className="alert error">{state.error}</div>}

      {data && (
        <>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Entity</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Payload</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.created_at).toLocaleString()}</td>
                  <td>
                    {row.entity_type}
                    {row.entity_id ? (
                      <>
                        {' '}
                        <code>{row.entity_id.slice(0, 8)}…</code>
                      </>
                    ) : null}
                  </td>
                  <td>{row.action}</td>
                  <td>
                    <code>{row.actor_id ? `${row.actor_id.slice(0, 8)}…` : '—'}</code>
                  </td>
                  <td>
                    <code style={{ fontSize: '0.75rem' }}>{JSON.stringify(row.payload)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="toolbar" style={{ marginTop: '1rem' }}>
            <button
              type="button"
              className="btn-ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </button>
            <span className="muted">
              Page {data.page} / {data.totalPages} ({data.total} events)
            </span>
            <button
              type="button"
              className="btn-ghost"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
