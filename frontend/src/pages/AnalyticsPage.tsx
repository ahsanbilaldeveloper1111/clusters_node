import { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { createApiClient, ApiClientError } from '../services/api.client.js';
import type { CallCountResult, CpuTaskResult, LastCalledAtRow } from '../types/models.js';

const SAMPLE_NUMBERS = '15551234567\n15559876543\n15550001111\n15550009999';

function parseRemotePartyNumbers(raw: string): string[] {
  const numbers = raw
    .split(/[\n,]+/)
    .map((n) => n.trim())
    .filter(Boolean);
  return [...new Set(numbers)];
}

function formatCalledAt(iso: string | null): string {
  if (!iso) return 'Never called';
  return new Date(iso).toLocaleString();
}

export default function AnalyticsPage() {
  const { token } = useAuth();
  const [sales, setSales] = useState<unknown[]>([]);
  const [summaries, setSummaries] = useState<unknown[]>([]);
  const [cpuResult, setCpuResult] = useState<CpuTaskResult | null>(null);
  const [loading, setLoading] = useState(false);

  const [numbersInput, setNumbersInput] = useState(SAMPLE_NUMBERS);
  const [lastCalledRows, setLastCalledRows] = useState<LastCalledAtRow[] | null>(null);
  const [callCount, setCallCount] = useState<CallCountResult | null>(null);
  const [callLoading, setCallLoading] = useState<'last' | 'count' | null>(null);
  const [callError, setCallError] = useState<string | null>(null);

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

  async function lookupLastCalledAt() {
    const remote_party_numbers = parseRemotePartyNumbers(numbersInput);
    if (remote_party_numbers.length === 0) {
      setCallError('Enter at least one remote party number.');
      return;
    }

    setCallLoading('last');
    setCallError(null);
    setCallCount(null);
    try {
      const data = await client.post<LastCalledAtRow[]>('/analytics/calls/last-called-at', {
        remote_party_numbers,
      });
      setLastCalledRows(data);
    } catch (err) {
      setLastCalledRows(null);
      setCallError(err instanceof ApiClientError ? err.message : 'Request failed');
    } finally {
      setCallLoading(null);
    }
  }

  async function fetchCallCount() {
    const remote_party_numbers = parseRemotePartyNumbers(numbersInput);
    if (remote_party_numbers.length === 0) {
      setCallError('Enter at least one remote party number.');
      return;
    }

    setCallLoading('count');
    setCallError(null);
    setLastCalledRows(null);
    try {
      const data = await client.post<CallCountResult>('/analytics/calls/count', {
        remote_party_numbers,
      });
      setCallCount(data);
    } catch (err) {
      setCallCount(null);
      setCallError(err instanceof ApiClientError ? err.message : 'Request failed');
    } finally {
      setCallLoading(null);
    }
  }

  const parsedCount = parseRemotePartyNumbers(numbersInput).length;

  return (
    <div className="page">
      <header className="page-header">
        <h1>Analytics</h1>
        <p>Call analytics, advanced PostgreSQL queries, and Worker Thread compute</p>
      </header>

      <section className="card mb-1">
        <h3>Call analytics</h3>
        <p className="hint mb-1">
          Enter remote party numbers (one per line or comma-separated). Sample seed numbers are
          pre-filled.
        </p>
        <label>
          Remote party numbers
          <textarea
            value={numbersInput}
            onChange={(e) => setNumbersInput(e.target.value)}
            rows={5}
            placeholder="15551234567&#10;15559876543"
          />
        </label>
        <p className="muted mt-1">
          {parsedCount} unique number{parsedCount === 1 ? '' : 's'} parsed
        </p>
        <div className="toolbar mt-1">
          <button
            type="button"
            className="btn-primary"
            onClick={() => void lookupLastCalledAt()}
            disabled={callLoading !== null}
          >
            {callLoading === 'last' ? 'Looking up…' : 'Last called at'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void fetchCallCount()}
            disabled={callLoading !== null}
          >
            {callLoading === 'count' ? 'Counting…' : 'Total call count'}
          </button>
        </div>
        {callError && (
          <div className="alert error mt-1">
            {callError}
          </div>
        )}
        {lastCalledRows && (
          <div className="mt-1 table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Remote party number</th>
                  <th>Last called at</th>
                </tr>
              </thead>
              <tbody>
                {lastCalledRows.map((row) => (
                  <tr key={row.remote_party_number}>
                    <td>
                      <code>{row.remote_party_number}</code>
                    </td>
                    <td className={row.last_called_at ? undefined : 'muted'}>
                      {formatCalledAt(row.last_called_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {callCount && (
          <div className="mt-1">
            <p className="call-count-stat">{callCount.call_count.toLocaleString()}</p>
            <p className="muted">
              Total matching calls across {callCount.filter_count.toLocaleString()} filter
              number{callCount.filter_count === 1 ? '' : 's'}
            </p>
          </div>
        )}
      </section>

      <div className="toolbar">
        <button type="button" className="btn-primary" onClick={() => void loadAnalytics()} disabled={loading}>
          Load SQL analytics
        </button>
        <button type="button" className="btn-secondary" onClick={() => void runWorkerTask()}>
          Run CPU task (Worker Thread)
        </button>
      </div>

      {cpuResult && (
        <div className="card mt-1">
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
