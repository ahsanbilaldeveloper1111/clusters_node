import type {
  AiInsightRequest,
  AiInsightResponse,
  AiRecommendResponse,
  BusinessSnapshot,
  ChatMessage,
  ProductRecommendation,
} from './types.js';

export interface AiProvider {
  readonly name: string;
  readonly mode: 'openai' | 'demo';
  chat(
    req: AiInsightRequest,
    snapshot: BusinessSnapshot,
    history: ChatMessage[]
  ): Promise<AiInsightResponse>;
  summarize(target: string, snapshot: BusinessSnapshot): Promise<AiInsightResponse>;
  recommend(snapshot: BusinessSnapshot, limit: number, focus?: string): Promise<AiRecommendResponse>;
}

export function buildDemoAnswer(question: string, snapshot: BusinessSnapshot): string {
  const q = question.toLowerCase();
  const lines: string[] = [
    `**Business snapshot** (demo mode — no API key required)`,
    `- Context: ${snapshot.context}`,
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

export function buildDemoSummary(target: string, snapshot: BusinessSnapshot): string {
  if (target === 'orders') {
    const recent = snapshot.recentOrders ?? [];
    return [
      `**Orders summary** (demo)`,
      `- Total orders: ${snapshot.totalOrders}`,
      `- Revenue: $${snapshot.totalRevenue}`,
      `- Recent: ${recent.length} shown`,
      ...recent.slice(0, 5).map((o) => `  - ${o.id.slice(0, 8)}… ${o.status} $${o.total}`),
    ].join('\n');
  }

  if (target === 'products' || target === 'catalog') {
    const low = snapshot.lowStockProducts ?? [];
    return [
      `**Catalog summary** (demo)`,
      `- Low-stock SKUs: ${snapshot.lowStockCount}`,
      `- Top categories: ${snapshot.topCategories.map((c) => c.category).join(', ') || 'n/a'}`,
      ...low.slice(0, 5).map((p) => `  - ${p.name} (${p.category}) stock=${p.stock}`),
    ].join('\n');
  }

  return buildDemoAnswer('Summarize business performance', snapshot);
}

export function buildDemoRecommendations(
  snapshot: BusinessSnapshot,
  limit: number,
  focus?: string
): ProductRecommendation[] {
  const pool = [
    ...(snapshot.lowStockProducts ?? []).map((p) => ({
      productId: p.id,
      name: p.name,
      category: p.category,
      stock: p.stock,
      reason: focus
        ? `Low stock — prioritize for "${focus}"`
        : 'Low stock — replenish to avoid lost sales',
    })),
    ...(snapshot.topProducts ?? []).map((p) => ({
      productId: p.id,
      name: p.name,
      category: p.category,
      stock: p.stock,
      reason: 'High stock / catalog visibility candidate',
    })),
  ];

  const seen = new Set<string>();
  const out: ProductRecommendation[] = [];
  for (const item of pool) {
    if (seen.has(item.productId)) continue;
    seen.add(item.productId);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
