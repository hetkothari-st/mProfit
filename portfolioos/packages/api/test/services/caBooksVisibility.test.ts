import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import {
  ensureDefaultAccounts,
  listAccountsFlat,
  listVouchers,
  createVoucher,
  getTrialBalance,
} from '../../src/services/accounting.service.js';

/**
 * A client's books, read by their CA.
 *
 * The CA never becomes the client: every read runs under the CA's own
 * identity and reaches the client's rows through `voucher_ca_access` and its
 * siblings. This asserts that path end to end — the books tab showed nothing
 * against a client who plainly had vouchers.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function person(label: string): Promise<TestScope> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
  return scope;
}

async function grant(advisorId: string, clientUserId: string, status: 'ACTIVE' | 'REVOKED' = 'ACTIVE') {
  const client = await runAsSystem(() =>
    prisma.client.create({
      data: {
        advisorId,
        userId: clientUserId,
        name: 'Test Client',
        kind: 'INVITED',
        status,
        acceptedAt: new Date(),
      },
    }),
  );
  cleanups.push(async () => {
    await runAsSystem(() => prisma.client.deleteMany({ where: { id: client.id } }));
  });
  return client;
}

/** A client with a chart and one posted voucher, exactly as their own page leaves it. */
async function clientWithBooks(label: string) {
  const scope = await person(label);
  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.voucherEntry.deleteMany({ where: { voucher: { userId: scope.userId } } });
      await prisma.voucher.deleteMany({ where: { userId: scope.userId } });
      await prisma.account.deleteMany({ where: { userId: scope.userId } });
    });
  });

  await runAsUser(scope.userId, async () => {
    await ensureDefaultAccounts(scope.userId);
    const accounts = await listAccountsFlat(scope.userId);
    const debit = accounts.find((a) => a.type === 'ASSET')!;
    const credit = accounts.find((a) => a.type === 'INCOME')!;
    await createVoucher(scope.userId, {
      type: 'RECEIPT',
      voucherNo: 'RCPT-TEST-1',
      date: '2025-06-01',
      narration: 'Rent received',
      entries: [
        {
          debitAccountId: debit.id,
          creditAccountId: credit.id,
          amount: '45000',
          narration: 'June rent',
        },
      ],
    });
  });

  return scope;
}

describe('a CA reading their client’s books', () => {
  it('sees the vouchers the client already has', async () => {
    const client = await clientWithBooks('ca-books-client');
    const ca = await person('ca-books-advisor');
    await grant(ca.userId, client.userId);

    // The CA's own identity throughout — this is the real request shape.
    const page = await runAsUser(ca.userId, () => listVouchers(client.userId, {}));
    expect(page.total).toBe(1);
    expect(page.vouchers[0]!.voucherNo).toBe('RCPT-TEST-1');
    // The entries are what carry the money; an empty leg list is the same
    // bug one table lower down.
    expect(page.vouchers[0]!.entries).toHaveLength(1);
  });

  it('sees the accounts and a trial balance that is not all zeroes', async () => {
    const client = await clientWithBooks('ca-tb-client');
    const ca = await person('ca-tb-advisor');
    await grant(ca.userId, client.userId);

    const accounts = await runAsUser(ca.userId, () => listAccountsFlat(client.userId));
    expect(accounts.length).toBeGreaterThan(0);

    const tb = await runAsUser(ca.userId, () => getTrialBalance(client.userId));
    const movement = tb.reduce(
      (sum, r) => sum + Number(r.totalDebit) + Number(r.totalCredit),
      0,
    );
    expect(movement).toBeGreaterThan(0);
  });

  it('shows nothing once the grant is revoked', async () => {
    const client = await clientWithBooks('ca-revoked-client');
    const ca = await person('ca-revoked-advisor');
    await grant(ca.userId, client.userId, 'REVOKED');

    const page = await runAsUser(ca.userId, () => listVouchers(client.userId, {}));
    expect(page.total).toBe(0);
  });
});
