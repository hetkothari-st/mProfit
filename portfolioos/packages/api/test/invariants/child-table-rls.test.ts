import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';

/**
 * The child tables that reach their owner through a parent: loan repayments,
 * entries against money lent out, credit-card statements, transaction photos.
 *
 * Their parents were protected; they were not, so anything with a valid
 * session could read every user's rows. These tests are worth little against a
 * superuser connection — it bypasses row-level security — so they are written
 * to fail loudly if the suite is ever pointed back at one: user B reading
 * user A's rows must come back empty.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function ownerWithChildren(label: string) {
  const scope = await createTestScope(label);
  const ids = await runAsSystem(async () => {
    const loan = await prisma.loan.create({
      data: {
        userId: scope.userId, lenderName: 'HDFC', loanType: 'HOME', borrowerName: 'Self',
        principalAmount: '1000000', interestRate: '9', tenureMonths: 120, emiAmount: '12000',
        disbursementDate: new Date('2025-04-01'), firstEmiDate: new Date('2025-05-01'),
      },
    });
    const payment = await prisma.loanPayment.create({
      data: { loanId: loan.id, paymentType: 'EMI', paidOn: new Date('2025-05-01'), amount: '12000' },
    });
    const card = await prisma.creditCard.create({
      data: { userId: scope.userId, issuerBank: 'HDFC', cardName: 'Regalia', last4: '4321', creditLimit: '500000', statementDay: 5, dueDay: 25 },
    });
    const statement = await prisma.creditCardStatement.create({
      data: { cardId: card.id, forMonth: '2025-05', statementAmount: '18000', dueDate: new Date('2025-05-25'), status: 'UNPAID' },
    });
    const txn = await prisma.transaction.create({
      data: {
        portfolioId: scope.portfolioId, assetClass: 'EQUITY', transactionType: 'BUY',
        assetName: 'Infosys', assetKey: 'name:Infosys', tradeDate: new Date('2025-05-02'),
        quantity: '10', price: '1500', grossAmount: '15000', netAmount: '15000',
      },
    });
    const photo = await prisma.transactionPhoto.create({
      data: { transactionId: txn.id, filePath: '/data/uploads/note.jpg', fileName: 'note.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 },
    });
    return { loanId: loan.id, paymentId: payment.id, cardId: card.id, statementId: statement.id, photoId: photo.id };
  });

  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.transactionPhoto.deleteMany({ where: { transaction: { portfolioId: scope.portfolioId } } });
      await prisma.creditCardStatement.deleteMany({ where: { card: { userId: scope.userId } } });
      await prisma.creditCard.deleteMany({ where: { userId: scope.userId } });
      await prisma.loanPayment.deleteMany({ where: { loan: { userId: scope.userId } } });
      await prisma.loan.deleteMany({ where: { userId: scope.userId } });
    });
    await scope.cleanup();
  });
  return { scope, ids };
}

describe('invariant: child tables are isolated by their parent owner', () => {
  it('hides one user’s child rows from another, and shows them to the owner', async () => {
    const { scope: owner, ids } = await ownerWithChildren('child-rls-owner');
    const stranger: TestScope = await createTestScope('child-rls-stranger');
    cleanups.push(stranger.cleanup);

    // The owner sees their own rows.
    const mine = await runAsUser(owner.userId, async () => ({
      payments: await prisma.loanPayment.count({ where: { loanId: ids.loanId } }),
      statements: await prisma.creditCardStatement.count({ where: { cardId: ids.cardId } }),
      photos: await prisma.transactionPhoto.count(),
    }));
    expect(mine).toEqual({ payments: 1, statements: 1, photos: 1 });

    // A stranger with a perfectly valid session sees none of it, even asking
    // for the rows by id.
    const theirs = await runAsUser(stranger.userId, async () => ({
      payment: await prisma.loanPayment.findUnique({ where: { id: ids.paymentId } }),
      statement: await prisma.creditCardStatement.findUnique({ where: { id: ids.statementId } }),
      photo: await prisma.transactionPhoto.findUnique({ where: { id: ids.photoId } }),
      allPayments: await prisma.loanPayment.count(),
    }));
    expect(theirs).toEqual({ payment: null, statement: null, photo: null, allPayments: 0 });
  });

  it('refuses a write that would attach a row to someone else’s parent', async () => {
    const { scope: owner, ids } = await ownerWithChildren('child-rls-write');
    const stranger = await createTestScope('child-rls-write-stranger');
    cleanups.push(stranger.cleanup);

    await expect(
      runAsUser(stranger.userId, () =>
        prisma.loanPayment.create({
          data: { loanId: ids.loanId, paymentType: 'EMI', paidOn: new Date('2025-06-01'), amount: '12000' },
        }),
      ),
    ).rejects.toThrow();

    const count = await runAsUser(owner.userId, () => prisma.loanPayment.count({ where: { loanId: ids.loanId } }));
    expect(count).toBe(1);
  });
});
