import { env } from '../../config/env.js';
import {
  buildDemoAnswer,
  buildDemoRecommendations,
  buildDemoSummary,
  type AiProvider,
} from './ai-provider.js';
import type {
  AiInsightRequest,
  AiInsightResponse,
  AiRecommendResponse,
  BusinessSnapshot,
  ChatMessage,
} from './types.js';

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
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
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
}

/** Factory — picks OpenAI when key is set, otherwise demo. */
export function resolveAiProvider(): AiProvider {
  if (env.OPENAI_API_KEY) return new OpenAiProvider();
  return new DemoAiProvider();
}
