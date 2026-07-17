import { env } from '../config/env.js';
import { getSalesByCategory } from '../database/queries/analytics.queries.js';
import { query } from '../database/pool.js';
import { BadRequestError } from '../utils/errors.js';

export interface AiInsightRequest {
  question: string;
  context?: 'orders' | 'products' | 'general';
}

export interface AiInsightResponse {
  answer: string;
  mode: 'openai' | 'demo';
  model: string;
  sources: string[];
  generatedAt: string;
}

interface BusinessSnapshot {
  totalOrders: number;
  totalRevenue: string;
  topCategories: { category: string; revenue: string; order_count: number }[];
  lowStockCount: number;
}

async function buildBusinessSnapshot(): Promise<BusinessSnapshot> {
  const [{ rows: orderStats }, salesByCategory, { rows: stockRows }] = await Promise.all([
    query<{ total_orders: string; total_revenue: string }>(`
      SELECT COUNT(*)::text AS total_orders,
             COALESCE(SUM(total_amount), 0)::text AS total_revenue
      FROM orders WHERE status NOT IN ('cancelled')
    `),
    getSalesByCategory(),
    query<{ low_stock: string }>(`
      SELECT COUNT(*)::text AS low_stock FROM products WHERE stock < 10
    `),
  ]);

  return {
    totalOrders: Number(orderStats[0]?.total_orders ?? 0),
    totalRevenue: orderStats[0]?.total_revenue ?? '0',
    topCategories: salesByCategory.slice(0, 5).map((c) => ({
      category: c.category,
      revenue: c.revenue,
      order_count: c.order_count,
    })),
    lowStockCount: Number(stockRows[0]?.low_stock ?? 0),
  };
}

function buildDemoAnswer(question: string, snapshot: BusinessSnapshot): string {
  const q = question.toLowerCase();
  const lines: string[] = [
    `**Business snapshot** (demo mode — no API key required)`,
    `- Orders: ${snapshot.totalOrders}`,
    `- Revenue: $${snapshot.totalRevenue}`,
    `- Low-stock SKUs (<10): ${snapshot.lowStockCount}`,
  ];

  if (snapshot.topCategories.length > 0) {
    lines.push('- Top categories by revenue:');
    for (const c of snapshot.topCategories) {
      lines.push(`  - ${c.category}: $${c.revenue} (${c.order_count} orders)`);
    }
  }

  if (q.includes('stock') || q.includes('inventory')) {
    lines.push(
      '',
      `**Insight:** ${snapshot.lowStockCount} product(s) are below the low-stock threshold. Consider a replenishment run for high-velocity categories.`
    );
  } else if (q.includes('revenue') || q.includes('sales')) {
    const top = snapshot.topCategories[0];
    lines.push(
      '',
      top
        ? `**Insight:** "${top.category}" leads revenue at $${top.revenue}. Focus promotions or inventory on this category.`
        : '**Insight:** No category revenue data yet — seed orders to unlock richer analytics.'
    );
  } else {
    lines.push(
      '',
      '**Insight:** Ask about revenue, stock, or top categories. Set `OPENAI_API_KEY` for live LLM answers grounded in this data.'
    );
  }

  return lines.join('\n');
}

async function callOpenAi(question: string, snapshot: BusinessSnapshot): Promise<string> {
  const systemPrompt = `You are an enterprise commerce analyst. Answer concisely using ONLY the provided business data. If data is insufficient, say so. Do not invent numbers.`;

  const userPrompt = `Business data JSON:
${JSON.stringify(snapshot, null, 2)}

User question: ${question}`;

  const res = await fetch(`${env.OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      temperature: 0.2,
      max_tokens: 600,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
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

export async function generateInsight(req: AiInsightRequest): Promise<AiInsightResponse> {
  const question = req.question.trim();
  if (question.length < 3) throw new BadRequestError('Question must be at least 3 characters');
  if (question.length > 2000) throw new BadRequestError('Question too long (max 2000 chars)');

  const { features } = await import('../config/features.js');
  if (!features.aiInsights()) {
    throw new BadRequestError('AI insights feature is disabled');
  }

  const snapshot = await buildBusinessSnapshot();
  const sources = ['orders', 'order_items', 'products', 'analytics.queries'];
  const { eventBus } = await import('../events/event-bus.js');
  const { aiCircuit, CircuitOpenError } = await import('../lib/circuit-breaker.js');

  let result: AiInsightResponse;

  if (env.OPENAI_API_KEY) {
    try {
      const call = () => callOpenAi(question, snapshot);
      const answer = features.circuitBreaker()
        ? await aiCircuit.exec(call)
        : await call();
      result = {
        answer,
        mode: 'openai',
        model: env.OPENAI_MODEL,
        sources,
        generatedAt: new Date().toISOString(),
      };
    } catch (e) {
      if (e instanceof CircuitOpenError) {
        result = {
          answer: `${buildDemoAnswer(question, snapshot)}\n\n_(OpenAI circuit open — fell back to demo mode)_`,
          mode: 'demo',
          model: 'rule-based-demo-fallback',
          sources,
          generatedAt: new Date().toISOString(),
        };
      } else {
        throw e;
      }
    }
  } else {
    result = {
      answer: buildDemoAnswer(question, snapshot),
      mode: 'demo',
      model: 'rule-based-demo',
      sources,
      generatedAt: new Date().toISOString(),
    };
  }

  if (features.domainEvents()) {
    eventBus.emit({
      type: 'AiInsightGenerated',
      mode: result.mode,
      questionLength: question.length,
    });
  }

  return result;
}
