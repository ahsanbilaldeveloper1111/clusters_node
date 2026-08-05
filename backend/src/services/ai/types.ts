export type AiContext = 'orders' | 'products' | 'general';

/** Enterprise verticals grounded in the same commerce snapshot. */
export type EnterpriseIndustry = 'retail' | 'supply_chain' | 'finance' | 'operations';

export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface AiInsightRequest {
  question: string;
  context?: AiContext;
  /** Prior turns for multi-turn chat (max 10 kept server-side). */
  history?: ChatMessage[];
}

export interface AiInsightResponse {
  answer: string;
  mode: 'openai' | 'demo';
  model: string;
  sources: string[];
  generatedAt: string;
  context: AiContext;
}

export interface AiSummarizeRequest {
  target: 'orders' | 'products' | 'catalog';
}

export interface AiRecommendRequest {
  limit?: number;
  focus?: string;
}

export interface ProductRecommendation {
  productId: string;
  name: string;
  category: string;
  stock: number;
  reason: string;
}

export interface AiRecommendResponse {
  recommendations: ProductRecommendation[];
  mode: 'openai' | 'demo';
  model: string;
  generatedAt: string;
}

export interface EnterpriseBriefingRequest {
  industry: EnterpriseIndustry;
  /** Optional focus area, e.g. "Q3 inventory risk". */
  focus?: string;
}

export interface EnterpriseRisksRequest {
  industry: EnterpriseIndustry;
  limit?: number;
}

export interface EnterpriseActionsRequest {
  industry: EnterpriseIndustry;
  limit?: number;
  focus?: string;
}

export interface EnterpriseKpi {
  label: string;
  value: string;
  unit?: string;
  trendHint?: string;
}

export interface EnterpriseRiskItem {
  id: string;
  title: string;
  severity: RiskSeverity;
  category: string;
  evidence: string;
  recommendation: string;
}

export interface EnterpriseActionItem {
  id: string;
  priority: number;
  owner: string;
  title: string;
  rationale: string;
  timeframe: string;
}

export interface EnterpriseBriefingResponse {
  industry: EnterpriseIndustry;
  headline: string;
  summary: string;
  kpis: EnterpriseKpi[];
  risks: EnterpriseRiskItem[];
  actions: EnterpriseActionItem[];
  mode: 'openai' | 'demo';
  model: string;
  sources: string[];
  generatedAt: string;
}

export interface EnterpriseRisksResponse {
  industry: EnterpriseIndustry;
  risks: EnterpriseRiskItem[];
  mode: 'openai' | 'demo';
  model: string;
  sources: string[];
  generatedAt: string;
}

export interface EnterpriseActionsResponse {
  industry: EnterpriseIndustry;
  actions: EnterpriseActionItem[];
  mode: 'openai' | 'demo';
  model: string;
  sources: string[];
  generatedAt: string;
}

export interface BusinessSnapshot {
  context: AiContext;
  totalOrders: number;
  totalRevenue: string;
  topCategories: { category: string; revenue: string; order_count: number }[];
  lowStockCount: number;
  /** Orders grouped by status for ops / finance risk scoring. */
  ordersByStatus?: { status: string; count: number }[];
  averageOrderValue?: string;
  productCount?: number;
  recentOrders?: { id: string; status: string; total: string; created_at: string }[];
  topProducts?: { id: string; name: string; category: string; stock: number; price: string }[];
  lowStockProducts?: { id: string; name: string; category: string; stock: number }[];
}
