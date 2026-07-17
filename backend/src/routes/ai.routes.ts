import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import * as aiService from '../services/ai.service.js';

const router = Router();

const insightSchema = z.object({
  question: z.string().min(3).max(2000),
  context: z.enum(['orders', 'products', 'general']).optional(),
});

router.post(
  '/insights',
  authenticate,
  requireRole('admin', 'manager'),
  async (req, res, next) => {
    try {
      const body = insightSchema.parse(req.body);
      const result = await aiService.generateInsight(body);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
