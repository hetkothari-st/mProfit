import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import { inviteProfessional, acceptProfessionalInvitation } from '../../src/services/ca/caAccess.service.js';
import {
  savePracticeProfile,
  createInvoice,
  listInvoices,
  markInvoicePaid,
  cancelInvoice,
  renderInvoicePdf,
  getInvoice,
} from '../../src/services/ca/caInvoice.service.js';

/** A CA's fee invoices to clients: GST, numbering, paid/unpaid, PDF. */

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

async function grant(client: TestScope, ca: TestScope & { email: string }): Promise<string> {
  const { client: row, token } = await runAsUser(client.userId, () =>
    inviteProfessional(client.userId, { name: 'Our CA', email: ca.email }),
  );
  // Runs before the scopes' own cleanup (LIFO): invoices restrict deleting the client.
  cleanups.push(async () => {
    await runAsSystem(async () => {
      await prisma.invoice.deleteMany({ where: { clientId: row.id } });
      await prisma.practiceProfile.deleteMany({ where: { userId: ca.userId } });
      await prisma.caAuditLog.deleteMany({ where: { clientId: row.id } });
      await prisma.client.deleteMany({ where: { id: row.id } });
    });
  });
  await runAsUser(ca.userId, () => acceptProfessionalInvitation(ca.userId, ca.email, token));
  return row.id;
}

const MH_GSTIN = '27AAPFU0939F1ZV';

