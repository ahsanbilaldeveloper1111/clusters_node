import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  loginSchema,
  registerSchema,
  refreshSchema,
  authResultSchema,
  createProductSchema,
  updateProductSchema,
  productSchema,
  createOrderSchema,
  orderSchema,
  aiInsightSchema,
  aiInsightResponseSchema,
  aiSummarizeSchema,
  aiRecommendSchema,
  aiRecommendResponseSchema,
  errorSchema,
  dataWrapper,
} from './schemas.js';

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

registry.registerPath({
  method: 'get',
  path: '/health',
  tags: ['System'],
  summary: 'Readiness probe',
  responses: {
    200: { description: 'Healthy' },
    503: { description: 'Degraded' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/metrics',
  tags: ['System'],
  summary: 'Prometheus metrics',
  responses: {
    200: { description: 'text/plain Prometheus exposition format' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/register',
  tags: ['Auth'],
  summary: 'Register a customer account',
  request: {
    body: { content: { 'application/json': { schema: registerSchema } } },
  },
  responses: {
    201: {
      description: 'Created + tokens',
      content: { 'application/json': { schema: dataWrapper(authResultSchema) } },
    },
    409: {
      description: 'Email taken',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/login',
  tags: ['Auth'],
  summary: 'Login with email and password',
  request: {
    body: { content: { 'application/json': { schema: loginSchema } } },
  },
  responses: {
    200: {
      description: 'Access + refresh tokens',
      content: { 'application/json': { schema: dataWrapper(authResultSchema) } },
    },
    401: {
      description: 'Invalid credentials',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/refresh',
  tags: ['Auth'],
  summary: 'Rotate refresh token and issue new access token',
  request: {
    body: { content: { 'application/json': { schema: refreshSchema } } },
  },
  responses: {
    200: {
      description: 'New token pair',
      content: { 'application/json': { schema: dataWrapper(authResultSchema) } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/logout',
  tags: ['Auth'],
  summary: 'Revoke refresh token',
  request: {
    body: { content: { 'application/json': { schema: refreshSchema } } },
  },
  responses: {
    200: { description: 'Logged out' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/products',
  tags: ['Products'],
  summary: 'List products (optional pagination)',
  request: {
    query: z.object({
      category: z.string().optional(),
      q: z.string().optional(),
      page: z.coerce.number().int().optional(),
      limit: z.coerce.number().int().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Product list or paginated page',
      content: {
        'application/json': {
          schema: z.object({
            data: z.union([
              z.array(productSchema),
              z.object({
                items: z.array(productSchema),
                page: z.number(),
                limit: z.number(),
                total: z.number(),
                totalPages: z.number(),
              }),
            ]),
            cached: z.boolean().optional(),
          }),
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/products/search',
  tags: ['Products'],
  summary: 'Trigram fuzzy search',
  request: {
    query: z.object({ q: z.string().min(1) }),
  },
  responses: {
    200: { description: 'Search results' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/products',
  tags: ['Products'],
  summary: 'Create product (admin/manager)',
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: createProductSchema } } },
  },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: dataWrapper(productSchema) } },
    },
  },
});

registry.registerPath({
  method: 'patch',
  path: '/api/products/{id}',
  tags: ['Products'],
  summary: 'Update product with optional optimistic locking',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: updateProductSchema } } },
  },
  responses: {
    200: {
      description: 'Updated',
      content: { 'application/json': { schema: dataWrapper(productSchema) } },
    },
    409: {
      description: 'Optimistic lock conflict',
      content: { 'application/json': { schema: errorSchema } },
    },
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/products/{id}',
  tags: ['Products'],
  summary: 'Delete product (admin)',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    204: { description: 'Deleted' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/orders',
  tags: ['Orders'],
  summary: 'List orders (own or all with ?all=true for staff)',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      page: z.coerce.number().int().optional(),
      limit: z.coerce.number().int().optional(),
      all: z.string().optional(),
      status: z.string().optional(),
    }),
  },
  responses: {
    200: { description: 'Orders' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/orders',
  tags: ['Orders'],
  summary: 'Place order with stock reservation (supports Idempotency-Key)',
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: createOrderSchema } } },
  },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: dataWrapper(orderSchema) } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/orders/{id}/cancel',
  tags: ['Orders'],
  summary: 'Cancel order and restore stock',
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Cancelled',
      content: { 'application/json': { schema: dataWrapper(orderSchema) } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/audit',
  tags: ['System'],
  summary: 'Paginated audit trail',
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      page: z.coerce.number().int().optional(),
      limit: z.coerce.number().int().optional(),
      entityType: z.string().optional(),
    }),
  },
  responses: {
    200: { description: 'Audit events' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/ai/insights',
  tags: ['AI'],
  summary: 'Multi-turn LLM chat grounded in live order/product data',
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: aiInsightSchema } } },
  },
  responses: {
    200: {
      description: 'AI insight (openai or demo mode)',
      content: { 'application/json': { schema: dataWrapper(aiInsightResponseSchema) } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/ai/summarize',
  tags: ['AI'],
  summary: 'LLM summary of orders or product catalog',
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: aiSummarizeSchema } } },
  },
  responses: {
    200: {
      description: 'Summary (openai or demo mode)',
      content: { 'application/json': { schema: dataWrapper(aiInsightResponseSchema) } },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/ai/recommend',
  tags: ['AI'],
  summary: 'LLM product recommendations from catalog/stock data',
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { 'application/json': { schema: aiRecommendSchema } } },
  },
  responses: {
    200: {
      description: 'Recommendations (openai or demo mode)',
      content: { 'application/json': { schema: dataWrapper(aiRecommendResponseSchema) } },
    },
  },
});

/** Build OpenAPI 3.1 document from Zod schemas (no hand-written openapi.json). */
export function buildOpenApiDocument(): Record<string, unknown> {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Enterprise Advanced API',
      version: '1.0.0',
      description:
        'Generated from Zod schemas via @asteasolutions/zod-to-openapi. ' +
        'Edit schemas in backend/src/openapi/schemas.ts and paths in document.ts — not a manual JSON file.',
    },
    servers: [{ url: 'http://localhost:3000', description: 'Local' }],
    tags: [
      { name: 'Auth', description: 'JWT login and refresh token rotation' },
      { name: 'Products', description: 'Catalog and trigram search' },
      { name: 'Orders', description: 'Transactional orders' },
      { name: 'AI', description: 'LLM-powered business insights' },
      { name: 'System', description: 'Health, metrics, audit' },
    ],
  }) as unknown as Record<string, unknown>;
}

let cached: Record<string, unknown> | null = null;

export function getOpenApiDocument(): Record<string, unknown> {
  if (!cached) cached = buildOpenApiDocument();
  return cached;
}
