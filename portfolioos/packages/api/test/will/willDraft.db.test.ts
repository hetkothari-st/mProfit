import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { emptyWillPayload } from '@everypaisa/shared';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import {
  createWillDraft, discardWillDraft, getWillDraft, getWillOverview, listWillPeopleSuggestions,
  refreshWillEstate, saveWillSection,
} from '../../src/services/will/will.service.js';
import type { EstateCandidate } from '../../src/services/will/estate/types.js';
import { sealWillPayload } from '../../src/services/will/willStore.js';
import { TODAY, validWillPayload } from './willFixtures.js';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const bank: EstateCandidate = {
  sourceKey: 'bank:1', side: 'ASSET', kind: 'BANK_ACCOUNT', label: 'Test bank account', ref: 'XXXX0001',
  value: '100.00', valueAsOf: TODAY, ownership: { type: 'SOLE', sharePct: '100' }, review: 'NEEDS_REVIEW', note: null,
};
const deps = { collect: async () => ({ candidates: [bank], failed: [] }), today: () => TODAY };

let a: TestScope;
let b: TestScope;
let draftId = '';

beforeAll(async () => {
  a = await createTestScope('will-draft-a');
  b = await createTestScope('will-draft-b');
});
afterAll(async () => {
  await runAsSystem(async () => {
    await prisma.family.deleteMany({ where: { createdById: a.userId } });
    await prisma.willVersion.deleteMany({ where: { userId: { in: [a.userId, b.userId] } } });
    await prisma.will.deleteMany({ where: { userId: { in: [a.userId, b.userId] } } });
  });
  await a.cleanup();
  await b.cleanup();
});

describe('will drafts', () => {
  it('creates an empty draft at version 1, step 2', async () => {
    const d = await a.runAs(() => createWillDraft(a.userId, null));
    draftId = d.id;
    expect(d).toMatchObject({ version: 1, revision: 0, currentStep: 2 });
    expect(d.payload).toEqual(emptyWillPayload());
    expect(d.findings.some((f) => f.ruleId === 'REQUIRED_FIELDS')).toBe(true);
  });

  it('refuses a second draft and names the first', async () => {
    await expect(a.runAs(() => createWillDraft(a.userId, null))).rejects.toMatchObject({
      statusCode: 409, details: { reason: 'WILL_DRAFT_EXISTS', draftId },
    });
  });

  it('saves a section, bumps the revision and seals the payload at rest', async () => {
    const res = await a.runAs(() =>
      saveWillSection(a.userId, draftId, 'details', { revision: 0, currentStep: 3, data: validWillPayload().details }),
    );
    expect(res.revision).toBe(1);
    const back = await a.runAs(() => getWillDraft(a.userId, draftId, deps));
    expect(back.payload.details.legalName).toBe('Ramesh Kumar Verma');
    expect(back.currentStep).toBe(3);
    const raw = await runAsSystem(() => prisma.will.findUniqueOrThrow({ where: { id: draftId } }));
    expect(Buffer.from(raw.payload).includes(Buffer.from('Ramesh'))).toBe(false);
  });

  it('stale revision is refused', async () => {
    await expect(
      a.runAs(() => saveWillSection(a.userId, draftId, 'instructions', { revision: 0, currentStep: 6, data: { text: 'x' } })),
    ).rejects.toMatchObject({ statusCode: 409, details: { reason: 'WILL_REVISION_CONFLICT', revision: 1 } });
  });

  it('invalid data is a 422 listing paths and codes only', async () => {
    const err = await a
      .runAs(() =>
        saveWillSection(a.userId, draftId, 'details', {
          revision: 1, currentStep: 2, data: { legalName: 'Q'.repeat(200), dob: 'not-a-date' },
        }),
      )
      .catch((e: unknown) => e as { statusCode: number; details: { issues: Array<{ path: string; code: string }> } });
    expect(err.statusCode).toBe(422);
    expect(err.details.issues).toEqual(
      expect.arrayContaining([{ path: 'legalName', code: 'too_big' }, { path: 'dob', code: 'invalid_format' }]),
    );
    expect(JSON.stringify(err.details)).not.toContain('not-a-date');
  });

  it('another user cannot read or write it', async () => {
    await expect(b.runAs(() => getWillDraft(b.userId, draftId, deps))).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      b.runAs(() => saveWillSection(b.userId, draftId, 'instructions', { revision: 1, currentStep: 6, data: { text: 'x' } })),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refreshes the estate through the injected collector', async () => {
    const r = await a.runAs(() =>
      refreshWillEstate(a.userId, draftId, 1, { collect: async () => ({ candidates: [bank], failed: ['vehicles'] }), today: () => TODAY }),
    );
    expect(r.revision).toBe(2);
    expect(r.estate).toMatchObject({ asOf: TODAY, failedSources: ['vehicles'] });
    expect(r.estate.items).toEqual([{ ...bank, userEdited: false }]);
  });

  it('discards a draft; the next draft takes the next version number', async () => {
    await a.runAs(() => discardWillDraft(a.userId, draftId));
    await expect(a.runAs(() => getWillDraft(a.userId, draftId, deps))).rejects.toMatchObject({ statusCode: 409 });
    const next = await a.runAs(() => createWillDraft(a.userId, null));
    expect(next.version).toBe(2);
    draftId = next.id;
  });

  it('starts a new version from a generated will, carrying its content', async () => {
    await a.runAs(() => saveWillSection(a.userId, draftId, 'instructions', { revision: 0, currentStep: 6, data: { text: 'Keep the house' } }));
    await runAsSystem(() => prisma.will.update({ where: { id: draftId }, data: { status: 'GENERATED' } }));
    const clone = await a.runAs(() => createWillDraft(a.userId, draftId));
    expect(clone.version).toBe(3);
    expect(clone.payload.instructions.text).toBe('Keep the house');
    const overview = await a.runAs(() => getWillOverview(a.userId, deps));
    expect(overview.status).toBe('GENERATED');
    expect(overview.draft).toMatchObject({ id: clone.id, version: 3, currentStep: 2 });
    expect(overview.estate).toEqual({ assets: '100.0000', liabilities: '0.0000', net: '100.0000', nomineeOnly: '0.0000' });
  });

  it('suggests members of the user\'s families with their relation to the user', async () => {
    await runAsSystem(async () => {
      await prisma.user.update({ where: { id: b.userId }, data: { dob: new Date('1999-05-05T00:00:00Z') } });
      const family = await prisma.family.create({ data: { name: 'Test family', createdById: a.userId } });
      await prisma.familyMember.create({ data: { familyId: family.id, userId: a.userId, role: 'OWNER' } });
      await prisma.familyMember.create({ data: { familyId: family.id, userId: b.userId, relation: 'Son', relatedToId: a.userId } });
    });
    const s = await a.runAs(() => listWillPeopleSuggestions(a.userId));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ userId: b.userId, relation: 'Son', relationship: 'SON', dob: '1999-05-05' });
  });
});

