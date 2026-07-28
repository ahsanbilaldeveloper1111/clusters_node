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
    password: z.string().min(8).max(128),
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

export const aiInsightSchema = z
  .object({
    question: z.string().min(3).max(2000).openapi({ example: 'Which categories drive revenue?' }),
    context: z.enum(['orders', 'products', 'general']).optional(),
  })
  .openapi('AiInsightRequest');

export const aiInsightResponseSchema = z
  .object({
    answer: z.string(),
    mode: z.enum(['openai', 'demo']),
    model: z.string(),
    sources: z.array(z.string()),
    generatedAt: z.string(),
  })
  .openapi('AiInsightResponse');

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
