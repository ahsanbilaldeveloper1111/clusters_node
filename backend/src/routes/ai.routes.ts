import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import * as aiService from '../services/ai.service.js';
import {
  aiInsightSchema,
  aiRecommendSchema,
  aiSummarizeSchema,
  enterpriseActionsSchema,
  enterpriseBriefingSchema,
  enterpriseRisksSchema,
} from '../openapi/schemas.js';

const router = Router();

/** Portfolio demo: live SQL snapshot + provider/circuit status (no LLM call). */
router.get(
  '/status',
  authenticate,
  requireRole('admin', 'manager'),
  async (req, res, next) => {
    try {
      const context =
        req.query.context === 'orders' || req.query.context === 'products'
          ? req.query.context
          : 'general';
      const result = await aiService.getAiStatus(context);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

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

router.post(
  '/enterprise/briefing',
  authenticate,
  requireRole('admin', 'manager'),
  async (req, res, next) => {
    try {
      const body = enterpriseBriefingSchema.parse(req.body);
      const result = await aiService.enterpriseBriefing(body);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/enterprise/risks',
  authenticate,
  requireRole('admin', 'manager'),
  async (req, res, next) => {
    try {
      const body = enterpriseRisksSchema.parse(req.body);
      const result = await aiService.enterpriseRisks(body);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/enterprise/actions',
  authenticate,
  requireRole('admin', 'manager'),
  async (req, res, next) => {
    try {
      const body = enterpriseActionsSchema.parse(req.body);
      const result = await aiService.enterpriseActions(body);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
