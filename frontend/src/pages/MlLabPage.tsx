import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { createApiClient } from '../services/api.client.js';

type MlTask = 'regression' | 'classification' | 'clustering' | 'similarity';

interface CurriculumItem {
  id: string;
  title: string;
  summary: string;
  concepts: string[];
  detail: string;
}

interface MlStatus {
  enabled: boolean;
  mode: string;
  sampleCount: number;
  featureNames: string[];
  labelBalance: { lowStock: number; healthyStock: number };
  pipeline: string[];
  curriculum: CurriculumItem[];
  tasks: { id: MlTask; title: string; goal: string }[];
  featureExplain: string[];
  generatedAt: string;
}

interface FeaturePreview {
  featureNames: string[];
  explain: string[];
  preview: {
    id: string;
    name: string;
    category: string;
    features: Record<string, number>;
    labels: { price: number; isLowStock: number };
  }[];
  total: number;
}

interface ExperimentResult {
  ok: boolean;
  message?: string;
  task: MlTask;
  lesson?: CurriculumItem;
  howItWorks?: string[];
  note?: string;
  query?: string;
  vocabularySize?: number;
  vocabularySample?: string[];
  matches?: { id: string; title: string; score: number }[];
  model?: {
    kind: string;
    bias?: number;
    learningRate?: number;
    epochs?: number;
    threshold?: number;
    k?: number;
    iterations?: number;
    inertia?: number;
    weights?: { feature: string; weight: number }[];
    lossCurve?: number[];
    centroids?: { cluster: number; values: number[] }[];
    featureNames?: string[];
  };
  split?: { train: number; test: number; testRatio: number };
  metrics?: Record<string, unknown>;
  predictions?: Record<string, unknown>[];
  clusterSizes?: number[];
  assignments?: {
    id: string;
    name: string;
    category: string;
    cluster: number;
    price: number;
    stock: number;
  }[];
}

const TASK_HELP: Record<MlTask, string> = {
  regression: 'Predict a continuous number (price) with linear regression + gradient descent.',
  classification: 'Predict a class (low-stock risk) with logistic regression + sigmoid.',
  clustering: 'Discover groups without labels using k-means.',
  similarity: 'Turn text into vectors and rank by cosine similarity (mini RAG idea).',
};

