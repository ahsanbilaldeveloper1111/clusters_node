import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { createApiClient } from '../services/api.client.js';

type AiContext = 'orders' | 'products' | 'general';
type Tab = 'chat' | 'summarize' | 'recommend' | 'enterprise';
type EnterpriseIndustry = 'retail' | 'supply_chain' | 'finance' | 'operations';
type EnterpriseView = 'briefing' | 'risks' | 'actions';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AiInsight {
  answer: string;
  mode: 'openai' | 'demo';
  model: string;
  sources: string[];
  generatedAt: string;
  context: AiContext;
}

interface Recommendation {
  productId: string;
  name: string;
  category: string;
  stock: number;
  reason: string;
}

interface RecommendResult {
  recommendations: Recommendation[];
  mode: 'openai' | 'demo';
  model: string;
  generatedAt: string;
}

interface EnterpriseKpi {
  label: string;
  value: string;
  unit?: string;
  trendHint?: string;
}

interface EnterpriseRisk {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  evidence: string;
  recommendation: string;
}

interface EnterpriseAction {
  id: string;
  priority: number;
  owner: string;
  title: string;
  rationale: string;
  timeframe: string;
}

interface EnterpriseBriefing {
  industry: EnterpriseIndustry;
  headline: string;
  summary: string;
  kpis: EnterpriseKpi[];
  risks: EnterpriseRisk[];
  actions: EnterpriseAction[];
  mode: 'openai' | 'demo';
  model: string;
  sources: string[];
  generatedAt: string;
}

interface EnterpriseRisksResult {
  industry: EnterpriseIndustry;
  risks: EnterpriseRisk[];
  mode: 'openai' | 'demo';
  model: string;
  sources: string[];
  generatedAt: string;
}

interface EnterpriseActionsResult {
  industry: EnterpriseIndustry;
  actions: EnterpriseAction[];
  mode: 'openai' | 'demo';
  model: string;
  sources: string[];
  generatedAt: string;
}

interface AiStatus {
  enabled: boolean;
  mode: 'openai' | 'demo';
  provider: string;
  model: string;
  circuitBreaker: { name: string; state: string; failures: number };
  pipeline: string[];
  industries?: EnterpriseIndustry[];
  sources: string[];
  snapshot: {
    context: AiContext;
    totalOrders: number;
    totalRevenue: string;
    lowStockCount: number;
    averageOrderValue?: string;
    topCategories: { category: string; revenue: string; order_count: number }[];
  };
  generatedAt: string;
}

const SUGGESTIONS = [
  'What is our total revenue and order count?',
  'Which product categories drive the most sales?',
  'Do we have low stock inventory risks?',
];

const INDUSTRIES: { id: EnterpriseIndustry; label: string; blurb: string }[] = [
  { id: 'retail', label: 'Retail', blurb: 'Merchandising, stockouts, category mix' },
  { id: 'supply_chain', label: 'Supply Chain', blurb: 'Replenishment, backlog, safety stock' },
  { id: 'finance', label: 'Finance', blurb: 'AOV, concentration, cancellation leakage' },
  { id: 'operations', label: 'Operations', blurb: 'Pipeline health, owners, SLAs' },
];

