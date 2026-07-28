import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import * as aiService from '../services/ai.service.js';
import { aiInsightSchema } from '../openapi/schemas.js';

const router = Router();

router.post(
  '/insights',
  authenticate,
  requireRole('admin', 'manager'),
  async (req, res, next) => {
    try {
      const body = aiInsightSchema.parse(req.body);
      const result = await aiService.generateInsight(body);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
