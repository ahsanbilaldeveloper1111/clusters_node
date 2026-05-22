import { Router } from 'express';
import {
  getSalesByCategory,
  getUserOrderSummaries,
  getTopProductsPerCategory,
} from '../database/queries/analytics.queries.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { runCpuTask } from '../workers/worker-pool.js';
import { z } from 'zod';

const router = Router();

router.use(authenticate);
router.use(requireRole('admin', 'manager'));

router.get('/sales-by-category', async (_req, res, next) => {
  try {
    const data = await getSalesByCategory();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.get('/user-summaries', async (_req, res, next) => {
  try {
    const data = await getUserOrderSummaries();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.get('/top-products', async (_req, res, next) => {
  try {
    const data = await getTopProductsPerCategory();
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

/** Demonstrates Worker Thread offload for CPU-bound analytics */
router.post('/compute', async (req, res, next) => {
  try {
    const body = z
      .object({
        task: z.enum(['primes', 'aggregate', 'hash']),
        limit: z.number().optional(),
        numbers: z.array(z.number()).optional(),
      })
      .parse(req.body);

    const taskInput = {
      task: body.task,
      ...(body.limit !== undefined ? { limit: body.limit } : {}),
      ...(body.numbers !== undefined ? { numbers: body.numbers } : {}),
    };
    const result = await runCpuTask(taskInput);
    res.json({ data: result, workerThread: true });
  } catch (err) {
    next(err);
  }
});

export default router;