export default function AiAssistantPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>('enterprise');
  const [question, setQuestion] = useState(SUGGESTIONS[0] ?? '');
  const [context, setContext] = useState<AiContext>('general');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<{ mode: string; model: string; sources?: string[] } | null>(
    null
  );
  const [summary, setSummary] = useState<AiInsight | null>(null);
  const [recs, setRecs] = useState<RecommendResult | null>(null);
  const [focus, setFocus] = useState('low stock');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [industry, setIndustry] = useState<EnterpriseIndustry>('retail');
  const [enterpriseView, setEnterpriseView] = useState<EnterpriseView>('briefing');
  const [enterpriseFocus, setEnterpriseFocus] = useState('inventory risk');
  const [briefing, setBriefing] = useState<EnterpriseBriefing | null>(null);
  const [enterpriseRisks, setEnterpriseRisks] = useState<EnterpriseRisksResult | null>(null);
  const [enterpriseActions, setEnterpriseActions] = useState<EnterpriseActionsResult | null>(null);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const client = createApiClient(token);
      const data = await client.get<AiStatus>(`/ai/status?context=${context}`);
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, [token, context]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function ask() {
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    const nextUser: ChatMessage = { role: 'user', content: question.trim() };
    const history = [...messages, nextUser];
    setMessages(history);
    setQuestion('');
    try {
      const client = createApiClient(token);
      const data = await client.post<AiInsight>('/ai/insights', {
        question: nextUser.content,
        context,
        history: messages,
      });
      setMessages([...history, { role: 'assistant', content: data.answer }]);
      setMeta({ mode: data.mode, model: data.model, sources: data.sources });
      void refreshStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  }

  async function runSummarize(target: 'orders' | 'products' | 'catalog') {
    setLoading(true);
    setError(null);
    try {
      const client = createApiClient(token);
      const data = await client.post<AiInsight>('/ai/summarize', { target });
      setSummary(data);
      setMeta({ mode: data.mode, model: data.model, sources: data.sources });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  async function runRecommend() {
    setLoading(true);
    setError(null);
    try {
      const client = createApiClient(token);
      const data = await client.post<RecommendResult>('/ai/recommend', {
        limit: 5,
        focus: focus.trim() || undefined,
      });
      setRecs(data);
      setMeta({ mode: data.mode, model: data.model });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      setRecs(null);
    } finally {
      setLoading(false);
    }
  }

  async function runEnterprise() {
    setLoading(true);
    setError(null);
    try {
      const client = createApiClient(token);
      const focusValue = enterpriseFocus.trim() || undefined;

      if (enterpriseView === 'briefing') {
        const data = await client.post<EnterpriseBriefing>('/ai/enterprise/briefing', {
          industry,
          focus: focusValue,
        });
        setBriefing(data);
        setEnterpriseRisks(null);
        setEnterpriseActions(null);
        setMeta({ mode: data.mode, model: data.model, sources: data.sources });
      } else if (enterpriseView === 'risks') {
        const data = await client.post<EnterpriseRisksResult>('/ai/enterprise/risks', {
          industry,
          limit: 8,
        });
        setEnterpriseRisks(data);
        setBriefing(null);
        setEnterpriseActions(null);
        setMeta({ mode: data.mode, model: data.model, sources: data.sources });
      } else {
        const data = await client.post<EnterpriseActionsResult>('/ai/enterprise/actions', {
          industry,
          limit: 5,
          focus: focusValue,
        });
        setEnterpriseActions(data);
        setBriefing(null);
        setEnterpriseRisks(null);
        setMeta({ mode: data.mode, model: data.model, sources: data.sources });
      }
      void refreshStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  const riskList = briefing?.risks ?? enterpriseRisks?.risks ?? [];
  const actionList = briefing?.actions ?? enterpriseActions?.actions ?? [];

  return (
    <div className="page">
      <header className="page-header">
        <h1>AI Business Assistant</h1>
        <p>
          Grounded in <strong>live PostgreSQL</strong> snapshots with enterprise industry
          playbooks (retail, supply chain, finance, operations). Works in <strong>demo</strong>{' '}
          mode without a key; set <code>OPENAI_API_KEY</code> for live LLM answers.
        </p>
      </header>

      <div className="ai-pipeline card">
        <h3>How it works</h3>
        <ol className="ai-pipeline-steps">
          {(status?.pipeline ?? [
            'Authenticate + RBAC (admin/manager)',
            'Build BusinessSnapshot from PostgreSQL',
            'Resolve provider (OpenAI if key set, else demo)',
            'Circuit breaker wraps OpenAI; falls back to demo on open',
            'Enterprise verticals: retail, supply_chain, finance, operations',
            'Return grounded answer + sources',
          ]).map((step, i) => (
            <li key={step}>
              <span className="ai-step-num">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid cards ai-status-grid">
        <div className="card">
          <h3>Provider</h3>
          {statusLoading && !status ? (
            <p className="muted">Loading…</p>
          ) : status ? (
            <ul className="stat-list">
              <li>
                <span>Feature</span>
                <span className={status.enabled ? 'ok' : 'warn'}>
                  {status.enabled ? 'enabled' : 'disabled'}
                </span>
              </li>
              <li>
                <span>Mode</span>
                <span className={`ai-mode-badge ${status.mode}`}>{status.mode}</span>
              </li>
              <li>
                <span>Model</span>
                <code>{status.model}</code>
              </li>
              <li>
                <span>Circuit</span>
                <code>
                  {status.circuitBreaker.state}
                  {status.circuitBreaker.failures > 0
                    ? ` (${status.circuitBreaker.failures} fails)`
                    : ''}
                </code>
              </li>
            </ul>
          ) : (
            <p className="muted">Could not load AI status</p>
          )}
          <button
            type="button"
            className="btn-ghost"
            style={{ marginTop: '0.75rem' }}
            onClick={() => void refreshStatus()}
            disabled={statusLoading}
          >
            Refresh status
          </button>
        </div>

        <div className="card highlight">
          <h3>Live SQL grounding</h3>
          {status?.snapshot ? (
            <ul className="stat-list">
              <li>
                <span>Orders</span>
                <strong>{status.snapshot.totalOrders}</strong>
              </li>
              <li>
                <span>Revenue</span>
                <strong>${status.snapshot.totalRevenue}</strong>
              </li>
              <li>
                <span>AOV</span>
                <strong>${status.snapshot.averageOrderValue ?? '—'}</strong>
              </li>
              <li>
                <span>Low stock SKUs</span>
                <strong>{status.snapshot.lowStockCount}</strong>
              </li>
              <li>
                <span>Sources</span>
                <code>{status.sources.join(', ')}</code>
              </li>
            </ul>
          ) : (
            <p className="muted">Snapshot loads with status</p>
          )}
          {status?.snapshot.topCategories?.length ? (
            <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}>
              Top category:{' '}
              <strong>{status.snapshot.topCategories[0]?.category}</strong> ($
              {status.snapshot.topCategories[0]?.revenue})
            </p>
          ) : null}
        </div>
      </div>

      <div className="ai-tabs">
        {(['enterprise', 'chat', 'summarize', 'recommend'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setTab(t)}
          >
            {t === 'enterprise'
              ? 'Enterprise'
              : t === 'chat'
                ? 'Chat'
                : t === 'summarize'
                  ? 'Summarize'
                  : 'Recommend'}
          </button>
        ))}
      </div>

      {meta && (
        <p className="muted ai-meta">
          Last response · Mode: <strong>{meta.mode}</strong> · Model: <code>{meta.model}</code>
          {meta.sources?.length ? ` · Sources: ${meta.sources.join(', ')}` : ''}
        </p>
      )}

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '1rem' }}>
          <p>{error}</p>
        </div>
      )}

      {tab === 'enterprise' && (
        <>
          <div className="ai-industry-grid">
            {INDUSTRIES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`ai-industry-card ${industry === item.id ? 'active' : ''}`}
                onClick={() => setIndustry(item.id)}
              >
                <strong>{item.label}</strong>
                <span className="muted">{item.blurb}</span>
              </button>
            ))}
          </div>

          <div className="card">
            <div className="ai-tabs" style={{ marginBottom: '0.75rem' }}>
              {(['briefing', 'risks', 'actions'] as EnterpriseView[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={enterpriseView === v ? 'btn-primary' : 'btn-ghost'}
                  onClick={() => setEnterpriseView(v)}
                >
                  {v === 'briefing' ? 'Executive briefing' : v === 'risks' ? 'Risk register' : 'Action plan'}
                </button>
              ))}
            </div>

            <label className="muted" htmlFor="ai-ent-focus">
              Focus (optional)
            </label>
            <input
              id="ai-ent-focus"
              value={enterpriseFocus}
              onChange={(e) => setEnterpriseFocus(e.target.value)}
              className="ai-focus-input"
              placeholder="e.g. inventory risk before promo"
            />

            <button
              type="button"
              className="btn-primary"
              disabled={loading}
              onClick={() => void runEnterprise()}
            >
              {loading
                ? 'Analyzing…'
                : enterpriseView === 'briefing'
                  ? 'Generate briefing'
                  : enterpriseView === 'risks'
                    ? 'Scan risks'
                    : 'Build action plan'}
            </button>
          </div>

          {briefing && (
            <div className="card ai-briefing">
              <h3>{briefing.headline}</h3>
              <p className="muted">{briefing.summary}</p>
              <div className="ai-kpi-grid">
                {briefing.kpis.map((k) => (
                  <div key={k.label} className="ai-kpi">
                    <span className="muted">{k.label}</span>
                    <strong>
                      {k.unit === 'USD' ? '$' : ''}
                      {k.value}
                    </strong>
                    {k.trendHint ? <small className="muted">{k.trendHint}</small> : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {riskList.length > 0 && (briefing || enterpriseRisks) && (
            <div className="card">
              <h3>Risk register</h3>
              <ul className="ai-risk-list">
                {riskList.map((r) => (
                  <li key={r.id}>
                    <div className="ai-risk-head">
                      <span className={`ai-severity ${r.severity}`}>{r.severity}</span>
                      <strong>{r.title}</strong>
                    </div>
                    <div className="muted">{r.category} · {r.evidence}</div>
                    <div>{r.recommendation}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {actionList.length > 0 && (briefing || enterpriseActions) && (
            <div className="card">
              <h3>Action plan</h3>
              <ol className="ai-action-list">
                {actionList.map((a) => (
                  <li key={a.id}>
                    <div className="ai-action-head">
                      <span className="ai-priority">P{a.priority}</span>
                      <strong>{a.title}</strong>
                    </div>
                    <div className="muted">
                      Owner: {a.owner} · {a.timeframe}
                    </div>
                    <div className="muted">{a.rationale}</div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}

      {tab === 'chat' && (
        <>
          <div className="card ai-chat-log">
            {messages.length === 0 && (
              <p className="muted">
                Ask a question — conversation history is sent for multi-turn context. Answers use
                the live snapshot above.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={`${m.role}-${i}`} className={`ai-bubble ${m.role}`}>
                <strong>{m.role === 'user' ? 'You' : 'AI'}</strong>
                <pre>{m.content}</pre>
              </div>
            ))}
          </div>

          <div className="card">
            <label className="muted" htmlFor="ai-context">
              Data context
            </label>
            <select
              id="ai-context"
              value={context}
              onChange={(e) => setContext(e.target.value as AiContext)}
              className="ai-select"
            >
              <option value="general">General</option>
              <option value="orders">Orders</option>
              <option value="products">Products</option>
            </select>

            <label htmlFor="ai-question" className="muted">
              Your question
            </label>
            <textarea
              id="ai-question"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void ask();
                }
              }}
              style={{ width: '100%', marginTop: '0.5rem' }}
            />
            <div className="ai-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="btn-ghost" onClick={() => setQuestion(s)}>
                  {s.slice(0, 40)}…
                </button>
              ))}
            </div>
            <div className="toolbar">
              <button type="button" className="btn-primary" onClick={() => void ask()} disabled={loading}>
                {loading ? 'Thinking…' : 'Ask AI'}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setMessages([]);
                  setMeta(null);
                }}
                disabled={loading || messages.length === 0}
              >
                Clear chat
              </button>
            </div>
          </div>
        </>
      )}

      {tab === 'summarize' && (
        <div className="card">
          <p className="muted">Generate an executive summary from live DB snapshots.</p>
          <div className="toolbar">
            <button
              type="button"
              className="btn-primary"
              disabled={loading}
              onClick={() => void runSummarize('orders')}
            >
              Summarize orders
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={loading}
              onClick={() => void runSummarize('products')}
            >
              Summarize products
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={loading}
              onClick={() => void runSummarize('catalog')}
            >
              Catalog overview
            </button>
          </div>
          {summary && <pre className="ai-answer">{summary.answer}</pre>}
        </div>
      )}

      {tab === 'recommend' && (
        <div className="card">
          <label className="muted" htmlFor="ai-focus">
            Focus (optional)
          </label>
          <input
            id="ai-focus"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            className="ai-focus-input"
          />
          <button
            type="button"
            className="btn-primary"
            disabled={loading}
            onClick={() => void runRecommend()}
          >
            {loading ? 'Thinking…' : 'Get recommendations'}
          </button>
          {recs && (
            <ul className="ai-rec-list">
              {recs.recommendations.map((r) => (
                <li key={r.productId}>
                  <strong>{r.name}</strong> · {r.category} · stock {r.stock}
                  <div className="muted">{r.reason}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
