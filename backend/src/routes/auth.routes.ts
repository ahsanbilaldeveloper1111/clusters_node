import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import * as authService from '../services/auth.service.js';
import * as userRepo from '../database/repositories/user.repository.js';
import { AppError } from '../utils/errors.js';
import { features } from '../config/features.js';
import { eventBus } from '../events/event-bus.js';
import { loginSchema, registerSchema, refreshSchema } from '../openapi/schemas.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many auth attempts' } },
});

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    const existing = await userRepo.findByEmail(body.email);
    if (existing) throw new AppError('Email already registered', 409, 'EMAIL_TAKEN');

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await userRepo.createUser({
      email: body.email.toLowerCase(),
      passwordHash,
      fullName: body.fullName,
      role: 'customer',
    });
    if (features.domainEvents()) {
      eventBus.emit({ type: 'UserRegistered', userId: user.id, email: user.email });
    }

    const result = await authService.login(
      body.email,
      body.password,
      authService.requestMeta(req)
    );
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await authService.login(body.email, body.password, authService.requestMeta(req));
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', authLimiter, async (req, res, next) => {
  try {
    const body = refreshSchema.parse(req.body);
    const result = await authService.refreshAccessToken(
      body.refreshToken,
      authService.requestMeta(req)
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const body = refreshSchema.parse(req.body);
    await authService.logout(body.refreshToken);
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
});

export default router;
