import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import * as authService from '../services/auth.service.js';
import * as userRepo from '../database/repositories/user.repository.js';
import { AppError } from '../utils/errors.js';
import { features } from '../config/features.js';
import { eventBus } from '../events/event-bus.js';
import { registerSchema, refreshSchema } from '../openapi/schemas.js';
import { assertPasswordPolicy, hashPassword } from '../security/password.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many auth attempts' } },
});

const loginWithMfaSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  totpCode: z.string().regex(/^\d{6}$/).optional(),
});

const totpCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

const logoutSchema = refreshSchema.extend({
  accessToken: z.string().optional(),
});

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
    assertPasswordPolicy(body.password);
    const existing = await userRepo.findByEmail(body.email);
    if (existing) throw new AppError('Email already registered', 409, 'EMAIL_TAKEN');

    const { hash, algo } = await hashPassword(body.password);
    const user = await userRepo.createUser({
      email: body.email.toLowerCase(),
      passwordHash: hash,
      fullName: body.fullName,
      role: 'customer',
      passwordAlgo: algo,
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
    const body = loginWithMfaSchema.parse(req.body);
    const result = await authService.login(
      body.email,
      body.password,
      authService.requestMeta(req),
      body.totpCode
    );
    if (result.mfaRequired) {
      res.status(200).json({
        data: {
          mfaRequired: true,
          message: 'Enter authenticator code via totpCode to complete login',
          user: { email: result.user.email, id: result.user.id },
        },
      });
      return;
    }
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
    const body = logoutSchema.parse(req.body);
    const bearer = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : undefined;
    await authService.logout(body.refreshToken, body.accessToken ?? bearer);
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
});

/** Begin TOTP MFA enrollment — returns otpauth:// URI for authenticator apps. */
router.post('/mfa/setup', authenticate, async (req, res, next) => {
  try {
    const data = await authService.beginTotpSetup(req.user!.sub, req.user!.email);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.post('/mfa/enable', authenticate, async (req, res, next) => {
  try {
    const body = totpCodeSchema.parse(req.body);
    const data = await authService.confirmTotpEnable(req.user!.sub, body.code);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.post('/mfa/disable', authenticate, async (req, res, next) => {
  try {
    const body = totpCodeSchema.parse(req.body);
    const data = await authService.disableTotpForUser(req.user!.sub, body.code);
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
