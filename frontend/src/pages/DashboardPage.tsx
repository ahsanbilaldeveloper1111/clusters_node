import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { createApiClient } from '../services/api.client.js';
import type { HealthStatus, Order } from '../types/models.js';

export default function DashboardPage() {
  const { token, user, can } = useAuth();
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

        {can('ai') && (
          <div className="card ai-feature-card">
            <h3>AI Business Assistant</h3>
            <p>
              Chat, summarize, and recommend — answers grounded in live order/product SQL with
              OpenAI or demo mode and a circuit-breaker fallback.
            </p>
            <Link to="/ai" className="btn-primary ai-feature-link">
              Open AI Assistant →
            </Link>
          </div>
        )}

        {can('ml') && (
          <div className="card ml-feature-card">
            <h3>ML Learning Lab</h3>
            <p>
              Hands-on classic ML: feature engineering, linear/logistic regression, k-means, and
              TF-IDF similarity — implemented from scratch in TypeScript on your product data.
            </p>
            <Link to="/ml" className="btn-primary ai-feature-link">
              Open ML Lab →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
