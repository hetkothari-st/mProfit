import { readFile } from 'node:fs/promises';
import { prisma } from './prisma.js';
import { logger } from './logger.js';

/**
 * Thin wrapper around pdfjs-dist that tries to read a PDF and, if it's
 * password-protected, retries with each candidate password.
 *
 * Indian brokers/AMCs commonly encrypt attachments with:
 *   - PAN (uppercase), e.g. ABCDE1234F
 *   - PAN + DOB (DDMMYYYY) — CAMS CAS uses this sometimes
 *   - DOB (DDMMYYYY) only
 *
 * Callers pass the list of candidate passwords (typically just [user.pan]).
 */
export async function readPdfText(
  filePath: string,
  passwords: string[] = [],
): Promise<{ text: string; usedPassword: string | null; encrypted: boolean }> {
  const buf = await readFile(filePath);
  // Lazy import to keep startup light
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const candidates = ['', ...passwords.filter((p) => p && p.length > 0)];
  let lastErr: unknown = null;
  let wasEncrypted = false;

  for (const pw of candidates) {
    // pdfjs internally calls `structuredClone(..., { transfer: [data.buffer] })`
    // via its LoopbackPort. Node's Buffer.buffer is often a shared pool-backed
    // ArrayBuffer that isn't transferable → throws DataCloneError. Copy into a
    // standalone ArrayBuffer for each attempt (transfer detaches it, so we
    // can't reuse across retries).
    const standalone = new ArrayBuffer(buf.byteLength);
    const data = new Uint8Array(standalone);
    data.set(buf);

    try {
      const loadingTask = pdfjs.getDocument({
        data,
        password: pw || undefined,
        // Silence pdf.js console spam
        verbosity: 0,
      });
      const doc = await loadingTask.promise;
      let text = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const items = content.items as Array<{ str?: string; hasEOL?: boolean }>;
        for (const it of items) {
          if (it.str) text += it.str;
          text += it.hasEOL ? '\n' : ' ';
        }
        text += '\n';
      }
      await doc.cleanup();
      await doc.destroy();
      return { text, usedPassword: pw || null, encrypted: wasEncrypted };
    } catch (err) {
      const e = err as { name?: string; code?: number; message?: string };
      // pdfjs throws PasswordException with code 1 (NEEDED) or 2 (INCORRECT)
      if (e.name === 'PasswordException' || /password/i.test(e.message ?? '')) {
        wasEncrypted = true;
        lastErr = err;
        continue; // try next candidate
      }
      throw err;
    }
  }

  throw Object.assign(new Error('PDF is password-protected and no matching password found'), {
    name: 'PasswordException',
    cause: lastErr,
    encrypted: true,
  });
}

/**
 * Returns the candidate passwords to try for this user, ordered most→least
 * likely. Common Indian broker/AMC password conventions:
 *   1. PAN (uppercase)                — Zerodha, NSDL/CDSL, most AMCs
 *   2. PAN + DOB(DDMMYYYY)            — CAMS CAS variant
 *   3. PAN + DOB(DDMM)                — some older CAMS CAS
 *   4. DOB(DDMMYYYY) only             — rare, some CDSL
 * Safe to call with null userId.
 */
export async function getUserPdfPasswords(userId: string | null | undefined): Promise<string[]> {
  if (!userId) return [];
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pan: true, dob: true, email: true, phone: true },
    });
    const pan = user?.pan?.trim().toUpperCase() ?? '';
    const dob = user?.dob ?? null;
    const email = user?.email?.trim().toLowerCase() ?? '';
    const phone = user?.phone?.trim().replace(/\D/g, '') ?? '';

    const candidates: string[] = [];
    if (pan) candidates.push(pan);

    if (dob) {
      const dd = String(dob.getUTCDate()).padStart(2, '0');
      const mm = String(dob.getUTCMonth() + 1).padStart(2, '0');
      const yyyy = String(dob.getUTCFullYear());
      const ddmmyyyy = `${dd}${mm}${yyyy}`;
      const ddmm = `${dd}${mm}`;

      const MON_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const mon = MON_NAMES[dob.getUTCMonth()]!;

      if (pan) {
        candidates.push(`${pan}${ddmmyyyy}`);
        candidates.push(`${pan}${ddmm}`);
      }
      candidates.push(ddmmyyyy);
      // Some older CAS files use DD/MM/YYYY or DDMonYYYY
      candidates.push(`${dd}/${mm}/${yyyy}`);
      candidates.push(`${dd}${mon}${yyyy}`);
    }

    // Some CAMS/KFintech CAS PDFs use email as password
    if (email) candidates.push(email);

    // Some providers use phone number as password
    if (phone) {
      candidates.push(phone);
      // If international format, also try last 10 digits
      if (phone.length > 10) candidates.push(phone.slice(-10));
    }

    return candidates;
  } catch (err) {
    logger.warn({ err, userId }, '[pdf] failed to fetch user PAN/DOB');
    return [];
  }
}

export function isPdfPasswordError(err: unknown): boolean {
  const e = err as { name?: string; encrypted?: boolean; message?: string };
  return (
    e?.name === 'PasswordException' ||
    e?.encrypted === true ||
    /password/i.test(e?.message ?? '')
  );
}
