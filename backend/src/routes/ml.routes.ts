import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import { mlExperimentSchema } from '../openapi/schemas.js';
import * as mlService from '../services/ml.service.js';

const router = Router();

/** Learning lab status + curriculum (no heavy compute). */
router.get('/status', authenticate, requireRole('admin', 'manager'), async (_req, res, next) => {
  try {
    const result = await mlService.getMlLabStatus();
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

/** Preview engineered features from live products. */
router.get('/features', authenticate, requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 12) || 12, 1), 50);
    const result = await mlService.getMlFeatures(limit);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

/** Run a from-scratch ML experiment (train + evaluate). */
router.post('/experiment', authenticate, requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const body = mlExperimentSchema.parse(req.body);
    const result = await mlService.runMlExperiment(body);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