export default function MlLabPage() {
  const { token } = useAuth();
  const [status, setStatus] = useState<MlStatus | null>(null);
  const [features, setFeatures] = useState<FeaturePreview | null>(null);
  const [task, setTask] = useState<MlTask>('regression');
  const [epochs, setEpochs] = useState(200);
  const [learningRate, setLearningRate] = useState(0.05);
  const [k, setK] = useState(3);
  const [query, setQuery] = useState('wireless headphones electronics');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExperimentResult | null>(null);
  const [activeLesson, setActiveLesson] = useState(0);

  const load = useCallback(async () => {
    try {
      const client = createApiClient(token);
      const [st, ft] = await Promise.all([
        client.get<MlStatus>('/ml/status'),
        client.get<FeaturePreview>('/ml/features?limit=8'),
      ]);
      setStatus(st);
      setFeatures(ft);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ML lab');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runExperiment() {
    setLoading(true);
    setError(null);
    try {
      const client = createApiClient(token);
      const data = await client.post<ExperimentResult>('/ml/experiment', {
        task,
        epochs,
        learningRate,
        k,
        query: query.trim() || undefined,
        testRatio: 0.25,
      });
      setResult(data);
      if (!data.ok) setError(data.message ?? 'Experiment failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Experiment failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const lesson = status?.curriculum[activeLesson];

  return (
    <div className="page">
      <header className="page-header">
        <h1>ML Learning Lab</h1>
        <p>
          Learn how machine learning works by running <strong>from-scratch TypeScript
          algorithms</strong> on your live product data — no black-box library. Then compare with
          the LLM assistant under <code>/ai</code>.
        </p>
      </header>

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '1rem' }}>
          <p>{error}</p>
        </div>
      )}

      <div className="grid cards ai-status-grid">
        <div className="card">
          <h3>Lab status</h3>
          {status ? (
            <ul className="stat-list">
              <li>
                <span>Engine</span>
                <code>{status.mode}</code>
              </li>
              <li>
                <span>Samples</span>
                <strong>{status.sampleCount}</strong>
              </li>
              <li>
                <span>Low-stock labels</span>
                <strong>
                  {status.labelBalance.lowStock} / {status.sampleCount}
                </strong>
              </li>
              <li>
                <span>Features</span>
                <code>{status.featureNames.join(', ')}</code>
              </li>
            </ul>
          ) : (
            <p className="muted">Loading…</p>
          )}
        </div>

        <div className="card highlight">
          <h3>ML vs LLM (same app)</h3>
          <ul className="stat-list">
            <li>
              <span>Classic ML</span>
              <span>Train weights on tables</span>
            </li>
            <li>
              <span>This lab</span>
              <span>GD, k-means, TF-IDF</span>
            </li>
            <li>
              <span>LLM assistant</span>
              <span>Prompt + SQL snapshot</span>
            </li>
            <li>
              <span>Shared idea</span>
              <span>Grounding in real data</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Curriculum</h3>
        <div className="ai-tabs">
          {(status?.curriculum ?? []).map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={activeLesson === i ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setActiveLesson(i)}
            >
              {c.title}
            </button>
          ))}
        </div>
        {lesson && (
          <div className="ml-lesson">
            <p>
              <strong>{lesson.summary}</strong>
            </p>
            <p className="muted">{lesson.detail}</p>
            <div className="ai-suggestions">
              {lesson.concepts.map((c) => (
                <span key={c} className="ml-concept">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Feature engineering preview</h3>
        <p className="muted">
          Raw DB fields → numeric vectors. Read{' '}
          <code>backend/src/services/ml/dataset.ts</code> and{' '}
          <code>algorithms.ts</code> while you experiment.
        </p>
        {(features?.explain ?? []).map((line) => (
          <p key={line} className="muted" style={{ fontSize: '0.85rem' }}>
            • {line}
          </p>
        ))}
        {features?.preview?.length ? (
          <div className="ml-table-wrap">
            <table className="ml-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>stock</th>
                  <th>nameLen</th>
                  <th>descLen</th>
                  <th>catHash</th>
                  <th>y price</th>
                  <th>y low?</th>
                </tr>
              </thead>
              <tbody>
                {features.preview.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.features.stock}</td>
                    <td>{r.features.nameLength}</td>
                    <td>{r.features.descLength}</td>
                    <td>{r.features.categoryHash}</td>
                    <td>{r.labels.price}</td>
                    <td>{r.labels.isLowStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No products yet — seed the catalog to unlock experiments.</p>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3>Run an experiment</h3>
        <p className="muted">{TASK_HELP[task]}</p>

        <div className="ai-industry-grid">
          {(status?.tasks ?? []).map((t) => (
            <button
              key={t.id}
              type="button"
              className={`ai-industry-card ${task === t.id ? 'active' : ''}`}
              onClick={() => setTask(t.id)}
            >
              <strong>{t.title}</strong>
              <span className="muted">{t.goal}</span>
            </button>
          ))}
        </div>

        <div className="ml-controls">
          {(task === 'regression' || task === 'classification') && (
            <>
              <label>
                Epochs
                <input
                  type="number"
                  min={50}
                  max={800}
                  value={epochs}
                  onChange={(e) => setEpochs(Number(e.target.value))}
                />
              </label>
              <label>
                Learning rate
                <input
                  type="number"
                  step="0.01"
                  min={0.001}
                  max={0.5}
                  value={learningRate}
                  onChange={(e) => setLearningRate(Number(e.target.value))}
                />
              </label>
            </>
          )}
          {task === 'clustering' && (
            <label>
              k clusters
              <input
                type="number"
                min={2}
                max={6}
                value={k}
                onChange={(e) => setK(Number(e.target.value))}
              />
            </label>
          )}
          {task === 'similarity' && (
            <label className="ml-query">
              Search query
              <input value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          )}
        </div>

        <button type="button" className="btn-primary" disabled={loading} onClick={() => void runExperiment()}>
          {loading ? 'Training…' : 'Train & evaluate'}
        </button>
      </div>

      {result?.ok && (
        <>
          <div className="card">
            <h3>What just happened</h3>
            {result.lesson && (
              <p>
                <strong>{result.lesson.title}</strong> — {result.lesson.summary}
              </p>
            )}
            {result.note && <p className="muted">{result.note}</p>}
            <ol className="ai-pipeline-steps">
              {(result.howItWorks ?? []).map((step, i) => (
                <li key={step}>
                  <span className="ai-step-num">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {result.model && (
            <div className="card">
              <h3>Model internals</h3>
              <ul className="stat-list">
                <li>
                  <span>Kind</span>
                  <code>{result.model.kind}</code>
                </li>
                {result.split && (
                  <li>
                    <span>Split</span>
                    <span>
                      train {result.split.train} / test {result.split.test}
                    </span>
                  </li>
                )}
                {result.model.bias != null && (
                  <li>
                    <span>Bias</span>
                    <code>{result.model.bias}</code>
                  </li>
                )}
                {result.model.learningRate != null && (
                  <li>
                    <span>Learning rate</span>
                    <code>{result.model.learningRate}</code>
                  </li>
                )}
                {result.model.epochs != null && (
                  <li>
                    <span>Epochs</span>
                    <code>{result.model.epochs}</code>
                  </li>
                )}
                {result.model.k != null && (
                  <li>
                    <span>k / iterations</span>
                    <code>
                      {result.model.k} / {result.model.iterations}
                    </code>
                  </li>
                )}
                {result.model.inertia != null && (
                  <li>
                    <span>Inertia</span>
                    <code>{result.model.inertia}</code>
                  </li>
                )}
                {result.vocabularySize != null && (
                  <li>
                    <span>Vocabulary size</span>
                    <code>{result.vocabularySize}</code>
                  </li>
                )}
              </ul>

              {result.model.weights && (
                <div className="ml-table-wrap" style={{ marginTop: '1rem' }}>
                  <table className="ml-table">
                    <thead>
                      <tr>
                        <th>Feature</th>
                        <th>Learned weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.model.weights.map((w) => (
                        <tr key={w.feature}>
                          <td>{w.feature}</td>
                          <td>{w.weight}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {result.model.lossCurve && result.model.lossCurve.length > 0 && (
                <div className="ml-loss" style={{ marginTop: '1rem' }}>
                  <h4>Loss curve (should trend down)</h4>
                  <div className="ml-loss-bars">
                    {result.model.lossCurve.map((v, i) => {
                      const max = Math.max(...(result.model?.lossCurve ?? [1]));
                      const h = Math.max(4, Math.round((v / (max || 1)) * 64));
                      return (
                        <div key={`${i}-${v}`} className="ml-loss-bar" title={`${v}`} style={{ height: h }} />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {result.metrics && (
            <div className="card">
              <h3>Evaluation metrics</h3>
              <pre className="ai-answer">{JSON.stringify(result.metrics, null, 2)}</pre>
            </div>
          )}

          {result.predictions && result.predictions.length > 0 && (
            <div className="card">
              <h3>Test predictions (sample)</h3>
              <pre className="ai-answer">{JSON.stringify(result.predictions, null, 2)}</pre>
            </div>
          )}

          {result.matches && (
            <div className="card">
              <h3>Similarity matches for “{result.query}”</h3>
              <ul className="ai-rec-list">
                {result.matches.map((m) => (
                  <li key={m.id}>
                    <strong>{m.title}</strong>
                    <div className="muted">cosine score {m.score.toFixed(4)}</div>
                  </li>
                ))}
              </ul>
              {result.vocabularySample && (
                <p className="muted" style={{ marginTop: '0.75rem' }}>
                  Vocab sample: {result.vocabularySample.join(', ')}
                </p>
              )}
            </div>
          )}

          {result.assignments && (
            <div className="card">
              <h3>Cluster assignments</h3>
              {result.clusterSizes && (
                <p className="muted">Sizes: {result.clusterSizes.map((s, i) => `C${i}=${s}`).join(' · ')}</p>
              )}
              <div className="ml-table-wrap">
                <table className="ml-table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Category</th>
                      <th>Cluster</th>
                      <th>Price</th>
                      <th>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.assignments.slice(0, 20).map((a) => (
                      <tr key={a.id}>
                        <td>{a.name}</td>
                        <td>{a.category}</td>
                        <td>{a.cluster}</td>
                        <td>{a.price}</td>
                        <td>{a.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
