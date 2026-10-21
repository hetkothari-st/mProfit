import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AI_USE_DISCLOSURE } from '@everypaisa/shared';

// Acknowledgements of the AI-use disclosure are audit rows; the gate reads them back.
type Row = { userId: string | null; action: string; resource: string | null; createdAt: Date };
const rows: Row[] = [];
let failWrites = false;
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    auditLog: {
      findFirst: vi.fn(async ({ where }: { where: { userId: string; action: string; resource: string } }) => {
        const hit = rows
          .filter((r) => r.userId === where.userId && r.action === where.action && r.resource === where.resource)
          .at(-1);
        return hit ? { createdAt: hit.createdAt } : null;
      }),
      create: vi.fn(async ({ data }: { data: Omit<Row, 'createdAt'> }) => {
        if (failWrites) throw new Error('db down');
        const row = { ...data, createdAt: new Date('2026-10-21T10:00:00Z') };
        rows.push(row);
        return row;
      }),
    },
  },
}));
vi.mock('../../src/lib/requestContext.js', () => ({ runAsSystem: (fn: () => unknown) => fn() }));

const { aiDisclosureStatus, acknowledgeAiDisclosure } = await import('../../src/ai/aiDisclosure.js');

beforeEach(() => {
  rows.length = 0;
  failWrites = false;
});

describe('AI use disclosure acknowledgement', () => {
  it('is not acknowledged until the user accepts the current version', async () => {
    expect(await aiDisclosureStatus('u1')).toEqual({
      version: AI_USE_DISCLOSURE.version,
      acknowledged: false,
      acknowledgedAt: null,
    });
  });

  it('records an acknowledgement of the current version as an audit row', async () => {
    await acknowledgeAiDisclosure('u1', AI_USE_DISCLOSURE.version);
    expect(rows).toEqual([
      expect.objectContaining({
        userId: 'u1',
        action: 'ai_disclosure_acknowledged',
        resource: `AiDisclosure:${AI_USE_DISCLOSURE.version}`,
      }),
    ]);
    expect(await aiDisclosureStatus('u1')).toMatchObject({ acknowledged: true });
    expect(await aiDisclosureStatus('u2')).toMatchObject({ acknowledged: false });
  });

  it('an acknowledgement of an older version does not count', async () => {
    rows.push({ userId: 'u1', action: 'ai_disclosure_acknowledged', resource: 'AiDisclosure:2020-01-01', createdAt: new Date() });
    expect(await aiDisclosureStatus('u1')).toMatchObject({ acknowledged: false });
  });

  it('refuses to record a version other than the current one', async () => {
    await expect(acknowledgeAiDisclosure('u1', '2020-01-01')).rejects.toThrow(/current/);
    expect(rows).toHaveLength(0);
  });

  it('surfaces a failed write instead of silently leaving the user gated', async () => {
    failWrites = true;
    await expect(acknowledgeAiDisclosure('u1', AI_USE_DISCLOSURE.version)).rejects.toThrow('db down');
  });
});
