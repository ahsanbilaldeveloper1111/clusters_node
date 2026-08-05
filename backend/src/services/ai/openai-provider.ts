import { env } from '../../config/env.js';
import {
  buildDemoAnswer,
  buildDemoRecommendations,
  buildDemoSummary,
  demoEnterpriseActions,
  demoEnterpriseBriefing,
  demoEnterpriseRisks,
  type AiProvider,
} from './ai-provider.js';
import {
  buildEnterpriseActions,
  buildEnterpriseBriefing,
  buildEnterpriseRisks,
} from './enterprise.js';
import { getIndustryPlaybook } from './industries.js';
import { snapshotSources } from './snapshot.js';
import type {
  AiInsightRequest,
  AiInsightResponse,
  AiRecommendResponse,
  BusinessSnapshot,
  ChatMessage,
  EnterpriseActionItem,
  EnterpriseActionsResponse,
  EnterpriseBriefingResponse,
  EnterpriseIndustry,
  EnterpriseKpi,
  EnterpriseRiskItem,
  EnterpriseRisksResponse,
  RiskSeverity,
} from './types.js';

function stripJsonFence(raw: string): string {
  return raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
}

function isSeverity(v: unknown): v is RiskSeverity {
  return v === 'critical' || v === 'high' || v === 'medium' || v === 'low';
}

function parseRisks(raw: string, limit: number): EnterpriseRiskItem[] {
  const parsed = JSON.parse(stripJsonFence(raw)) as unknown;
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { risks?: unknown }).risks)
      ? (parsed as { risks: unknown[] }).risks
      : [];

  return list
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x, i) => ({
      id: String(x.id ?? `risk-${i + 1}`),
      title: String(x.title ?? ''),
      severity: isSeverity(x.severity) ? x.severity : 'medium',
      category: String(x.category ?? 'general'),
      evidence: String(x.evidence ?? ''),
      recommendation: String(x.recommendation ?? ''),
    }))
    .filter((x) => x.title)
    .slice(0, limit);
}

function parseActions(raw: string, limit: number): EnterpriseActionItem[] {
  const parsed = JSON.parse(stripJsonFence(raw)) as unknown;
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { actions?: unknown }).actions)
      ? (parsed as { actions: unknown[] }).actions
      : [];

  return list
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x, i) => ({
      id: String(x.id ?? `act-${i + 1}`),
      priority: Number(x.priority ?? i + 1),
      owner: String(x.owner ?? 'Ops'),
      title: String(x.title ?? ''),
      rationale: String(x.rationale ?? ''),
      timeframe: String(x.timeframe ?? 'This week'),
    }))
    .filter((x) => x.title)
    .slice(0, limit);
}

function parseBriefing(
  raw: string,
  industry: EnterpriseIndustry,
  snapshot: BusinessSnapshot,
  focus?: string
): Omit<EnterpriseBriefingResponse, 'mode' | 'model' | 'sources' | 'generatedAt'> {
  const fallback = buildEnterpriseBriefing(industry, snapshot, focus);
  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as Record<string, unknown>;
    const kpis = Array.isArray(parsed.kpis)
      ? (parsed.kpis as Record<string, unknown>[])
          .filter((x) => x && typeof x === 'object')
          .map(
            (x): EnterpriseKpi => ({
              label: String(x.label ?? ''),
              value: String(x.value ?? ''),
              unit: x.unit != null ? String(x.unit) : undefined,
              trendHint: x.trendHint != null ? String(x.trendHint) : undefined,
            })
          )
          .filter((x) => x.label)
      : fallback.kpis;

    const risksParsed = Array.isArray(parsed.risks)
      ? parseRisks(JSON.stringify(parsed.risks), 5)
      : [];
    const actionsParsed = Array.isArray(parsed.actions)
      ? parseActions(JSON.stringify(parsed.actions), 5)
      : [];

    return {
      industry,
      headline: String(parsed.headline ?? fallback.headline),
      summary: String(parsed.summary ?? fallback.summary),
      kpis: kpis.length ? kpis : fallback.kpis,
      risks: risksParsed.length ? risksParsed : fallback.risks,
      actions: actionsParsed.length ? actionsParsed : fallback.actions,
    };
  } catch {
    return fallback;
  }
}

export class DemoAiProvider implements AiProvider {
  readonly name = 'demo';
  readonly mode = 'demo' as const;

  async chat(
    req: AiInsightRequest,
    snapshot: BusinessSnapshot,
    _history: ChatMessage[]
  ): Promise<AiInsightResponse> {
    return {
      answer: buildDemoAnswer(req.question, snapshot),
      mode: 'demo',
      model: 'rule-based-demo',
      sources: [],
      generatedAt: new Date().toISOString(),
      context: snapshot.context,
    };
  }

