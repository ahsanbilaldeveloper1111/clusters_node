import { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { createApiClient } from '../services/api.client.js';
import type { CpuTaskResult } from '../types/models.js';

export default function AnalyticsPage() {
  const { token } = useAuth();
  const [sales, setSales] = useState<unknown[]>([]);
  const [summaries, setSummaries] = useState<unknown[]>([]);
  const [cpuResult, setCpuResult] = useState<CpuTaskResult | null>(null);
  const [loading, setLoading] = useState(false);

  const client = createApiClient(token);

  async function loadAnalytics() {
    setLoading(true);
    try {
      const [s, u] = await Promise.all([
        client.get<unknown[]>('/analytics/sales-by-category'),
        client.get<unknown[]>('/analytics/user-summaries'),
      ]);
      setSales(s);
      setSummaries(u);
    } finally {
      setLoading(false);
    }
  }

  async function runWorkerTask() {
    const result = await client.post<CpuTaskResult>('/analytics/compute', {
      task: 'primes',
      limit: 500_000,
    });
    setCpuResult(result);
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Analytics</h1>
        <p>Advanced PostgreSQL queries + Worker Thread compute</p>
      </header>

      <div className="toolbar">
        <button type="button" className="btn-primary" onClick={() => void loadAnalytics()} disabled={loading}>
          Load SQL analytics
        </button>
        <button type="button" className="btn-secondary" onClick={() => void runWorkerTask()}>
          Run CPU task (Worker Thread)
        </button>
      </div>

      {cpuResult && (
        <div className="card">
          <h3>Worker Thread result</h3>
          <pre>{JSON.stringify(cpuResult, null, 2)}</pre>
          <p className="muted">Completed in {cpuResult.durationMs?.toFixed(2)}ms off main thread</p>
        </div>
      )}

      <div className="grid two-col">
        <div className="card">
          <h3>Sales by category (CTE + RANK)</h3>
          <pre>{JSON.stringify(sales, null, 2)}</pre>
        </div>
        <div className="card">
          <h3>User summaries (window functions)</h3>
          <pre>{JSON.stringify(summaries, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
