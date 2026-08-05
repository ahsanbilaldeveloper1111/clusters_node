/**
 * Password policy + modern hashing (Node crypto scrypt) with bcrypt legacy verify.
 * Interview: OWASP password storage — prefer memory-hard KDF (scrypt/argon2).
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import bcrypt from 'bcryptjs';
import { BadRequestError } from '../utils/errors.js';

const scrypt = promisify(scryptCb);

/** OWASP-inspired password complexity (demo-friendly, still strict). */
export function assertPasswordPolicy(password: string): void {
  if (password.length < 10) {
    throw new BadRequestError('Password must be at least 10 characters');
  }
  if (password.length > 128) {
    throw new BadRequestError('Password too long');
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new BadRequestError('Password must include upper, lower, and a digit');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new BadRequestError('Password must include a special character');
  }
  const lowered = password.toLowerCase();
  const banned = ['password', 'qwerty', '123456', 'admin', 'welcome', 'enterprise'];
  if (banned.some((b) => lowered.includes(b))) {
    throw new BadRequestError('Password contains a common banned word');
  }
}

/** Format: scrypt$N$r$p$saltB64$hashB64 */
export async function hashPassword(password: string): Promise<{ hash: string; algo: 'scrypt' }> {
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64, { N, r, p })) as Buffer;
  return {
    algo: 'scrypt',
    hash: `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${derived.toString('base64url')}`,
  };
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 6) return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4]!, 'base64url');
    const expected = Buffer.from(parts[5]!, 'base64url');
    const derived = (await scrypt(password, salt, expected.length, { N, r, p })) as Buffer;
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  }
  // Legacy bcrypt hashes from seed / older registrations
  return bcrypt.compare(password, stored);
}

export function passwordAlgoOf(stored: string): 'scrypt' | 'bcrypt' {
  return stored.startsWith('scrypt$') ? 'scrypt' : 'bcrypt';
}