  async summarize(target: string, snapshot: BusinessSnapshot): Promise<AiInsightResponse> {
    return {
      answer: buildDemoSummary(target, snapshot),
      mode: 'demo',
      model: 'rule-based-demo',
      sources: [],
      generatedAt: new Date().toISOString(),
      context: snapshot.context,
    };
  }

  async recommend(
    snapshot: BusinessSnapshot,
    limit: number,
    focus?: string
  ): Promise<AiRecommendResponse> {
    return {
      recommendations: buildDemoRecommendations(snapshot, limit, focus),
      mode: 'demo',
      model: 'rule-based-demo',
      generatedAt: new Date().toISOString(),
    };
  }

  async enterpriseBriefing(
    industry: EnterpriseIndustry,
    snapshot: BusinessSnapshot,
    focus?: string
  ): Promise<EnterpriseBriefingResponse> {
    return demoEnterpriseBriefing(industry, snapshot, focus);
  }

  async enterpriseRisks(
    industry: EnterpriseIndustry,
    snapshot: BusinessSnapshot,
    limit: number
  ): Promise<EnterpriseRisksResponse> {
    return demoEnterpriseRisks(industry, snapshot, limit);
  }

  async enterpriseActions(
    industry: EnterpriseIndustry,
    snapshot: BusinessSnapshot,
    limit: number,
    focus?: string
  ): Promise<EnterpriseActionsResponse> {
    return demoEnterpriseActions(industry, snapshot, limit, focus);
  }
}

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  readonly mode = 'openai' as const;

  private async complete(messages: ChatMessage[], maxTokens = 700): Promise<string> {
    const { BadRequestError } = await import('../../utils/errors.js');
    const res = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new BadRequestError(`AI provider error: ${res.status} ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) throw new BadRequestError('Empty AI response');
    return content;
  }

  async chat(
    req: AiInsightRequest,
    snapshot: BusinessSnapshot,
    history: ChatMessage[]
  ): Promise<AiInsightResponse> {
    const system: ChatMessage = {
      role: 'system',
      content:
        'You are an enterprise commerce analyst for this Node/TypeScript app. ' +
        'Answer concisely using ONLY the provided business JSON. If data is insufficient, say so. ' +
        'Do not invent numbers. Prefer short bullet insights.',
    };

    const grounded: ChatMessage = {
      role: 'user',
      content: `Business data JSON (context=${snapshot.context}):\n${JSON.stringify(snapshot, null, 2)}`,
    };

    const prior = history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-10);

    const messages: ChatMessage[] = [
      system,
      grounded,
      ...prior,
      { role: 'user', content: req.question },
    ];

    const answer = await this.complete(messages);
    return {
      answer,
      mode: 'openai',
      model: env.OPENAI_MODEL,
      sources: [],
      generatedAt: new Date().toISOString(),
      context: snapshot.context,
    };
  }

  async summarize(target: string, snapshot: BusinessSnapshot): Promise<AiInsightResponse> {
    const answer = await this.complete([
      {
        role: 'system',
        content:
          'Summarize the commerce data for an executive. Use only provided JSON. Max 8 bullets.',
      },
      {
        role: 'user',
        content: `Summarize target="${target}" from:\n${JSON.stringify(snapshot, null, 2)}`,
      },
    ]);
    return {
      answer,
      mode: 'openai',
      model: env.OPENAI_MODEL,
      sources: [],
      generatedAt: new Date().toISOString(),
      context: snapshot.context,
    };
  }

  async recommend(
    snapshot: BusinessSnapshot,
    limit: number,
    focus?: string
  ): Promise<AiRecommendResponse> {
    const { BadRequestError } = await import('../../utils/errors.js');
    const raw = await this.complete(
      [
        {
          role: 'system',
          content:
            'Return ONLY valid JSON array of recommendations. Each item: ' +
            '{"productId":"uuid","name":"string","category":"string","stock":number,"reason":"string"}. ' +
            'Use only products present in the data. No markdown.',
        },
        {
          role: 'user',
          content: `Recommend up to ${limit} products${focus ? ` focused on: ${focus}` : ''}.\nData:\n${JSON.stringify(snapshot, null, 2)}`,
        },
      ],
      800
    );

    let recommendations: AiRecommendResponse['recommendations'] = [];
    try {
      const cleaned = stripJsonFence(raw);
      const parsed = JSON.parse(cleaned) as unknown;
      if (Array.isArray(parsed)) {
        recommendations = parsed
          .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
          .map((x) => ({
            productId: String(x.productId ?? x.id ?? ''),
            name: String(x.name ?? ''),
            category: String(x.category ?? ''),
            stock: Number(x.stock ?? 0),
            reason: String(x.reason ?? ''),
          }))
          .filter((x) => x.productId && x.name)
          .slice(0, limit);
      }
    } catch {
      throw new BadRequestError('AI returned invalid recommendation JSON');
    }

    if (recommendations.length === 0) {
      recommendations = buildDemoRecommendations(snapshot, limit, focus);
    }

    return {
      recommendations,
      mode: 'openai',
      model: env.OPENAI_MODEL,
      generatedAt: new Date().toISOString(),
    };
  }

  async enterpriseBriefing(
    industry: EnterpriseIndustry,
    snapshot: BusinessSnapshot,
    focus?: string
  ): Promise<EnterpriseBriefingResponse> {
    const playbook = getIndustryPlaybook(industry);
    const raw = await this.complete(
      [
        {
          role: 'system',
          content:
            `You are briefing a ${playbook.persona} in ${playbook.label}. ${playbook.systemPromptExtra} ` +
            'Use ONLY the provided business JSON. Do not invent numbers. ' +
            'Return ONLY valid JSON object with keys: headline, summary, kpis, risks, actions. ' +
            'kpis: [{label,value,unit?,trendHint?}]. ' +
            'risks: [{id,title,severity(critical|high|medium|low),category,evidence,recommendation}]. ' +
            'actions: [{id,priority,owner,title,rationale,timeframe}]. No markdown.',
        },
        {
          role: 'user',
          content: `Industry=${industry}. Focus areas=${playbook.focusAreas.join(', ')}.${
            focus ? ` Extra focus: ${focus}.` : ''
          }\nData:\n${JSON.stringify(snapshot, null, 2)}`,
        },
      ],
      1200
    );

    const parsed = parseBriefing(raw, industry, snapshot, focus);
    return {
      ...parsed,
      mode: 'openai',
      model: env.OPENAI_MODEL,
      sources: snapshotSources('general'),
      generatedAt: new Date().toISOString(),
    };
  }

  async enterpriseRisks(
    industry: EnterpriseIndustry,
    snapshot: BusinessSnapshot,
    limit: number
  ): Promise<EnterpriseRisksResponse> {
    const playbook = getIndustryPlaybook(industry);
    const raw = await this.complete(
      [
        {
          role: 'system',
          content:
            `You are a ${playbook.persona} risk analyst for ${playbook.label}. ${playbook.systemPromptExtra} ` +
            'Return ONLY a JSON array of risks: ' +
            '[{id,title,severity(critical|high|medium|low),category,evidence,recommendation}]. ' +
            'Use only evidence from the JSON. No markdown.',
        },
        {
          role: 'user',
          content: `Produce up to ${limit} risks for industry=${industry}.\nData:\n${JSON.stringify(snapshot, null, 2)}`,
        },
      ],
      900
    );

    let risks: EnterpriseRiskItem[] = [];
    try {
      risks = parseRisks(raw, limit);
    } catch {
      risks = buildEnterpriseRisks(industry, snapshot, limit);
    }
    if (!risks.length) risks = buildEnterpriseRisks(industry, snapshot, limit);

    return {
      industry,
      risks,
      mode: 'openai',
      model: env.OPENAI_MODEL,
      sources: snapshotSources('general'),
      generatedAt: new Date().toISOString(),
    };
  }

  async enterpriseActions(
    industry: EnterpriseIndustry,
    snapshot: BusinessSnapshot,
    limit: number,
    focus?: string
  ): Promise<EnterpriseActionsResponse> {
    const playbook = getIndustryPlaybook(industry);
    const raw = await this.complete(
      [
        {
          role: 'system',
          content:
            `You build an action plan for a ${playbook.persona} in ${playbook.label}. ${playbook.systemPromptExtra} ` +
            'Return ONLY a JSON array: [{id,priority,owner,title,rationale,timeframe}]. ' +
            `Prefer owners from: ${Object.values(playbook.owners).join(', ')}. No markdown.`,
        },
        {
          role: 'user',
          content: `Up to ${limit} actions for industry=${industry}${focus ? `, focus=${focus}` : ''}.\nData:\n${JSON.stringify(snapshot, null, 2)}`,
        },
      ],
      900
    );

    let actions: EnterpriseActionItem[] = [];
    try {
      actions = parseActions(raw, limit);
    } catch {
      actions = buildEnterpriseActions(industry, snapshot, limit, focus);
    }
    if (!actions.length) actions = buildEnterpriseActions(industry, snapshot, limit, focus);

    return {
      industry,
      actions,
      mode: 'openai',
      model: env.OPENAI_MODEL,
      sources: snapshotSources('general'),
      generatedAt: new Date().toISOString(),
    };
  }
}

/** Factory — picks OpenAI when key is set, otherwise demo. */
export function resolveAiProvider(): AiProvider {
  if (env.OPENAI_API_KEY) return new OpenAiProvider();
  return new DemoAiProvider();
}
