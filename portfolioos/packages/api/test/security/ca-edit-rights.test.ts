import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import {
  inviteProfessional,
  acceptProfessionalInvitation,
  updateGrantScope,
  getCaScope,
} from '../../src/services/ca/caAccess.service.js';

/**
 * Looking and changing, separated.
 *
 * A new grant reads and nothing more. These drive Prisma directly as the
 * professional, so what is proven is a Postgres fact rather than a controller
 * remembering to check — the controller check exists too, but only so the
 * refusal is a sentence instead of a 42501.
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

/** A client who has invited a professional, and that professional. */
async function relationship(label: string) {
  const client = await person(`${label}-client`);
  const pro = await person(`${label}-pro`);

  const { client: row, token } = await runAsUser(client.userId, () =>
    inviteProfessional(client.userId, { name: 'Their CA', email: pro.email }),
  );
  await runAsUser(pro.userId, () => acceptProfessionalInvitation(pro.userId, pro.email, token));

  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.voucherEntry.deleteMany({ where: { voucher: { userId: client.userId } } });
      await prisma.voucher.deleteMany({ where: { userId: client.userId } });
      await prisma.account.deleteMany({ where: { userId: client.userId } });
      await prisma.caAuditLog.deleteMany({ where: { clientId: row.id } });
      await prisma.client.deleteMany({ where: { id: row.id } });
    });
  });

  return { client, pro, clientId: row.id };
}

describe('a grant as it arrives', () => {
  it('reads everything and changes nothing', async () => {
    const { client, pro, clientId } = await relationship('edit-default');

    const scope = await runAsUser(pro.userId, () => getCaScope(pro.userId, clientId));
    expect(scope.edit).toEqual({
      books: false,
      transactions: false,
      imports: false,
      fmv: false,
    });

    // Reading is unaffected.
    const portfolios = await runAsUser(pro.userId, () =>
      prisma.portfolio.count({ where: { userId: client.userId } }),
    );
    expect(portfolios).toBe(1);

    // Writing is refused by the database, on every surface.
    await expect(
      runAsUser(pro.userId, () =>
        prisma.account.create({
          data: { userId: client.userId, code: '9999', name: 'Sneaky', type: 'EXPENSE' },
        }),
      ),
    ).rejects.toThrow();

    await expect(
      runAsUser(pro.userId, () =>
        prisma.transaction.create({
          data: {
            portfolioId: client.portfolioId, assetClass: 'EQUITY', transactionType: 'BUY',
            assetName: 'Uninvited', assetKey: 'name:Uninvited', tradeDate: new Date('2025-05-02'),
            quantity: '1', price: '10', grossAmount: '10', netAmount: '10',
          },
        }),
      ),
    ).rejects.toThrow();

    await expect(
      runAsUser(pro.userId, () =>
        prisma.fmvOverride.create({
          data: { userId: client.userId, isin: 'INE009A01021', fmv: '100', asOf: new Date('2018-01-31') },
        }),
      ),
    ).rejects.toThrow();
  });
});

