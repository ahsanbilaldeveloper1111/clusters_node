export type AiContext = 'orders' | 'products' | 'general';

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

export interface BusinessSnapshot {
  context: AiContext;
  totalOrders: number;
  totalRevenue: string;
  topCategories: { category: string; revenue: string; order_count: number }[];
  lowStockCount: number;
  recentOrders?: { id: string; status: string; total: string; created_at: string }[];
  topProducts?: { id: string; name: string; category: string; stock: number; price: string }[];
  lowStockProducts?: { id: string; name: string; category: string; stock: number }[];
}
