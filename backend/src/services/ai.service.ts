import { BadRequestError } from '../utils/errors.js';
import {
  buildDemoAnswer,
  buildDemoRecommendations,
  buildDemoSummary,
  demoEnterpriseActions,
  demoEnterpriseBriefing,
  demoEnterpriseRisks,
} from './ai/ai-provider.js';
import { ENTERPRISE_INDUSTRIES } from './ai/industries.js';
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
  EnterpriseActionsRequest,
  EnterpriseActionsResponse,
  EnterpriseBriefingRequest,
  EnterpriseBriefingResponse,
  EnterpriseIndustry,
  EnterpriseRisksRequest,
  EnterpriseRisksResponse,
} from './ai/types.js';

export type {
  AiInsightRequest,
  AiInsightResponse,
  AiRecommendRequest,
  AiRecommendResponse,
  AiSummarizeRequest,
  ChatMessage,
  EnterpriseActionsRequest,
  EnterpriseActionsResponse,
  EnterpriseBriefingRequest,
  EnterpriseBriefingResponse,
  EnterpriseIndustry,
  EnterpriseRisksRequest,
  EnterpriseRisksResponse,
} from './ai/types.js';

function assertIndustry(industry: string): EnterpriseIndustry {
  if ((ENTERPRISE_INDUSTRIES as string[]).includes(industry)) {
    return industry as EnterpriseIndustry;
  }
  throw new BadRequestError(
    `Invalid industry. Expected one of: ${ENTERPRISE_INDUSTRIES.join(', ')}`
  );
}

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

/** Portfolio demo: provider mode, circuit state, and live DB grounding snapshot. */
export async function getAiStatus(context: AiContext = 'general') {
  const { features } = await import('../config/features.js');
  const { env } = await import('../config/env.js');
  const { aiCircuit } = await import('../lib/circuit-breaker.js');
  const provider = resolveAiProvider();
  const snapshot = await buildBusinessSnapshot(context);
  const sources = snapshotSources(context);

  return {
    enabled: features.aiInsights(),
    mode: provider.mode,
    provider: provider.name,
    model: provider.mode === 'openai' ? env.OPENAI_MODEL : 'rule-based-demo',
    circuitBreaker: features.circuitBreaker()
      ? aiCircuit.getStatus()
      : { name: 'openai', state: 'disabled' as const, failures: 0 },
    pipeline: [
      'Authenticate + RBAC (admin/manager)',
      'Build BusinessSnapshot from PostgreSQL',
      'Resolve provider (OpenAI if key set, else demo)',
      'Circuit breaker wraps OpenAI; falls back to demo on open',
      'Enterprise verticals: retail, supply_chain, finance, operations',
      'Return grounded answer + sources',
    ],
    industries: ENTERPRISE_INDUSTRIES,
    sources,
    snapshot,
    generatedAt: new Date().toISOString(),
  };
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

export async function enterpriseBriefing(
  req: EnterpriseBriefingRequest
): Promise<EnterpriseBriefingResponse> {
  const { features } = await import('../config/features.js');
  if (!features.aiInsights()) {
    throw new BadRequestError('AI insights feature is disabled');
  }

  const industry = assertIndustry(req.industry);
  const snapshot = await buildBusinessSnapshot('general');
  const sources = snapshotSources('general');
  const provider = resolveAiProvider();

  let result: EnterpriseBriefingResponse;
  if (provider.mode === 'openai') {
    result = await withCircuitFallback(
      () => provider.enterpriseBriefing(industry, snapshot, req.focus),
      async () => {
        const fallback = demoEnterpriseBriefing(industry, snapshot, req.focus);
        return {
          ...fallback,
          model: 'rule-based-demo-fallback',
          summary: `${fallback.summary} (OpenAI circuit open — fell back to demo mode)`,
        };
      }
    );
  } else {
    result = await provider.enterpriseBriefing(industry, snapshot, req.focus);
  }

  return { ...result, sources: result.sources.length ? result.sources : sources };
}

export async function enterpriseRisks(
  req: EnterpriseRisksRequest
): Promise<EnterpriseRisksResponse> {
  const { features } = await import('../config/features.js');
  if (!features.aiInsights()) {
    throw new BadRequestError('AI insights feature is disabled');
  }

  const industry = assertIndustry(req.industry);
  const limit = Math.min(Math.max(req.limit ?? 8, 1), 15);
  const snapshot = await buildBusinessSnapshot('general');
  const sources = snapshotSources('general');
  const provider = resolveAiProvider();

  let result: EnterpriseRisksResponse;
  if (provider.mode === 'openai') {
    result = await withCircuitFallback(
      () => provider.enterpriseRisks(industry, snapshot, limit),
      async () => ({
        ...demoEnterpriseRisks(industry, snapshot, limit),
        model: 'rule-based-demo-fallback',
      })
    );
  } else {
    result = await provider.enterpriseRisks(industry, snapshot, limit);
  }

  return { ...result, sources: result.sources.length ? result.sources : sources };
}

export async function enterpriseActions(
  req: EnterpriseActionsRequest
): Promise<EnterpriseActionsResponse> {
  const { features } = await import('../config/features.js');
  if (!features.aiInsights()) {
    throw new BadRequestError('AI insights feature is disabled');
  }

  const industry = assertIndustry(req.industry);
  const limit = Math.min(Math.max(req.limit ?? 5, 1), 10);
  const snapshot = await buildBusinessSnapshot('general');
  const sources = snapshotSources('general');
  const provider = resolveAiProvider();

  let result: EnterpriseActionsResponse;
  if (provider.mode === 'openai') {
    result = await withCircuitFallback(
      () => provider.enterpriseActions(industry, snapshot, limit, req.focus),
      async () => ({
        ...demoEnterpriseActions(industry, snapshot, limit, req.focus),
        model: 'rule-based-demo-fallback',
      })
    );
  } else {
    result = await provider.enterpriseActions(industry, snapshot, limit, req.focus);
  }

  return { ...result, sources: result.sources.length ? result.sources : sources };
}
