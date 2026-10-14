import crypto from 'node:crypto';

/** RFC 7636: 43-128 chars of [A-Z a-z 0-9 - . _ ~]. */
export function isValidVerifier(v: string): boolean {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(v);
}

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!isValidVerifier(verifier)) return false;
  const computed = crypto.createHash('sha256').update(verifier).digest('base64url');
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
