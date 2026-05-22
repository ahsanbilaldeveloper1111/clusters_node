import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { createApiClient } from '../services/api.client.js';
import type { HealthStatus, Order } from '../types/models.js';

export default function DashboardPage() {
  const { token, user } = useAuth();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    const client = createApiClient(token);
    void fetch('/health')
      .then((r) => r.json())
      .then(setHealth);
    if (user) {
      void client.get<Order[]>('/orders').then(setOrders).catch(() => setOrders([]));
    }
  }, [token, user]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p>Welcome, {user?.fullName}</p>
      </header>

      <div className="grid cards">
        <div className="card">
          <h3>API Health</h3>
          {health ? (
            <ul className="stat-list">
              <li>
                <span>Status</span>
                <span className={health.status === 'ok' ? 'ok' : 'warn'}>{health.status}</span>
              </li>
              <li>
                <span>Database</span>
                <span>{health.checks.database ? '✓' : '✗'}</span>
              </li>
              <li>
                <span>Redis</span>
                <span>{health.checks.redis ? '✓' : '✗'}</span>
              </li>
              <li>
                <span>Worker PID</span>
                <code>{health.worker.pid}</code>
              </li>
              <li>
                <span>Cluster worker</span>
                <code>{health.worker.workerId ?? 'primary'}</code>
              </li>
            </ul>
          ) : (
            <p>Loading…</p>
          )}
        </div>

        <div className="card">
          <h3>Your orders</h3>
          {orders.length === 0 ? (
            <p className="muted">No orders yet</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Status</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <code>{o.id.slice(0, 8)}…</code>
                    </td>
                    <td>{o.status}</td>
                    <td>${o.total_amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card highlight">
          <h3>Architecture</h3>
          <p>
            Requests hit <strong>nginx</strong> → <strong>cluster workers</strong> (multi-core) →{' '}
            <strong>PostgreSQL</strong> with advanced SQL. CPU tasks use <strong>Worker Threads</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
