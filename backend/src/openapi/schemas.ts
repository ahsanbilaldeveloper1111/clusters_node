/**
 * Zod + OpenAPI — schemas are the single source of truth.
 * Routes parse with these schemas; Swagger is generated from them.
 */
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const loginSchema = z
  .object({
    email: z.string().email().openapi({ example: 'admin@enterprise.local' }),
    password: z.string().min(8).openapi({ example: 'Password123!' }),
  })
  .openapi('LoginRequest');

export const registerSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(10).max(128),
    fullName: z.string().min(2).max(200),
  })
  .openapi('RegisterRequest');

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(20),
  })
  .openapi('RefreshRequest');

export const authUserSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    fullName: z.string(),
    role: z.enum(['admin', 'manager', 'customer']),
  })
  .openapi('AuthUser');

export const authResultSchema = z
  .object({
    token: z.string(),
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.string(),
    user: authUserSchema,
  })
  .openapi('AuthResult');

export const createProductSchema = z
  .object({
    sku: z.string().min(2).max(50),
    name: z.string().min(2).max(300),
    description: z.string().max(5000).optional().nullable(),
    price: z.number().nonnegative(),
    stock: z.number().int().nonnegative(),
    category: z.string().max(100).optional().nullable(),
    attributes: z.record(z.unknown()).optional(),
  })
  .openapi('CreateProductRequest');

export const updateProductSchema = createProductSchema
  .partial()
  .omit({ sku: true })
  .extend({
    expectedVersion: z.number().int().positive().optional().openapi({
      description: 'Optimistic lock — omit to use current DB version check only via WHERE',
    }),
  })
  .openapi('UpdateProductRequest');

export const productSchema = z
  .object({
    id: z.string().uuid(),
    sku: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    price: z.string(),
    stock: z.number().int(),
    category: z.string().nullable(),
    attributes: z.record(z.unknown()),
    version: z.number().int().optional(),
  })
  .openapi('Product');

export const createOrderSchema = z
  .object({
    items: z
      .array(
        z.object({
          productId: z.string().uuid(),
          quantity: z.number().int().positive(),
        })
      )
      .min(1),
    shippingAddress: z.record(z.unknown()).default({}),
  })
  .openapi('CreateOrderRequest');

export const orderSchema = z
  .object({
    id: z.string().uuid(),
    user_id: z.string().uuid(),
    status: z.string(),
    total_amount: z.string(),
    created_at: z.string().or(z.date()),
  })
  .openapi('Order');

export const aiChatMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().min(1).max(2000),
  })
  .openapi('AiChatMessage');

export const aiInsightSchema = z
  .object({
    question: z.string().min(3).max(2000).openapi({ example: 'Which categories drive revenue?' }),
    context: z.enum(['orders', 'products', 'general']).optional(),
    history: z.array(aiChatMessageSchema).max(10).optional(),
  })
  .openapi('AiInsightRequest');

export const aiInsightResponseSchema = z
  .object({
    answer: z.string(),
    mode: z.enum(['openai', 'demo']),
    model: z.string(),
    sources: z.array(z.string()),
    generatedAt: z.string(),
    context: z.enum(['orders', 'products', 'general']),
  })
  .openapi('AiInsightResponse');

export const aiSummarizeSchema = z
  .object({
    target: z.enum(['orders', 'products', 'catalog']).openapi({ example: 'orders' }),
  })
  .openapi('AiSummarizeRequest');

export const aiRecommendSchema = z
  .object({
    limit: z.number().int().min(1).max(10).optional().openapi({ example: 5 }),
    focus: z.string().min(2).max(200).optional().openapi({ example: 'low stock electronics' }),
  })
  .openapi('AiRecommendRequest');

export const aiRecommendResponseSchema = z
  .object({
    recommendations: z.array(
      z.object({
        productId: z.string(),
        name: z.string(),
        category: z.string(),
        stock: z.number(),
        reason: z.string(),
      })
    ),
    mode: z.enum(['openai', 'demo']),
    model: z.string(),
    generatedAt: z.string(),
  })
  .openapi('AiRecommendResponse');

export const enterpriseIndustrySchema = z
  .enum(['retail', 'supply_chain', 'finance', 'operations'])
  .openapi('EnterpriseIndustry');

