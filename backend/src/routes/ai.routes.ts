import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import * as aiService from '../services/ai.service.js';
import {
  aiInsightSchema,
  aiRecommendSchema,
  aiSummarizeSchema,
} from '../openapi/schemas.js';

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

router.post(
  '/summarize',
  authenticate,
  requireRole('admin', 'manager'),
  async (req, res, next) => {
    try {
      const body = aiSummarizeSchema.parse(req.body);
      const result = await aiService.summarizeBusiness(body);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/recommend',
  authenticate,
  requireRole('admin', 'manager'),
  async (req, res, next) => {
    try {
      const body = aiRecommendSchema.parse(req.body);
      const result = await aiService.recommendProducts(body);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
