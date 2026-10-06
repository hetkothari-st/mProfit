/**
 * Time-based one-time passwords (RFC 6238, as used by Google Authenticator,
 * Microsoft Authenticator, Authy, 1Password): HMAC-SHA1, 30-second steps,
 * 6 digits. Small enough to own outright rather than take a dependency.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret, base32 (what authenticator apps expect). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function currentStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / STEP_SECONDS);
}

/** The code for one time step. */
export function totpAt(secretBase32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', base32Decode(secretBase32)).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return bin.toString().padStart(DIGITS, '0');
}

/**
 * Check a code, allowing one step of clock drift either way. Returns the
 * matched step so the caller can refuse it next time (no replay); `afterStep`
 * rejects any step at or before the last one accepted.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  opts: { nowMs?: number; afterStep?: number | null } = {},
): { ok: true; step: number } | { ok: false } {
  const digits = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(digits)) return { ok: false };
  const now = currentStep(opts.nowMs);
  for (const step of [now - 1, now, now + 1]) {
    if (opts.afterStep != null && step <= opts.afterStep) continue;
    const expected = Buffer.from(totpAt(secretBase32, step));
    if (timingSafeEqual(expected, Buffer.from(digits))) return { ok: true, step };
  }
  return { ok: false };
}

/** The otpauth:// URI an authenticator app reads from the QR code. */
export function otpauthUri(secretBase32: string, account: string, issuer = 'EveryPaisa'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}