export const enterpriseRiskItemSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    category: z.string(),
    evidence: z.string(),
    recommendation: z.string(),
  })
  .openapi('EnterpriseRiskItem');

export const enterpriseActionItemSchema = z
  .object({
    id: z.string(),
    priority: z.number().int(),
    owner: z.string(),
    title: z.string(),
    rationale: z.string(),
    timeframe: z.string(),
  })
  .openapi('EnterpriseActionItem');

export const enterpriseKpiSchema = z
  .object({
    label: z.string(),
    value: z.string(),
    unit: z.string().optional(),
    trendHint: z.string().optional(),
  })
  .openapi('EnterpriseKpi');

export const enterpriseBriefingSchema = z
  .object({
    industry: enterpriseIndustrySchema.openapi({ example: 'retail' }),
    focus: z.string().min(2).max(200).optional().openapi({ example: 'stockout risk before promo' }),
  })
  .openapi('EnterpriseBriefingRequest');

export const enterpriseBriefingResponseSchema = z
  .object({
    industry: enterpriseIndustrySchema,
    headline: z.string(),
    summary: z.string(),
    kpis: z.array(enterpriseKpiSchema),
    risks: z.array(enterpriseRiskItemSchema),
    actions: z.array(enterpriseActionItemSchema),
    mode: z.enum(['openai', 'demo']),
    model: z.string(),
    sources: z.array(z.string()),
    generatedAt: z.string(),
  })
  .openapi('EnterpriseBriefingResponse');

export const enterpriseRisksSchema = z
  .object({
    industry: enterpriseIndustrySchema,
    limit: z.number().int().min(1).max(15).optional().openapi({ example: 8 }),
  })
  .openapi('EnterpriseRisksRequest');

export const enterpriseRisksResponseSchema = z
  .object({
    industry: enterpriseIndustrySchema,
    risks: z.array(enterpriseRiskItemSchema),
    mode: z.enum(['openai', 'demo']),
    model: z.string(),
    sources: z.array(z.string()),
    generatedAt: z.string(),
  })
  .openapi('EnterpriseRisksResponse');

export const enterpriseActionsSchema = z
  .object({
    industry: enterpriseIndustrySchema,
    limit: z.number().int().min(1).max(10).optional().openapi({ example: 5 }),
    focus: z.string().min(2).max(200).optional(),
  })
  .openapi('EnterpriseActionsRequest');

export const enterpriseActionsResponseSchema = z
  .object({
    industry: enterpriseIndustrySchema,
    actions: z.array(enterpriseActionItemSchema),
    mode: z.enum(['openai', 'demo']),
    model: z.string(),
    sources: z.array(z.string()),
    generatedAt: z.string(),
  })
  .openapi('EnterpriseActionsResponse');

export const mlExperimentSchema = z
  .object({
    task: z.enum(['regression', 'classification', 'clustering', 'similarity']).openapi({
      example: 'regression',
    }),
    testRatio: z.number().min(0.15).max(0.4).optional(),
    epochs: z.number().int().min(50).max(800).optional(),
    learningRate: z.number().min(0.001).max(0.5).optional(),
    k: z.number().int().min(2).max(6).optional(),
    query: z.string().min(2).max(200).optional(),
    topK: z.number().int().min(1).max(20).optional(),
  })
  .openapi('MlExperimentRequest');

export const aiStatusResponseSchema = z
  .object({
    enabled: z.boolean(),
    mode: z.enum(['openai', 'demo']),
    provider: z.string(),
    model: z.string(),
    circuitBreaker: z.object({
      name: z.string(),
      state: z.string(),
      failures: z.number(),
    }),
    pipeline: z.array(z.string()),
    industries: z.array(enterpriseIndustrySchema).optional(),
    sources: z.array(z.string()),
    snapshot: z.record(z.string(), z.unknown()),
    generatedAt: z.string(),
  })
  .openapi('AiStatusResponse');

export const errorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      correlationId: z.string().optional(),
      details: z.unknown().optional(),
    }),
  })
  .openapi('ErrorResponse');

export const dataWrapper = <T extends z.ZodTypeAny>(schema: T) =>
  z.object({ data: schema });