describe('CA invoices', () => {
  it('issues a GST invoice with CGST+SGST in-state, numbered per year', async () => {
    const ca = await person('inv-ca');
    const asha = await person('inv-asha');
    const clientId = await grant(asha, ca);
    await runAsUser(ca.userId, () =>
      savePracticeProfile(ca.userId, {
        firmName: 'Iyer & Co.',
        address: '1 MG Road, Pune',
        stateCode: '27',
        gstin: MH_GSTIN,
        invoicePrefix: 'IC',
      }),
    );

    const first = await runAsUser(ca.userId, () =>
      createInvoice(ca.userId, {
        clientId,
        invoiceDate: '2026-07-20',
        buyerName: 'Asha Verma',
        lines: [{ description: 'ITR filing FY 2025-26', sac: '9982', amount: '5000' }],
      }),
    );
    expect(first).toMatchObject({
      number: 'IC/26-27/0001',
      financialYear: '2026-27',
      placeOfSupply: '27',
      taxable: '5000.00',
      cgst: '450.00',
      sgst: '450.00',
      igst: '0.00',
      total: '5900.00',
      status: 'ISSUED',
    });

    const second = await runAsUser(ca.userId, () =>
      createInvoice(ca.userId, {
        clientId,
        invoiceDate: '2026-08-01',
        buyerName: 'Asha Verma',
        buyerGstin: '29AAPFU0939F1ZR',
        lines: [{ description: 'Bookkeeping', amount: '1000' }],
      }),
    );
    // Buyer in Karnataka: place of supply follows the buyer's GSTIN, so IGST.
    expect(second).toMatchObject({ number: 'IC/26-27/0002', placeOfSupply: '29', igst: '180.00', cgst: '0.00' });
  });

  it('charges no GST when the firm is not registered', async () => {
    const ca = await person('inv-nogst-ca');
    const asha = await person('inv-nogst-asha');
    const clientId = await grant(asha, ca);
    await runAsUser(ca.userId, () =>
      savePracticeProfile(ca.userId, { firmName: 'Iyer', address: 'Pune', stateCode: '27', gstin: null }),
    );
    const inv = await runAsUser(ca.userId, () =>
      createInvoice(ca.userId, {
        clientId,
        invoiceDate: '2026-07-20',
        buyerName: 'Asha',
        lines: [{ description: 'ITR filing', amount: '3000', gstRatePct: '18' }],
      }),
    );
    expect(inv).toMatchObject({ taxable: '3000.00', cgst: '0.00', igst: '0.00', total: '3000.00' });
  });

  it('tracks paid and outstanding, and cancels without reusing the number', async () => {
    const ca = await person('inv-paid-ca');
    const asha = await person('inv-paid-asha');
    const clientId = await grant(asha, ca);
    await runAsUser(ca.userId, () =>
      savePracticeProfile(ca.userId, { firmName: 'Iyer', address: 'Pune', stateCode: '27', gstin: MH_GSTIN }),
    );
    const mk = (amount: string) =>
      runAsUser(ca.userId, () =>
        createInvoice(ca.userId, { clientId, invoiceDate: '2026-07-20', buyerName: 'Asha', lines: [{ description: 'Fees', amount }] }),
      );
    const a = await mk('1000');
    const b = await mk('2000');
    const c = await mk('500');
    await runAsUser(ca.userId, () => markInvoicePaid(ca.userId, a.id, { paidOn: '2026-07-25' }));
    await runAsUser(ca.userId, () => cancelInvoice(ca.userId, c.id));

    const list = await runAsUser(ca.userId, () => listInvoices(ca.userId, { financialYear: '2026-27' }));
    expect(list.summary).toEqual({ billed: '3540.00', paid: '1180.00', outstanding: '2360.00' });
    expect(list.invoices.find((i) => i.id === c.id)!.status).toBe('CANCELLED');

    const d = await mk('100');
    expect(d.number).toBe('INV/26-27/0004');
    expect(b.number).toBe('INV/26-27/0002');
  });

  it('is private to the CA and refuses a client that is not theirs', async () => {
    const ca = await person('inv-priv-ca');
    const other = await person('inv-priv-other');
    const asha = await person('inv-priv-asha');
    const clientId = await grant(asha, ca);
    await runAsUser(ca.userId, () =>
      savePracticeProfile(ca.userId, { firmName: 'Iyer', address: 'Pune', stateCode: '27', gstin: null }),
    );
    await runAsUser(ca.userId, () =>
      createInvoice(ca.userId, { clientId, invoiceDate: '2026-07-20', buyerName: 'Asha', lines: [{ description: 'Fees', amount: '100' }] }),
    );
    expect(await runAsUser(asha.userId, () => prisma.invoice.count({ where: { clientId } }))).toBe(0);
    await runAsUser(other.userId, () =>
      savePracticeProfile(other.userId, { firmName: 'Other', address: 'Delhi', stateCode: '07', gstin: null }),
    );
    await expect(
      runAsUser(other.userId, () =>
        createInvoice(other.userId, { clientId, invoiceDate: '2026-07-20', buyerName: 'Asha', lines: [{ description: 'x', amount: '1' }] }),
      ),
    ).rejects.toThrow();
    cleanups.push(() => runAsSystem(() => prisma.practiceProfile.deleteMany({ where: { userId: other.userId } })).then(() => undefined));
  });

  it('validates the GSTIN and the firm state against it', async () => {
    const ca = await person('inv-val-ca');
    await expect(
      runAsUser(ca.userId, () =>
        savePracticeProfile(ca.userId, { firmName: 'Iyer', address: 'Pune', stateCode: '27', gstin: '27AAPFU0939F1ZW' }),
      ),
    ).rejects.toThrow(/GSTIN/);
    await expect(
      runAsUser(ca.userId, () =>
        savePracticeProfile(ca.userId, { firmName: 'Iyer', address: 'Pune', stateCode: '29', gstin: MH_GSTIN }),
      ),
    ).rejects.toThrow(/state/i);
  });

  it('renders a PDF', async () => {
    const ca = await person('inv-pdf-ca');
    const asha = await person('inv-pdf-asha');
    const clientId = await grant(asha, ca);
    await runAsUser(ca.userId, () =>
      savePracticeProfile(ca.userId, { firmName: 'Iyer & Co.', address: 'Pune', stateCode: '27', gstin: MH_GSTIN }),
    );
    const inv = await runAsUser(ca.userId, () =>
      createInvoice(ca.userId, { clientId, invoiceDate: '2026-07-20', buyerName: 'Asha', lines: [{ description: 'ITR filing', amount: '5000' }] }),
    );
    const full = await runAsUser(ca.userId, () => getInvoice(ca.userId, inv.id));
    const pdf = await renderInvoicePdf(full);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
