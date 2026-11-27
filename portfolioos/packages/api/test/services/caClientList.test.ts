import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import {
  inviteProfessional,
  acceptProfessionalInvitation,
} from '../../src/services/ca/caAccess.service.js';
import {
  currentFilingYear,
  itrDueDate,
  listClientOverview,
  setClientFiling,
  clientOverviewCsv,
} from '../../src/services/ca/caClientList.service.js';

/**
 * The CA's client list, built for a practice of hundreds: search, PAN, where
 * each return stands for the year, its due date, and an export.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function person(label: string): Promise<TestScope & { email: string }> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  const user = await runAsSystem(() =>
    prisma.user.findUniqueOrThrow({ where: { id: scope.userId }, select: { email: true } }),
  );
  return { ...scope, email: user.email };
}

/** `client` grants `ca` access; returns the Client row id. */
async function grant(client: TestScope, ca: TestScope & { email: string }, name: string): Promise<string> {
  await runAsSystem(() => prisma.user.update({ where: { id: client.userId }, data: { name } }));
  const { client: row, token } = await runAsUser(client.userId, () =>
    inviteProfessional(client.userId, { name: 'Our CA', email: ca.email }),
  );
  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.clientFiling.deleteMany({ where: { clientId: row.id } });
      await prisma.caAuditLog.deleteMany({ where: { clientId: row.id } });
      await prisma.client.deleteMany({ where: { id: row.id } });
    });
  });
  await runAsUser(ca.userId, () => acceptProfessionalInvitation(ca.userId, ca.email, token));
  return row.id;
}

describe('filing calendar', () => {
  it('due 31 July, or 31 October when a tax audit applies, after the year ends', () => {
    expect(itrDueDate('2025-26', false)).toBe('2026-07-31');
    expect(itrDueDate('2025-26', true)).toBe('2026-10-31');
  });

  it('the return in season is for the year that ended last March', () => {
    expect(currentFilingYear(new Date('2026-11-27T10:00:00Z'))).toBe('2025-26');
    expect(currentFilingYear(new Date('2026-02-10T10:00:00Z'))).toBe('2024-25');
    expect(currentFilingYear(new Date('2026-04-01T10:00:00Z'))).toBe('2025-26');
  });
});

describe('client overview', () => {
  it('lists active clients with masked PAN, return status and due date; searches and pages', async () => {
    const ca = await person('ccl-ca');
    const asha = await person('ccl-asha');
    const ravi = await person('ccl-ravi');
    await runAsSystem(() => prisma.user.update({ where: { id: asha.userId }, data: { panLast4: '234F' } }));
    const ashaClient = await grant(asha, ca, 'Asha Verma');
    await grant(ravi, ca, 'Ravi Nair');

    const all = await runAsUser(ca.userId, () => listClientOverview(ca.userId, { fy: '2025-26' }));
    expect(all.total).toBe(2);
    const a = all.rows.find((r) => r.clientId === ashaClient)!;
    expect(a.name).toBe('Asha Verma');
    expect(a.panMasked).toBe('XXXXXX234F');
    expect(a.filing).toMatchObject({ status: 'NOT_STARTED', dueDate: '2026-07-31' });
    expect(JSON.stringify(all)).not.toMatch(/inviteToken|panEnc|panHash/);

    const found = await runAsUser(ca.userId, () => listClientOverview(ca.userId, { fy: '2025-26', q: 'ravi' }));
    expect(found.rows.map((r) => r.name)).toEqual(['Ravi Nair']);
    const byPan = await runAsUser(ca.userId, () => listClientOverview(ca.userId, { fy: '2025-26', q: '234f' }));
    expect(byPan.rows.map((r) => r.name)).toEqual(['Asha Verma']);

    const page = await runAsUser(ca.userId, () =>
      listClientOverview(ca.userId, { fy: '2025-26', sort: 'name', page: 2, limit: 1 }),
    );
    expect(page.rows.map((r) => r.name)).toEqual(['Ravi Nair']);
    expect(page.total).toBe(2);
  });

  it('lets the CA set a return status; the client can read it but not change it', async () => {
    const ca = await person('ccl-set-ca');
    const asha = await person('ccl-set-asha');
    const clientId = await grant(asha, ca, 'Asha Verma');

    await runAsUser(ca.userId, () =>
      setClientFiling(ca.userId, clientId, '2025-26', { status: 'FILED', itrForm: 'ITR-2', filedOn: '2026-07-20' }),
    );
    const after = await runAsUser(ca.userId, () =>
      listClientOverview(ca.userId, { fy: '2025-26', status: 'FILED' }),
    );
    expect(after.rows[0]!.filing).toMatchObject({ status: 'FILED', itrForm: 'ITR-2', filedOn: '2026-07-20' });
    expect(after.counts.FILED).toBe(1);

    const seenByClient = await runAsUser(asha.userId, () =>
      prisma.clientFiling.findMany({ where: { clientId } }),
    );
    expect(seenByClient).toHaveLength(1);
    await expect(
      runAsUser(asha.userId, () => setClientFiling(asha.userId, clientId, '2025-26', { status: 'VERIFIED' })),
    ).rejects.toThrow();

    const trail = await runAsSystem(() =>
      prisma.caAuditLog.findMany({ where: { clientId, action: 'FILING_STATUS_CHANGED' } }),
    );
    expect(trail).toHaveLength(1);
    expect(trail[0]!.subjectUserId).toBe(asha.userId);
  });

  it('refuses a CA who does not hold the grant', async () => {
    const ca = await person('ccl-own-ca');
    const other = await person('ccl-other-ca');
    const asha = await person('ccl-own-asha');
    const clientId = await grant(asha, ca, 'Asha Verma');
    await expect(
      runAsUser(other.userId, () => setClientFiling(other.userId, clientId, '2025-26', { status: 'FILED' })),
    ).rejects.toThrow();
    const theirs = await runAsUser(other.userId, () => listClientOverview(other.userId, { fy: '2025-26' }));
    expect(theirs.total).toBe(0);
  });

  it('exports the list as CSV with the PAN masked', async () => {
    const ca = await person('ccl-csv-ca');
    const asha = await person('ccl-csv-asha');
    await runAsSystem(() => prisma.user.update({ where: { id: asha.userId }, data: { panLast4: '234F' } }));
    await grant(asha, ca, 'Asha, Verma');
    const csv = await runAsUser(ca.userId, () => clientOverviewCsv(ca.userId, '2025-26'));
    const [header, row] = csv.trim().split('\n');
    expect(header).toBe('Client,Email,PAN,Access,Return status,ITR form,Due date,Filed on');
    expect(row).toContain('"Asha, Verma"');
    expect(row).toContain('XXXXXX234F');
    expect(row).toContain('Not started');
  });
});
