import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware.js';
import * as auditRepo from '../database/repositories/audit.repository.js';
import { parsePagination } from '../utils/pagination.js';

const router = Router();

router.use(authenticate, requireRole('admin', 'manager'));

router.get('/', async (req, res, next) => {
  try {
    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const entityType =
      typeof req.query['entityType'] === 'string' ? req.query['entityType'] : undefined;
    const result = await auditRepo.listPaginated({ entityType, page, limit, offset });
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export default router;