describe('draft edge cases (final fix wave)', () => {
  let c: TestScope;
  beforeAll(async () => {
    c = await createTestScope('will-draft-c');
  });
  afterEach(async () => {
    await runAsSystem(() => prisma.will.deleteMany({ where: { userId: c.userId } }));
  });
  afterAll(async () => {
    await c.cleanup();
  });

  it('names the existing draft and its step on every draft-exists conflict, even a create race', async () => {
    const results = await Promise.allSettled([0, 1, 2].map(() => c.runAs(() => createWillDraft(c.userId, null))));
    const won = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof createWillDraft>>> => r.status === 'fulfilled');
    expect(won).toHaveLength(1);
    for (const r of results) {
      if (r.status === 'rejected') {
        expect(r.reason).toMatchObject({ statusCode: 409, details: { reason: 'WILL_DRAFT_EXISTS', draftId: won[0]!.value.id, currentStep: 2 } });
      }
    }
  });

  it('a draft discarded while a save is in flight answers WILL_NOT_DRAFT, not a revision conflict', async () => {
    const d = await c.runAs(() => createWillDraft(c.userId, null));
    const discardMidway = {
      today: () => TODAY,
      collect: async () => {
        await runAsSystem(() => prisma.will.update({ where: { id: d.id }, data: { status: 'DISCARDED' } }));
        return { candidates: [bank], failed: [] };
      },
    };
    await expect(c.runAs(() => refreshWillEstate(c.userId, d.id, 0, discardMidway))).rejects.toMatchObject({
      statusCode: 409, details: { reason: 'WILL_NOT_DRAFT' },
    });
  });

  it('cloning another user\'s will is a 404', async () => {
    const other = await a.runAs(() => prisma.will.findFirstOrThrow({ where: { userId: a.userId }, select: { id: true } }));
    await expect(c.runAs(() => createWillDraft(c.userId, other.id))).rejects.toMatchObject({ statusCode: 404 });
  });

  it('an unreadable stored payload is a fixed 500 that echoes nothing', async () => {
    const d = await c.runAs(() => createWillDraft(c.userId, null));
    const broken = { ...emptyWillPayload(), details: { legalName: 'Zzyzx Secretname', dob: 'not-a-date' } } as unknown as Parameters<typeof sealWillPayload>[2];
    const sealed = await sealWillPayload(c.userId, d.id, broken);
    await runAsSystem(() => prisma.will.update({ where: { id: d.id }, data: { payload: sealed } }));
    const err = await c.runAs(() => getWillDraft(c.userId, d.id, deps)).catch((e: unknown) => e);
    expect(err).toMatchObject({ statusCode: 500, code: 'WILL_PAYLOAD_UNREADABLE' });
    expect(JSON.stringify({ m: (err as Error).message, d: (err as { details?: unknown }).details })).not.toContain('Zzyzx');
  });
});
