import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';

/**
 * SEC-11 — refresh tokens were stored in plaintext.
 *
 * A database dump yielded a directly usable session for every user.
 * ExtensionPairing in the same schema already stored only SHA-256(bearer).
 * PasswordResetToken is out of scope: since PR #91 it stores an HMAC of the
 * emailed code, and must not be hashed a second time.
 *
 * Also covers refresh-token reuse detection: presenting a rotated-out token
 * used to just error, leaving whichever party refreshed first with a silently
 * rotating session.
 */

const ROOT = join(__dirname, '..', '..');
const svc = readFileSync(join(ROOT, 'src', 'services', 'auth.service.ts'), 'utf8');
const schema = readFileSync(join(ROOT, 'prisma', 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(ROOT, 'prisma', 'migrations', '20260918110000_hash_session_tokens', 'migration.sql'),
  'utf8',
);

describe('SEC-11: tokens are stored and looked up by digest', () => {
  it('never writes a plaintext token on create', () => {
    for (const model of ['refreshToken']) {
      const at = svc.indexOf(`prisma.${model}.create({`);
      expect(at, `${model}.create present`).toBeGreaterThan(-1);
      const block = svc.slice(at, svc.indexOf('});', at));
      expect(block).toContain('tokenHash: digestToken(');
      expect(block).not.toMatch(/^\s*token[,:]/m);
    }
  });

  it('never looks a refresh token up by its plaintext', () => {
    expect(svc).not.toMatch(/refreshToken\.\w+\(\{\s*where:\s*\{\s*token[\s,:}]/);
    expect(svc).toContain('where: { tokenHash: digestToken(refreshToken) }');
  });

  it('the schema makes tokenHash the unique lookup key', () => {
    for (const model of ['RefreshToken']) {
      const body = schema.slice(schema.indexOf(`model ${model} {`));
      const block = body.slice(0, body.indexOf('\n}'));
      expect(block).toMatch(/tokenHash\s+String\s+@unique/);
      expect(block).toMatch(/token\s+String\?\s+@unique/);
    }
  });
});

describe('SEC-11: the migration preserves live sessions and is non-destructive', () => {
  it('leaves PasswordResetToken alone — it already holds an HMAC', () => {
    const statements = migration
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    expect(statements).not.toContain('PasswordResetToken');
  });

  it('backfills a digest for every existing token before requiring it', () => {
    const backfill = migration.indexOf('SET "tokenHash" = encode(sha256(');
    const notNull = migration.indexOf('ALTER COLUMN "tokenHash" SET NOT NULL');
    expect(backfill).toBeGreaterThan(-1);
    expect(notNull).toBeGreaterThan(backfill);
  });

  it('computes the same digest in SQL as the application does', () => {
    // encode(sha256(convert_to(token,'UTF8')),'hex') must equal digestToken().
    // Both are lowercase hex SHA-256 of the UTF-8 bytes.
    const token = crypto.randomBytes(32).toString('hex');
    const app = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
    expect(app).toMatch(/^[0-9a-f]{64}$/);
    expect(migration).toContain("convert_to(\"token\", 'UTF8')");
    expect(migration).toContain("'hex'");
  });

  it('does not drop or clear any column without approval (CLAUDE.md §0.4)', () => {
    const statements = migration
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    expect(statements).not.toMatch(/DROP\s+COLUMN/i);
    expect(statements).not.toMatch(/DROP\s+TABLE/i);
    expect(statements).not.toMatch(/SET\s+"token"\s*=\s*NULL/i);
  });
});

describe('SEC-11: refresh-token reuse revokes the whole session family', () => {
  it('treats a revoked-but-unexpired token as reuse', () => {
    const fn = svc.slice(svc.indexOf('export async function refreshSession'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('if (stored.revokedAt)');
    expect(body).toContain('await logoutAllSessions(stored.userId)');
  });

  it('checks expiry separately so an old expired token does not nuke sessions', () => {
    const fn = svc.slice(svc.indexOf('export async function refreshSession'));
    const expiry = fn.indexOf('stored.expiresAt < new Date()');
    const reuse = fn.indexOf('if (stored.revokedAt)');
    expect(expiry).toBeGreaterThan(-1);
    expect(reuse).toBeGreaterThan(expiry);
  });
});
