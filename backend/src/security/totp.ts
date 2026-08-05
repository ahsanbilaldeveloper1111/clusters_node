/**
 * RFC 6238 TOTP (Time-based One-Time Password) — MFA for admin/manager.
 * Pure Node crypto (no external OTP library).
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(bytes = 20): string {
  const buf = randomBytes(bytes);
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32[parseInt(bits.slice(i, i + 5), 2)]!;
  }
  return out;
}

function base32ToBuffer(secret: string): Buffer {
  const cleaned = secret.replace(/=+$/, '').toUpperCase();
  let bits = '';
  for (const c of cleaned) {
    const val = BASE32.indexOf(c);
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpCode(secret: string, stepSeconds = 30, digits = 6, atMs = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / stepSeconds);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32ToBuffer(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (code % 10 ** digits).toString().padStart(digits, '0');
}

export function verifyTotpCode(
  secret: string,
  code: string,
  window = 1,
  stepSeconds = 30
): boolean {
  const normalized = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const now = Date.now();
  for (let w = -window; w <= window; w++) {
    const expected = generateTotpCode(secret, stepSeconds, 6, now + w * stepSeconds * 1000);
    try {
      if (timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) return true;
    } catch {
      /* length mismatch */
    }
  }
  return false;
}

export function totpOtpAuthUri(secret: string, email: string, issuer = 'EnterpriseApp'): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const iss = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${iss}&algorithm=SHA1&digits=6&period=30`;
}
