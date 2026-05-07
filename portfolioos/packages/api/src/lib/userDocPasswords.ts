import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { encryptSecret, decryptSecret } from './secrets.js';

const MAX_SAVED = 10;

/**
 * Returns the user's saved file unlock passwords (most-recent first).
 * Tried automatically on every locked PDF / encrypted XLSX upload before
 * prompting the user. Safe to call with a missing/invalid encrypted blob —
 * returns [] on any decode error rather than throwing.
 */
export async function getSavedDocPasswords(userId: string): Promise<string[]> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { savedFilePasswordsEnc: true },
    });
    const enc = user?.savedFilePasswordsEnc;
    if (!enc) return [];
    const json = decryptSecret(enc);
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s) => typeof s === 'string' && s.length > 0).slice(0, MAX_SAVED);
  } catch (err) {
    logger.warn({ err, userId }, '[userDocPasswords] failed to read saved passwords');
    return [];
  }
}

/**
 * Append a password to the user's saved unlock list. Dedups against
 * existing entries (same plaintext = no insert), prepends new entries so
 * the most recently used is tried first, caps at MAX_SAVED.
 *
 * Skips empty strings and PAN-shaped values (the user's PAN is already
 * derived automatically by getUserPdfPasswords — no point double-storing).
 */
export async function saveDocPassword(userId: string, password: string): Promise<void> {
  const trimmed = password.trim();
  if (!trimmed) return;
  // PAN is already auto-tried via getUserPdfPasswords from User.pan.
  if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(trimmed.toUpperCase())) return;

  const existing = await getSavedDocPasswords(userId);
  if (existing.includes(trimmed)) return;
  const next = [trimmed, ...existing].slice(0, MAX_SAVED);
  const enc = encryptSecret(JSON.stringify(next));
  await prisma.user.update({
    where: { id: userId },
    data: { savedFilePasswordsEnc: enc },
  });
}
