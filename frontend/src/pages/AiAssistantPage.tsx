import { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { createApiClient } from '../services/api.client.js';

interface AiInsight {
  answer: string;
  mode: 'openai' | 'demo';
  model: string;
  sources: string[];
  generatedAt: string;
}

const SUGGESTIONS = [
  'What is our total revenue and order count?',
  'Which product categories drive the most sales?',
  'Do we have low stock inventory risks?',
];

export default function AiAssistantPage() {
  const { token } = useAuth();
  const [question, setQuestion] = useState(SUGGESTIONS[0] ?? '');
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState<AiInsight | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const client = createApiClient(token);
      const data = await client.post<AiInsight>('/ai/insights', {
        question,
        context: 'general',
      });
      setInsight(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
      setInsight(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>AI Business Assistant</h1>
        <p>
          Answers grounded in live orders and product data. Set <code>OPENAI_API_KEY</code> on the
          API for real LLM mode; otherwise demo mode uses SQL analytics.
        </p>
      </header>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <label htmlFor="ai-question" className="muted">
          Your question
        </label>
        <textarea
          id="ai-question"
          rows={4}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          style={{ width: '100%', marginTop: '0.5rem' }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="btn-ghost" onClick={() => setQuestion(s)}>
              {s.slice(0, 36)}…
            </button>
          ))}
        </div>
        <button type="button" className="btn-primary" onClick={() => void ask()} disabled={loading}>
          {loading ? 'Thinking…' : 'Ask AI'}
        </button>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--warn)' }}>
          <p>{error}</p>
        </div>
      )}

      {insight && (
        <div className="card highlight">
          <p className="muted">
            Mode: <strong>{insight.mode}</strong> · Model: <code>{insight.model}</code>
          </p>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{insight.answer}</pre>
          <p className="muted" style={{ marginTop: '1rem' }}>
            Sources: {insight.sources.join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}
