import { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { createApiClient } from '../services/api.client.js';

type AiContext = 'orders' | 'products' | 'general';
type Tab = 'chat' | 'summarize' | 'recommend';

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

const SUGGESTIONS = [
  'What is our total revenue and order count?',
  'Which product categories drive the most sales?',
  'Do we have low stock inventory risks?',
];

export default function AiAssistantPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<Tab>('chat');
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

  return (
    <div className="page">
      <header className="page-header">
        <h1>AI Business Assistant</h1>
        <p>
          LLM grounded in live SQL data. Works in <strong>demo</strong> mode without a key; set{' '}
          <code>OPENAI_API_KEY</code> for real OpenAI answers (with circuit-breaker fallback).
        </p>
      </header>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {(['chat', 'summarize', 'recommend'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? 'btn-primary' : 'btn-ghost'}
            onClick={() => setTab(t)}
          >
            {t === 'chat' ? 'Chat' : t === 'summarize' ? 'Summarize' : 'Recommend'}
          </button>
        ))}
      </div>

      {meta && (
        <p className="muted" style={{ marginBottom: '0.75rem' }}>
          Mode: <strong>{meta.mode}</strong> · Model: <code>{meta.model}</code>
          {meta.sources?.length ? ` · Sources: ${meta.sources.join(', ')}` : ''}
        </p>
      )}

      {error && (
        <div className="card" style={{ borderColor: 'var(--warn)', marginBottom: '1rem' }}>
          <p>{error}</p>
        </div>
      )}

      {tab === 'chat' && (
        <>
          <div className="card" style={{ marginBottom: '1rem', minHeight: 220 }}>
            {messages.length === 0 && (
              <p className="muted">Ask a question — conversation history is sent for multi-turn context.</p>
            )}
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                style={{
                  marginBottom: '0.75rem',
                  padding: '0.75rem',
                  borderRadius: 8,
                  background: m.role === 'user' ? 'rgba(0,0,0,0.04)' : 'rgba(0,80,40,0.06)',
                }}
              >
                <strong>{m.role === 'user' ? 'You' : 'AI'}</strong>
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '0.35rem 0 0' }}>
                  {m.content}
                </pre>
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
              style={{ display: 'block', margin: '0.35rem 0 0.75rem', maxWidth: 240 }}
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
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="btn-ghost" onClick={() => setQuestion(s)}>
                  {s.slice(0, 36)}…
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
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
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.75rem 0' }}>
            <button type="button" className="btn-primary" disabled={loading} onClick={() => void runSummarize('orders')}>
              Summarize orders
            </button>
            <button type="button" className="btn-primary" disabled={loading} onClick={() => void runSummarize('products')}>
              Summarize products
            </button>
            <button type="button" className="btn-ghost" disabled={loading} onClick={() => void runSummarize('catalog')}>
              Catalog overview
            </button>
          </div>
          {summary && (
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{summary.answer}</pre>
          )}
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
            style={{ display: 'block', width: '100%', maxWidth: 360, margin: '0.35rem 0 0.75rem' }}
          />
          <button type="button" className="btn-primary" disabled={loading} onClick={() => void runRecommend()}>
            {loading ? 'Thinking…' : 'Get recommendations'}
          </button>
          {recs && (
            <ul style={{ marginTop: '1rem', paddingLeft: '1.2rem' }}>
              {recs.recommendations.map((r) => (
                <li key={r.productId} style={{ marginBottom: '0.75rem' }}>
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
