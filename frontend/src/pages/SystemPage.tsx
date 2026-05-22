import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { createApiClient } from '../services/api.client.js';
import type { SystemInfo } from '../types/models.js';

export default function SystemPage() {
  const { token } = useAuth();
  const [info, setInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    void createApiClient(token)
      .get<SystemInfo>('/system/info')
      .then((data) => setInfo(data as SystemInfo));
  }, [token]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>System</h1>
        <p>Cluster worker and Node.js runtime information</p>
      </header>

      {info ? (
        <div className="card">
          <pre>{JSON.stringify(info, null, 2)}</pre>
        </div>
      ) : (
        <p>Loading…</p>
      )}

      <div className="card diagram">
        <h3>Request flow</h3>
        <pre>{`
Browser → Nginx (frontend:80)
           ├─ /api/* → Backend cluster (port 3000)
           │              ├─ Worker 1 (Express)
           │              ├─ Worker 2 (Express)
           │              └─ Worker N ...
           └─ /* → React SPA

CPU-heavy route → Worker Thread (isolated V8 isolate)
        `}</pre>
      </div>
    </div>
  );
}
