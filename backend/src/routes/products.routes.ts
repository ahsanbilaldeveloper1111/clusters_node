import { Router } from 'express';
import * as productRepo from '../database/repositories/product.repository.js';
import * as auditRepo from '../database/repositories/audit.repository.js';
import { searchProducts } from '../database/queries/analytics.queries.js';
import { cacheGet, cacheSet, cacheDel } from '../cache/redis.js';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { parsePagination } from '../utils/pagination.js';
import { NotFoundError } from '../utils/errors.js';
import { features } from '../config/features.js';
import { eventBus } from '../events/event-bus.js';
import { createProductSchema, updateProductSchema } from '../openapi/schemas.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const category = typeof req.query['category'] === 'string' ? req.query['category'] : undefined;
    const q = typeof req.query['q'] === 'string' ? req.query['q'] : undefined;
    const paginated = req.query['page'] !== undefined || req.query['limit'] !== undefined;

    if (paginated) {
      const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
      const result = await productRepo.listPaginated({ category, q, page, limit, offset });
      res.json({ data: result });
      return;
    }

    const cacheKey = `products:list:${category ?? 'all'}`;
    const cached = await cacheGet<unknown[]>(cacheKey);
    if (cached) {
      res.json({ data: cached, cached: true });
      return;
    }
    const products = await productRepo.listAll(category);
    await cacheSet(cacheKey, products, 120);
    res.json({ data: products, cached: false });
  } catch (err) {
    next(err);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const q = z.string().min(1).parse(req.query['q']);
    const results = await searchProducts(q);
    res.json({ data: results });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const product = await productRepo.findById(req.params['id']!);
    if (!product) {
      res.status(404).json({ error: { message: 'Product not found' } });
      return;
    }
    res.json({ data: product });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticate, requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const body = createProductSchema.parse(req.body);
    const product = await productRepo.create(body);
    await auditRepo.writeAudit({
      entityType: 'product',
      entityId: product.id,
      action: 'created',
      actorId: req.user!.sub,
      payload: { sku: product.sku },
    });
    await cacheDel('products:list:*');
    res.status(201).json({ data: product });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticate, requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params['id']);
    const body = updateProductSchema.parse(req.body);
    const product = await productRepo.update(id, body);
    if (!product) throw new NotFoundError('Product');
    if (features.domainEvents()) {
      eventBus.emit({
        type: 'ProductUpdated',
        productId: product.id,
        actorId: req.user!.sub,
      });
    } else {
      await auditRepo.writeAudit({
        entityType: 'product',
        entityId: product.id,
        action: 'updated',
        actorId: req.user!.sub,
        payload: body,
      });
    }
    await cacheDel('products:list:*');
    res.json({ data: product });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticate, requireRole('admin'), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params['id']);
    const ok = await productRepo.remove(id);
    if (!ok) throw new NotFoundError('Product');
    await auditRepo.writeAudit({
      entityType: 'product',
      entityId: id,
      action: 'deleted',
      actorId: req.user!.sub,
    });
    await cacheDel('products:list:*');
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
