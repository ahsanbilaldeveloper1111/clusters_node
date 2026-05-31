import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  getSalesByCategory,
  getUserOrderSummaries,
  getTopProductsPerCategory,
} from '../database/queries/analytics.queries.js';
import {
  getLastCalledAtByRemotePartyNumbers,
  countCallsByRemotePartyNumbers,
} from '../database/queries/call-analytics.queries.js';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { runCpuTask } from '../workers/worker-pool.js';
import {
  lastCalledAtBodySchema,
  callCountBodySchema,
} from './call-analytics.schemas.js';
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

/** Last called_at per remote party number (moderate batch sizes) */
router.post('/calls/last-called-at', async (req, res, next) => {
  try {
    const { remote_party_numbers } = lastCalledAtBodySchema.parse(req.body);
    const data = await getLastCalledAtByRemotePartyNumbers(remote_party_numbers);
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

/** Bulk call count — handler exported for app-level JSON body limit */
export async function handleCallCount(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { remote_party_numbers } = callCountBodySchema.parse(req.body);
    const result = await countCallsByRemotePartyNumbers(remote_party_numbers);
    res.json({
      data: {
        call_count: Number(result.call_count),
        filter_count: result.filter_count,
      },
    });
  } catch (err) {
    next(err);
  }
}

export default router;
