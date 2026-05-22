import { Router } from 'express';
import * as productRepo from '../database/repositories/product.repository.js';
import { searchProducts } from '../database/queries/analytics.queries.js';
import { cacheGet, cacheSet } from '../cache/redis.js';
import { z } from 'zod';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const category = typeof req.query['category'] === 'string' ? req.query['category'] : undefined;
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

export default router;
