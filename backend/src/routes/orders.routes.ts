import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import * as orderRepo from '../database/repositories/order.repository.js';
import { parsePagination } from '../utils/pagination.js';
import { NotFoundError } from '../utils/errors.js';
import { findIdempotentResponse, saveIdempotentResponse } from '../lib/idempotency.js';
import { features } from '../config/features.js';
import { eventBus } from '../events/event-bus.js';

const router = Router();

const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
  shippingAddress: z.record(z.unknown()).default({}),
});

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
    const paginated = req.query['page'] !== undefined || req.query['limit'] !== undefined;
    const isStaff = req.user!.role === 'admin' || req.user!.role === 'manager';

    if (paginated) {
      const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
      const result = await orderRepo.listPaginated({
        userId: isStaff && req.query['all'] === 'true' ? undefined : req.user!.sub,
        status,
        page,
        limit,
        offset,
      });
      res.json({ data: result });
      return;
    }

    const orders = await orderRepo.getOrdersByUser(req.user!.sub);
    res.json({ data: orders });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const body = createOrderSchema.parse(req.body);
    const idempotencyKey = req.header('idempotency-key') || req.header('x-idempotency-key');
    const path = '/api/orders';

    if (idempotencyKey && features.idempotency()) {
      const cached = await findIdempotentResponse(
        idempotencyKey,
        req.user!.sub,
        'POST',
        path
      );
      if (cached) {
        res.status(cached.status_code).json(cached.response_body);
        return;
      }
    }

    const order = await orderRepo.createOrder(req.user!.sub, body.items, body.shippingAddress);

    if (features.domainEvents()) {
      eventBus.emit({
        type: 'OrderCreated',
        orderId: order.id,
        userId: req.user!.sub,
        total: Number(order.total_amount),
      });
    }

    const payload = { data: order };
    if (idempotencyKey && features.idempotency()) {
      await saveIdempotentResponse({
        key: idempotencyKey,
        userId: req.user!.sub,
        method: 'POST',
        path,
        statusCode: 201,
        body: payload,
      });
    }

    res.status(201).json(payload);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const order = await orderRepo.findById(req.params['id']!);
    if (!order) throw new NotFoundError('Order');
    const isStaff = req.user!.role === 'admin' || req.user!.role === 'manager';
    if (!isStaff && order.user_id !== req.user!.sub) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not your order' } });
      return;
    }
    res.json({ data: order });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', async (req, res, next) => {
  try {
    const isAdmin = req.user!.role === 'admin' || req.user!.role === 'manager';
    const before = await orderRepo.findById(req.params['id']!);
    const order = await orderRepo.cancelOrder(req.params['id']!, req.user!.sub, isAdmin);

    if (features.domainEvents() && before && before.status !== 'cancelled') {
      eventBus.emit({
        type: 'OrderCancelled',
        orderId: order.id,
        userId: req.user!.sub,
        previousStatus: before.status,
      });
    }

    res.json({ data: order });
  } catch (err) {
    next(err);
  }
});

export default router;
