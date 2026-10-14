import { describe, it, expect, beforeAll } from 'vitest';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

let a: TestScope;
let b: TestScope;
beforeAll(async () => {
  a = await createTestScope('sorter-a');
  b = await createTestScope('sorter-b');
});

describe('DocumentPerson schema', () => {
  it('is unique per (userId, nameKey)', async () => {
    await a.runAs(() => prisma.documentPerson.create({ data: { userId: a.userId, displayName: 'Het Kothari', nameKey: 'het kothari' } }));
    await expect(
      a.runAs(() => prisma.documentPerson.create({ data: { userId: a.userId, displayName: 'Kothari Het', nameKey: 'het kothari' } })),
    ).rejects.toThrow();
  });
  it('is invisible to another user (RLS)', async () => {
    const seen = await b.runAs(() => prisma.documentPerson.findMany({ where: { userId: a.userId } }));
    expect(seen).toHaveLength(0);
  });
  it('Document accepts PERSON_DOCS + sort columns, contentHash unique per user', async () => {
    const mk = (hash: string) =>
      a.runAs(() =>
        prisma.document.create({
          data: {
            userId: a.userId, ownerType: 'PERSON_DOCS', ownerId: a.userId, fileName: 'x.pdf', mimeType: 'application/pdf',
            sizeBytes: 1, storageKey: `k-${hash}-${Math.random()}`, externalEditKey: `e-${hash}-${Math.random()}`,
            contentHash: hash, sortStatus: 'PROCESSING',
          },
        }),
      );
    await mk('h1');
    await expect(mk('h1')).rejects.toThrow();
    await runAsSystem(() => prisma.document.deleteMany({ where: { userId: a.userId } }));
  });
});
