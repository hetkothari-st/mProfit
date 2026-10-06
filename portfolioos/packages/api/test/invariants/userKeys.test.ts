import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { forgetUserDek, getUserDek, openForUser, sealForUser } from '../../src/lib/userKeys.js';
import { readBuffer, saveBuffer, sealLegacyBlobs } from '../../src/lib/documentStorage.js';

/**
 * Per-user data keys (envelope encryption) and the vault files sealed with
 * them. Runs against the NOBYPASSRLS app role.
 */
describe('per-user data keys', () => {
  let a: TestScope;
  let b: TestScope;
  const PLAIN = Buffer.from('%PDF-1.7 CAS statement for TEST USER, folio 12345678');

  beforeAll(async () => {
    a = await createTestScope('keys-a');
    b = await createTestScope('keys-b');
  });

  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.documentBlob.deleteMany({ where: { userId: { in: [a.userId, b.userId] } } });
      await prisma.userDataKey.deleteMany({ where: { userId: { in: [a.userId, b.userId] } } });
    });
    await b.cleanup();
    await a.cleanup();
  });

  it('creates one key per user, even when first use races', async () => {
    forgetUserDek(a.userId);
    const keys = await Promise.all([1, 2, 3, 4, 5].map(() => getUserDek(a.userId)));
    expect(new Set(keys.map((k) => k.toString('hex'))).size).toBe(1);
    const rows = await runAsSystem(() => prisma.userDataKey.count({ where: { userId: a.userId } }));
    expect(rows).toBe(1);
  });

  it('stores the key only wrapped, and users cannot read the key table', async () => {
    const dek = await getUserDek(a.userId);
    const row = await runAsSystem(() => prisma.userDataKey.findUniqueOrThrow({ where: { userId: a.userId } }));
    expect(row.wrappedKey).not.toContain(dek.toString('base64'));
    const seen = await a.runAs(() => prisma.userDataKey.findUnique({ where: { userId: a.userId } }));
    expect(seen).toBeNull();
  });

  it('a sealed buffer opens only for its owner and slot', async () => {
    const sealed = await sealForUser(a.userId, 'slot-1', PLAIN);
    expect(sealed.includes(PLAIN)).toBe(false);
    expect((await openForUser(a.userId, 'slot-1', sealed)).equals(PLAIN)).toBe(true);
    await expect(openForUser(b.userId, 'slot-1', sealed)).rejects.toThrow();
    await expect(openForUser(a.userId, 'slot-2', sealed)).rejects.toThrow();
  });

  it('vault files are stored sealed and read back intact', async () => {
    await saveBuffer(a.userId, 'k-new.pdf', PLAIN);
    const row = await runAsSystem(() => prisma.documentBlob.findUniqueOrThrow({ where: { storageKey: 'k-new.pdf' } }));
    expect(row.keyed).toBe(true);
    expect(Buffer.from(row.data).includes(PLAIN)).toBe(false);
    expect((await readBuffer(a.userId, 'k-new.pdf')).equals(PLAIN)).toBe(true);
  });

  it('the backfill seals files stored before keys existed', async () => {
    await runAsSystem(() =>
      prisma.documentBlob.create({ data: { storageKey: 'k-legacy.pdf', userId: a.userId, data: PLAIN } }),
    );
    const r = await sealLegacyBlobs();
    expect(r.failed).toBe(0);
    const row = await runAsSystem(() =>
      prisma.documentBlob.findUniqueOrThrow({ where: { storageKey: 'k-legacy.pdf' } }),
    );
    expect(row.keyed).toBe(true);
    expect((await readBuffer(a.userId, 'k-legacy.pdf')).equals(PLAIN)).toBe(true);
  });

  it('deleting the key makes the user’s files unreadable (crypto-shredding)', async () => {
    await saveBuffer(b.userId, 'k-shred.pdf', PLAIN);
    await runAsSystem(() => prisma.userDataKey.delete({ where: { userId: b.userId } }));
    forgetUserDek(b.userId);
    await expect(readBuffer(b.userId, 'k-shred.pdf')).rejects.toThrow();
  });
});
