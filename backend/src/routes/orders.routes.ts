import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware.js';
import * as orderRepo from '../database/repositories/order.repository.js';

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
    const orders = await orderRepo.getOrdersByUser(req.user!.sub);
    res.json({ data: orders });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const body = createOrderSchema.parse(req.body);
    const order = await orderRepo.createOrder(req.user!.sub, body.items, body.shippingAddress);
    res.status(201).json({ data: order });
  } catch (err) {
    next(err);
  }
});

export default router;
