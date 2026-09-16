import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  normalizePan,
  normalizeRegistrationNo,
  panColumns,
  registrationNoColumns,
  registrationNoHash,
  readPan,
  readRegistrationNo,
} from '../../src/services/piiAtRest.service.js';

/**
 * SEC-14 — PAN and vehicle registration numbers were plain text at rest.
 *
 * User.pan, Client.pan and Vehicle.registrationNo were ordinary String
 * columns. A database dump, a backup, or any read that escaped RLS exposed
 * them directly. They now follow the pattern policy numbers already use:
 * AES-256-GCM ciphertext, a keyed fingerprint for lookups, last-4 for display.
 */

const SRC = join(__dirname, '..', '..', 'src');

describe('SEC-14: PAN is written encrypted, never as plaintext', () => {
  it('produces ciphertext, a fingerprint and last-4, and no plaintext', async () => {
    const cols = await panColumns('abcde1234f');
    expect(cols.pan).toBeNull();
    expect(cols.panEnc).toBeTruthy();
    expect(cols.panEnc).not.toContain('ABCDE1234F');
    expect(cols.panHash).toMatch(/^[0-9a-f]{64}$/);
    expect(cols.panLast4).toBe('234F');
  });

  it('round-trips through the dual reader', async () => {
    const cols = await panColumns('ABCDE1234F');
    expect(await readPan({ pan: null, panEnc: cols.panEnc })).toBe('ABCDE1234F');
  });

  it('prefers ciphertext over a stale plaintext during the transition', async () => {
    const cols = await panColumns('ABCDE1234F');
    expect(await readPan({ pan: 'ZZZZZ9999Z', panEnc: cols.panEnc })).toBe('ABCDE1234F');
  });

  it('still reads a row the backfill has not reached', async () => {
    expect(await readPan({ pan: ' abcde1234f ', panEnc: null })).toBe('ABCDE1234F');
  });

  it('clears every representation when PAN is removed', async () => {
    expect(await panColumns(null)).toEqual({ pan: null, panEnc: null, panHash: null, panLast4: null });
    expect(await panColumns('   ')).toEqual({ pan: null, panEnc: null, panHash: null, panLast4: null });
  });

  it('fingerprints are formatting-insensitive and uses a fresh IV each time', async () => {
    const a = await panColumns('abcde1234f');
    const b = await panColumns('ABCDE1234F');
    expect(a.panHash).toBe(b.panHash);
    // Same plaintext, different ciphertext: random IV per encryption.
    expect(a.panEnc).not.toBe(b.panEnc);
  });

  it('normalises consistently', () => {
    expect(normalizePan(' abcde1234f ')).toBe('ABCDE1234F');
  });
});

describe('SEC-14: no code path writes User.pan in plaintext', () => {
  /**
   * The CA shadow-client flow was found writing `pan: input.pan` straight
   * into tx.user.create after every other writer had been moved. A source
   * scan catches the next one.
   */
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (full.endsWith('.ts') && !full.endsWith('.test.ts')) out.push(full);
    }
    return out;
  }

  it('every user create/update that touches pan goes through panColumns', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const src = readFileSync(file, 'utf8');
      // user.create / user.update / user.upsert blocks
      const blocks = src.match(/\.user\.(?:create|update|upsert)\(\{[\s\S]*?\n\s*\}\);/g) ?? [];
      for (const block of blocks) {
        if (/^\s*pan:\s*(?!null\b)/m.test(block) && !block.includes('panColumns')) {
          offenders.push(relative(SRC, file));
        }
      }
    }
    expect(offenders, `raw User.pan writes in: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('SEC-14: vehicle registration gains an encrypted copy (dual-write)', () => {
  it('produces ciphertext, fingerprint and last-4 alongside the plate', async () => {
    const cols = await registrationNoColumns('MH 47 BT 5950');
    expect(cols.registrationNoEnc).toBeTruthy();
    expect(cols.registrationNoHash).toMatch(/^[0-9a-f]{64}$/);
    expect(cols.registrationNoLast4).toBe('5950');
    // Dual-write: it must NOT null the plate — twenty readers still use it.
    expect('registrationNo' in cols).toBe(false);
  });

  it('decrypts back to the normalised plate', async () => {
    const cols = await registrationNoColumns('mh-47-bt-5950');
    expect(await readRegistrationNo({ registrationNo: null, registrationNoEnc: cols.registrationNoEnc })).toBe(
      'MH47BT5950',
    );
  });

  it('fingerprints spacing and dash variants identically', () => {
    const h = registrationNoHash('MH47BT5950');
    expect(registrationNoHash('mh 47 bt 5950')).toBe(h);
    expect(registrationNoHash('MH-47-BT-5950')).toBe(h);
    expect(normalizeRegistrationNo('mh 47-bt 5950')).toBe('MH47BT5950');
  });
});

describe('SEC-14: plaintext clearing is an explicit operator decision', () => {
  const svc = readFileSync(join(SRC, 'services', 'piiAtRest.service.ts'), 'utf8');

  it('only clears User.pan behind PII_BACKFILL_CLEAR_PLAINTEXT', () => {
    expect(svc).toContain("process.env.PII_BACKFILL_CLEAR_PLAINTEXT === 'true'");
    expect(svc).toContain('pan: clear ? null : row.pan');
  });

  it('never clears Client.pan or the vehicle plate yet', () => {
    expect(svc).toContain('Never clears Client.pan');
    expect(svc).toContain('Never clears the plate');
  });

  it('verifies each ciphertext decrypts before saving it', () => {
    expect(svc.match(/did not read back/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
