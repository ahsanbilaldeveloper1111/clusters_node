import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { createApiClient } from '../services/api.client.js';

interface AdvancedInfo {
  nodeVersion: string;
  platform: string;
  cpus: number;
  memory: Record<string, number>;
  cluster: { isPrimary: boolean; workerId: string | null };
  correlationId?: string;
  advanced?: {
    featureFlags: Record<string, boolean>;
    circuitBreakers: { name: string; state: string; failures: number }[];
    domainEventListeners: Record<string, number>;
    concepts: string[];
  };
}

export default function SystemPage() {
  const { token } = useAuth();
  const [info, setInfo] = useState<AdvancedInfo | null>(null);

  useEffect(() => {
    void createApiClient(token)
      .get<AdvancedInfo>('/system/info')
      .then(setInfo);
  }, [token]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>System</h1>
        <p>Runtime + advanced engineering concepts (interview showcase)</p>
      </header>

      {info ? (
        <>
          <div className="grid cards">
            <div className="card">
              <h3>Correlation</h3>
              <p className="muted">AsyncLocalStorage request context</p>
              <code>{info.correlationId ?? '—'}</code>
            </div>
            <div className="card">
              <h3>Feature flags</h3>
              <ul className="stat-list">
                {info.advanced &&
                  Object.entries(info.advanced.featureFlags).map(([k, v]) => (
                    <li key={k}>
                      <span>{k}</span>
                      <span className={v ? 'ok' : 'warn'}>{v ? 'on' : 'off'}</span>
                    </li>
                  ))}
              </ul>
            </div>
            <div className="card">
              <h3>Circuit breakers</h3>
              <ul className="stat-list">
                {info.advanced?.circuitBreakers.map((c) => (
                  <li key={c.name}>
                    <span>{c.name}</span>
                    <span>
                      {c.state} ({c.failures} fails)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <h3>Concepts implemented</h3>
            <div className="toolbar" style={{ flexWrap: 'wrap' }}>
              {info.advanced?.concepts.map((c) => (
                <span key={c} className="tag">
                  {c}
                </span>
              ))}
            </div>
            <p className="muted" style={{ marginTop: '0.75rem' }}>
              Full write-up: <code>docs/ADVANCED_CONCEPTS.md</code>
            </p>
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <h3>Raw system info</h3>
            <pre>{JSON.stringify(info, null, 2)}</pre>
          </div>
        </>
      ) : (
        <p>Loading…</p>
      )}

      <div className="card diagram">
        <h3>Request flow</h3>
        <pre>{`
Browser → Nginx
       → correlation middleware (X-Request-Id)
       → Express cluster worker
            ├─ Repository / Transaction (UoW)
            ├─ Domain events → audit handlers
            ├─ Redis (circuit breaker + Result)
            └─ AI strategy (OpenAI | demo)
        `}</pre>
      </div>
    </div>
  );
}
