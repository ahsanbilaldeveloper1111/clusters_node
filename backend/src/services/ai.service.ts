import { BadRequestError } from '../utils/errors.js';
import { buildDemoAnswer, buildDemoRecommendations, buildDemoSummary } from './ai/ai-provider.js';
import { resolveAiProvider } from './ai/openai-provider.js';
import { buildBusinessSnapshot, snapshotSources } from './ai/snapshot.js';
import type {
  AiContext,
  AiInsightRequest,
  AiInsightResponse,
  AiRecommendRequest,
  AiRecommendResponse,
  AiSummarizeRequest,
  ChatMessage,
} from './ai/types.js';

export type {
  AiInsightRequest,
  AiInsightResponse,
  AiRecommendRequest,
  AiRecommendResponse,
  AiSummarizeRequest,
  ChatMessage,
} from './ai/types.js';

function normalizeHistory(history?: ChatMessage[]): ChatMessage[] {
  if (!history?.length) return [];
  return history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role,
      content: String(m.content ?? '').slice(0, 2000),
    }))
    .slice(-10);
}

async function withCircuitFallback<T>(
  run: () => Promise<T>,
  fallback: () => T | Promise<T>
): Promise<T> {
  const { features } = await import('../config/features.js');
  const { aiCircuit, CircuitOpenError } = await import('../lib/circuit-breaker.js');

  try {
    if (features.circuitBreaker()) {
      return await aiCircuit.exec(run);
    }
    return await run();
  } catch (e) {
    if (e instanceof CircuitOpenError) {
      return await fallback();
    }
    throw e;
  }
}

export async function generateInsight(req: AiInsightRequest): Promise<AiInsightResponse> {
  const question = req.question.trim();
  if (question.length < 3) throw new BadRequestError('Question must be at least 3 characters');
  if (question.length > 2000) throw new BadRequestError('Question too long (max 2000 chars)');

  const { features } = await import('../config/features.js');
  if (!features.aiInsights()) {
    throw new BadRequestError('AI insights feature is disabled');
  }

  const context: AiContext = req.context ?? 'general';
  const history = normalizeHistory(req.history);
  const snapshot = await buildBusinessSnapshot(context);
  const sources = snapshotSources(context);
  const provider = resolveAiProvider();

  let result: AiInsightResponse;

  if (provider.mode === 'openai') {
    result = await withCircuitFallback(
      () => provider.chat(req, snapshot, history),
      async () => ({
        answer: `${buildDemoAnswer(question, snapshot)}\n\n_(OpenAI circuit open — fell back to demo mode)_`,
        mode: 'demo' as const,
        model: 'rule-based-demo-fallback',
        sources,
        generatedAt: new Date().toISOString(),
        context,
      })
    );
  } else {
    result = await provider.chat(req, snapshot, history);
  }

  result = { ...result, sources: result.sources.length ? result.sources : sources, context };

  if (features.domainEvents()) {
    const { eventBus } = await import('../events/event-bus.js');
    eventBus.emit({
      type: 'AiInsightGenerated',
      mode: result.mode,
      questionLength: question.length,
    });
  }

  return result;
}

export async function summarizeBusiness(req: AiSummarizeRequest): Promise<AiInsightResponse> {
  const { features } = await import('../config/features.js');
  if (!features.aiInsights()) {
    throw new BadRequestError('AI insights feature is disabled');
  }

  const context: AiContext =
    req.target === 'orders' ? 'orders' : req.target === 'products' || req.target === 'catalog' ? 'products' : 'general';
  const snapshot = await buildBusinessSnapshot(context);
  const sources = snapshotSources(context);
  const provider = resolveAiProvider();

  let result: AiInsightResponse;
  if (provider.mode === 'openai') {
    result = await withCircuitFallback(
      () => provider.summarize(req.target, snapshot),
      async () => ({
        answer: `${buildDemoSummary(req.target, snapshot)}\n\n_(OpenAI circuit open — fell back to demo mode)_`,
        mode: 'demo' as const,
        model: 'rule-based-demo-fallback',
        sources,
        generatedAt: new Date().toISOString(),
        context,
      })
    );
  } else {
    result = await provider.summarize(req.target, snapshot);
  }

  return { ...result, sources: result.sources.length ? result.sources : sources, context };
}

export async function recommendProducts(req: AiRecommendRequest): Promise<AiRecommendResponse> {
  const { features } = await import('../config/features.js');
  if (!features.aiInsights()) {
    throw new BadRequestError('AI insights feature is disabled');
  }

  const limit = Math.min(Math.max(req.limit ?? 5, 1), 10);
  const snapshot = await buildBusinessSnapshot('products');
  const provider = resolveAiProvider();

  if (provider.mode === 'openai') {
    return withCircuitFallback(
      () => provider.recommend(snapshot, limit, req.focus),
      async () => ({
        recommendations: buildDemoRecommendations(snapshot, limit, req.focus),
        mode: 'demo' as const,
        model: 'rule-based-demo-fallback',
        generatedAt: new Date().toISOString(),
      })
    );
  }

  return provider.recommend(snapshot, limit, req.focus);
}