describe('a grant the client has opened up', () => {
  it('lets them keep the books once books are allowed, and still nothing else', async () => {
    const { client, pro, clientId } = await relationship('edit-books');

    await runAsUser(client.userId, () =>
      updateGrantScope(client.userId, clientId, { edit: { books: true } }),
    );

    const account = await runAsUser(pro.userId, () =>
      prisma.account.create({
        data: { userId: client.userId, code: '4999', name: 'Consulting income', type: 'INCOME' },
      }),
    );
    expect(account.userId).toBe(client.userId);

    // Transactions were not part of that permission.
    await expect(
      runAsUser(pro.userId, () =>
        prisma.transaction.create({
          data: {
            portfolioId: client.portfolioId, assetClass: 'EQUITY', transactionType: 'BUY',
            assetName: 'Still uninvited', assetKey: 'name:Still', tradeDate: new Date('2025-05-02'),
            quantity: '1', price: '10', grossAmount: '10', netAmount: '10',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('lets them correct trades once transactions are allowed', async () => {
    const { client, pro, clientId } = await relationship('edit-txns');

    const txId = await runAsSystem(async () => {
      const tx = await prisma.transaction.create({
        data: {
          portfolioId: client.portfolioId, assetClass: 'EQUITY', transactionType: 'BUY',
          assetName: 'Infosys', assetKey: 'name:Infosys', tradeDate: new Date('2025-05-02'),
          quantity: '10', price: '1500', grossAmount: '15000', netAmount: '15000',
        },
      });
      return tx.id;
    });

    await expect(
      runAsUser(pro.userId, () =>
        prisma.transaction.update({ where: { id: txId }, data: { narration: 'Corrected' } }),
      ),
    ).rejects.toThrow();

    await runAsUser(client.userId, () =>
      updateGrantScope(client.userId, clientId, { edit: { transactions: true } }),
    );

    const updated = await runAsUser(pro.userId, () =>
      prisma.transaction.update({ where: { id: txId }, data: { narration: 'Corrected' } }),
    );
    expect(updated.narration).toBe('Corrected');

    // Still never a delete: no policy grants one, at any setting.
    await expect(
      runAsUser(pro.userId, () => prisma.transaction.delete({ where: { id: txId } })),
    ).rejects.toThrow();
  });

  it('can be closed again, and the writing stops', async () => {
    const { client, pro, clientId } = await relationship('edit-close');

    await runAsUser(client.userId, () =>
      updateGrantScope(client.userId, clientId, { edit: { books: true } }),
    );
    await runAsUser(pro.userId, () =>
      prisma.account.create({
        data: { userId: client.userId, code: '4998', name: 'While allowed', type: 'INCOME' },
      }),
    );

    await runAsUser(client.userId, () =>
      updateGrantScope(client.userId, clientId, { edit: { books: false } }),
    );

    await expect(
      runAsUser(pro.userId, () =>
        prisma.account.create({
          data: { userId: client.userId, code: '4997', name: 'After', type: 'INCOME' },
        }),
      ),
    ).rejects.toThrow();

    // And what they already posted stays readable to them.
    const seen = await runAsUser(pro.userId, () =>
      prisma.account.count({ where: { userId: client.userId } }),
    );
    expect(seen).toBeGreaterThan(0);
  });

  it('stops at the window even with every switch on', async () => {
    const { client, pro, clientId } = await relationship('edit-window');

    await runAsUser(client.userId, () =>
      updateGrantScope(client.userId, clientId, {
        edit: { books: true, transactions: true, imports: true, fmv: true },
        accessUntil: '2020-01-01',
      }),
    );

    await expect(
      runAsUser(pro.userId, () =>
        prisma.account.create({
          data: { userId: client.userId, code: '4996', name: 'Expired', type: 'INCOME' },
        }),
      ),
    ).rejects.toThrow();
  });
});

describe('what the professional’s own workspace is told', () => {
  it('carries the switches on the client list, so it can stop offering dead buttons', async () => {
    const { client, pro, clientId } = await relationship('edit-listed');
    const { listClients } = await import('../../src/services/ca/caAccess.service.js');

    const before = await runAsUser(pro.userId, () => listClients(pro.userId));
    expect(before.find((c) => c.id === clientId)).toMatchObject({
      canEditBooks: false,
      canEditTransactions: false,
      canEditImports: false,
      canEditFmv: false,
    });

    await runAsUser(client.userId, () =>
      updateGrantScope(client.userId, clientId, { edit: { books: true, fmv: true } }),
    );

    const after = await runAsUser(pro.userId, () => listClients(pro.userId));
    expect(after.find((c) => c.id === clientId)).toMatchObject({
      canEditBooks: true,
      canEditTransactions: false,
      canEditImports: false,
      canEditFmv: true,
    });
  });
});

describe('the refusal a professional actually sees', () => {
  it('names the permission and who can grant it', async () => {
    const { pro, clientId } = await relationship('edit-message');
    const { assertCaMayEdit } = await import('../../src/services/ca/caAccess.service.js');

    const scope = await runAsUser(pro.userId, () => getCaScope(pro.userId, clientId));
    expect(() => assertCaMayEdit(scope, 'books')).toThrow(/view-only/i);
    expect(() => assertCaMayEdit(scope, 'books')).toThrow(/Account Access/);
  });
});
