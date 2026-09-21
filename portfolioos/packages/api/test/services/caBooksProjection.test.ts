import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import {
  generateVouchersFromActivity,
  listVouchers,
} from '../../src/services/accounting.service.js';

/**
 * The projection a CA's books tab runs before it reads.
 *
 * `generateVouchersFromActivity` is not additive: auto-generated vouchers it
 * cannot re-derive are DELETED. It runs under whoever opened the tab, and on
 * the CA path that is the CA, not the client. Any source of activity the CA's
 * policies do not reach therefore reads as "this never happened", and the
 * client's vouchers for it are removed from their own ledger.
 *
 * So the question these ask is not "can a CA see vouchers" but "does a CA
 * opening the tab leave the client's books exactly as the client's own visit
 * would". Same client, same activity, two identities, one answer.
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

async function grant(advisorId: string, clientUserId: string) {
  const client = await runAsSystem(() =>
    prisma.client.create({
      data: {
        advisorId,
        userId: clientUserId,
        name: 'Books Client',
        kind: 'INVITED',
        status: 'ACTIVE',
        acceptedAt: new Date(),
      },
    }),
  );
  cleanups.push(async () => {
    await runAsSystem(() => prisma.client.deleteMany({ where: { id: client.id } }));
  });
  return client;
}

/**
 * A client whose activity spans the generator's sources: a trade, a loan EMI,
 * a rent receipt and an insurance premium. Each produces its own AUTO- voucher.
 */
async function clientWithActivity(label: string) {
  const scope = await person(label);
  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.voucherEntry.deleteMany({ where: { voucher: { userId: scope.userId } } });
      await prisma.voucher.deleteMany({ where: { userId: scope.userId } });
      await prisma.account.deleteMany({ where: { userId: scope.userId } });
      await prisma.rentReceipt.deleteMany({
        where: { tenancy: { property: { userId: scope.userId } } },
      });
      await prisma.tenancy.deleteMany({ where: { property: { userId: scope.userId } } });
      await prisma.rentalProperty.deleteMany({ where: { userId: scope.userId } });
      await prisma.premiumPayment.deleteMany({ where: { policy: { userId: scope.userId } } });
      await prisma.insurancePolicy.deleteMany({ where: { userId: scope.userId } });
      await prisma.loanPayment.deleteMany({ where: { loan: { userId: scope.userId } } });
      await prisma.loan.deleteMany({ where: { userId: scope.userId } });
    });
  });

  await runAsSystem(async () => {
    await prisma.transaction.create({
      data: {
        portfolioId: scope.portfolioId,
        assetClass: 'EQUITY',
        transactionType: 'BUY',
        assetName: 'Infosys',
        assetKey: 'name:Infosys',
        tradeDate: new Date('2025-05-02'),
        quantity: '10',
        price: '1500',
        grossAmount: '15000',
        netAmount: '15000',
      },
    });

    const loan = await prisma.loan.create({
      data: {
        userId: scope.userId, lenderName: 'HDFC', loanType: 'HOME', borrowerName: 'Self',
        principalAmount: '1000000', interestRate: '9', tenureMonths: 120, emiAmount: '12000',
        disbursementDate: new Date('2025-04-01'), firstEmiDate: new Date('2025-05-01'),
      },
    });
    await prisma.loanPayment.create({
      data: { loanId: loan.id, paymentType: 'EMI', paidOn: new Date('2025-05-01'), amount: '12000' },
    });

    const property = await prisma.rentalProperty.create({
      data: { userId: scope.userId, name: 'Andheri flat', propertyType: 'RESIDENTIAL' },
    });
    const tenancy = await prisma.tenancy.create({
      data: {
        propertyId: property.id, tenantName: 'Rajesh', startDate: new Date('2025-04-01'),
        monthlyRent: '45000', rentDueDay: 1,
      },
    });
    await prisma.rentReceipt.create({
      data: {
        tenancyId: tenancy.id, forMonth: '2025-05', expectedAmount: '45000',
        receivedAmount: '45000', dueDate: new Date('2025-05-01'),
        receivedOn: new Date('2025-05-02'), status: 'RECEIVED',
      },
    });

    const policy = await prisma.insurancePolicy.create({
      data: {
        userId: scope.userId, insurer: 'LIC', policyNumber: 'POL-1', type: 'TERM',
        policyHolder: 'Self', sumAssured: '5000000', premiumAmount: '18000',
        premiumFrequency: 'ANNUAL', startDate: new Date('2025-04-01'),
      },
    });
    await prisma.premiumPayment.create({
      data: {
        policyId: policy.id, paidOn: new Date('2025-05-10'), amount: '18000',
        periodFrom: new Date('2025-04-01'), periodTo: new Date('2026-03-31'),
      },
    });
  });

  return scope;
}

describe('a CA opening their client’s books', () => {
  it('projects the same vouchers the client’s own visit would', async () => {
    const client = await clientWithActivity('ca-proj-client');
    const ca = await person('ca-proj-advisor');
    await grant(ca.userId, client.userId);

    // What the client's own page produces — the baseline.
    const mine = await runAsUser(client.userId, () =>
      generateVouchersFromActivity(client.userId),
    );
    const before = await runAsUser(client.userId, () => listVouchers(client.userId, {}));
    expect(before.total).toBeGreaterThan(0);

    // The CA opens the books tab. Same client, same activity, CA's identity.
    const theirs = await runAsUser(ca.userId, () =>
      generateVouchersFromActivity(client.userId),
    );

    // Nothing may be deleted: a voucher the client can derive and the CA
    // cannot is a voucher the CA's visit silently destroys.
    expect(theirs.removed).toBe(0);
    expect(theirs.total).toBe(mine.total);

    const after = await runAsUser(client.userId, () => listVouchers(client.userId, {}));
    expect(after.total).toBe(before.total);
    expect(after.vouchers.map((v) => v.voucherNo).sort()).toEqual(
      before.vouchers.map((v) => v.voucherNo).sort(),
    );
  });

  it('shows the client’s vouchers in the CA’s own list', async () => {
    const client = await clientWithActivity('ca-list-client');
    const ca = await person('ca-list-advisor');
    await grant(ca.userId, client.userId);

    await runAsUser(client.userId, () => generateVouchersFromActivity(client.userId));

    const seen = await runAsUser(ca.userId, () => listVouchers(client.userId, {}));
    expect(seen.total).toBeGreaterThan(0);
    expect(seen.vouchers.every((v) => v.entries.length > 0)).toBe(true);
  });
});
