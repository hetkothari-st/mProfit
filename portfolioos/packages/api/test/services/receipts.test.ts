import { describe, it, expect, afterEach } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem, runAsUser } from '../../src/lib/requestContext.js';
import { generateVouchersFromActivity } from '../../src/services/accounting.service.js';
import { buildReceipt } from '../../src/services/receipts/receiptData.js';
import { renderReceiptPdf } from '../../src/services/receipts/receiptPdf.js';
import {
  selectReceipts,
  zipReceipts,
  receiptsWorkbook,
} from '../../src/services/receipts/receiptBundle.js';

/**
 * Receipts built from the ledger.
 *
 * What makes a receipt a receipt is everything the voucher does NOT hold: the
 * tenant's name, which months the rent covers, which policy the premium is
 * against. These assert that the link back to the source row survives — a
 * receipt that says only "RECEIPT 45,000" is a voucher with a nicer font.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

async function ownerWithPayments(label: string): Promise<TestScope> {
  const scope = await createTestScope(label);
  cleanups.push(scope.cleanup);
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
    const property = await prisma.rentalProperty.create({
      data: {
        userId: scope.userId,
        name: 'Andheri East flat',
        address: '12 Mahakali Caves Road, Andheri East, Mumbai 400093',
        propertyType: 'RESIDENTIAL',
      },
    });
    const tenancy = await prisma.tenancy.create({
      data: {
        propertyId: property.id,
        tenantName: 'Rajesh Menon',
        startDate: new Date('2025-04-01'),
        monthlyRent: '45000',
        rentDueDay: 1,
      },
    });
    await prisma.rentReceipt.create({
      data: {
        tenancyId: tenancy.id,
        forMonth: '2025-05',
        expectedAmount: '45000',
        receivedAmount: '45000',
        dueDate: new Date('2025-05-01'),
        receivedOn: new Date('2025-05-02'),
        status: 'RECEIVED',
      },
    });

    const policy = await prisma.insurancePolicy.create({
      data: {
        userId: scope.userId,
        insurer: 'LIC',
        policyNumber: 'POL-99',
        planName: 'Jeevan Anand',
        type: 'TERM',
        policyHolder: 'Test Owner',
        sumAssured: '5000000',
        premiumAmount: '18000',
        premiumFrequency: 'ANNUAL',
        startDate: new Date('2025-04-01'),
      },
    });
    await prisma.premiumPayment.create({
      data: {
        policyId: policy.id,
        paidOn: new Date('2025-05-10'),
        amount: '18000',
        periodFrom: new Date('2025-04-01'),
        periodTo: new Date('2026-03-31'),
      },
    });

    const loan = await prisma.loan.create({
      data: {
        userId: scope.userId, lenderName: 'HDFC Bank', loanType: 'HOME', borrowerName: 'Test Owner',
        principalAmount: '1000000', interestRate: '9', tenureMonths: 120, emiAmount: '12000',
        disbursementDate: new Date('2025-04-01'), firstEmiDate: new Date('2025-05-01'),
      },
    });
    await prisma.loanPayment.create({
      data: {
        loanId: loan.id, paymentType: 'EMI', paidOn: new Date('2025-05-01'),
        amount: '12000', principalPart: '4500', interestPart: '7500',
      },
    });
  });

  await runAsUser(scope.userId, () => generateVouchersFromActivity(scope.userId));
  return scope;
}

async function receiptFor(scope: TestScope, prefix: string) {
  const voucher = await runAsUser(scope.userId, () =>
    prisma.voucher.findFirst({
      where: { userId: scope.userId, voucherNo: { startsWith: prefix } },
    }),
  );
  expect(voucher, `no voucher starting ${prefix}`).toBeTruthy();
  return runAsUser(scope.userId, () => buildReceipt(scope.userId, voucher!.id));
}

describe('a rent receipt', () => {
  it('names the tenant, the property and the month it covers', async () => {
    const owner = await ownerWithPayments('receipt-rent');
    const receipt = await receiptFor(owner, 'AUTO-RENT-');

    expect(receipt.kind).toBe('RENT');
    expect(receipt.title).toBe('Rent Receipt');
    expect(receipt.isInflow).toBe(true);
    expect(receipt.receivedFrom).toBe('Rajesh Menon');
    expect(receipt.amount).toBe('45000.00');
    expect(receipt.amountWords).toBe('Forty-five thousand rupees only');

    const labels = receipt.fields.map((f) => `${f.label}: ${f.value}`).join(' | ');
    expect(labels).toContain('Property: Andheri East flat');
    expect(labels).toContain('For the month of: May 2025');
    expect(labels).toContain('Andheri East, Mumbai');
  });
});

describe('a premium receipt', () => {
  it('names the insurer, the plan and the period covered', async () => {
    const owner = await ownerWithPayments('receipt-premium');
    const receipt = await receiptFor(owner, 'AUTO-PREM-');

    expect(receipt.kind).toBe('PREMIUM');
    expect(receipt.isInflow).toBe(false);
    expect(receipt.paidTo).toBe('LIC');
    const labels = receipt.fields.map((f) => `${f.label}: ${f.value}`).join(' | ');
    expect(labels).toContain('Policy: Jeevan Anand');
    expect(labels).toContain('Covering: 01 Apr 2025 to 31 Mar 2026');
  });
});

describe('a loan payment receipt', () => {
  it('splits principal from interest', async () => {
    const owner = await ownerWithPayments('receipt-loan');
    const receipt = await receiptFor(owner, 'AUTO-LOAN-');

    expect(receipt.kind).toBe('LOAN_PAYMENT');
    expect(receipt.paidTo).toBe('HDFC Bank');
    const labels = receipt.fields.map((f) => `${f.label}: ${f.value}`).join(' | ');
    expect(labels).toContain('Principal: 4500.00');
    expect(labels).toContain('Interest: 7500.00');
  });
});

describe('the rendered document', () => {
  it('is a real PDF carrying the amount in words', async () => {
    const owner = await ownerWithPayments('receipt-pdf');
    const receipt = await receiptFor(owner, 'AUTO-RENT-');
    const pdf = await renderReceiptPdf(receipt);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });
});

describe('a bundle of receipts', () => {
  it('selects the payment vouchers, not every auto voucher', async () => {
    const owner = await ownerWithPayments('receipt-bundle');
    const { receipts, truncated } = await runAsUser(owner.userId, () =>
      selectReceipts(owner.userId, {}),
    );

    expect(truncated).toBe(false);
    // The loan disbursement counts: it is money received against the loan,
    // and it gets its own document rather than the generic fallback.
    expect(receipts.map((r) => r.kind).sort()).toEqual([
      'LOAN_DISBURSEMENT',
      'LOAN_PAYMENT',
      'PREMIUM',
      'RENT',
    ]);
  });

  it('zips one PDF per receipt, named distinctly', async () => {
    const owner = await ownerWithPayments('receipt-zip');
    const { receipts } = await runAsUser(owner.userId, () => selectReceipts(owner.userId, {}));
    const zip = await zipReceipts(receipts);

    const { default: JSZip } = await import('jszip');
    const read = await JSZip.loadAsync(zip);
    const names = Object.keys(read.files);
    expect(names).toHaveLength(receipts.length);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.endsWith('.pdf'))).toBe(true);
  });

  it('writes a workbook whose amounts are numbers and whose total adds up', async () => {
    const owner = await ownerWithPayments('receipt-xlsx');
    const { receipts } = await runAsUser(owner.userId, () => selectReceipts(owner.userId, {}));
    const buf = await receiptsWorkbook(receipts);

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('Receipts')!;

    // Header + one row per receipt + the totals row.
    expect(ws.rowCount).toBe(receipts.length + 2);

    const expected = receipts.reduce((sum, r) => sum + Number(r.amount), 0);
    const totalCell = ws.getRow(ws.rowCount).getCell('F').value;
    expect(typeof totalCell).toBe('number');
    expect(totalCell).toBeCloseTo(expected, 2);
  });

  it('honours the date range', async () => {
    const owner = await ownerWithPayments('receipt-range');
    const { receipts } = await runAsUser(owner.userId, () =>
      selectReceipts(owner.userId, { from: '2025-05-05', to: '2025-05-31' }),
    );
    // Only the premium falls after the 5th.
    expect(receipts.map((r) => r.kind)).toEqual(['PREMIUM']);
  });
});

describe('someone else’s receipt', () => {
  it('is not found, even by id', async () => {
    const owner = await ownerWithPayments('receipt-owner');
    const stranger = await createTestScope('receipt-stranger');
    cleanups.push(stranger.cleanup);

    const voucher = await runAsUser(owner.userId, () =>
      prisma.voucher.findFirst({ where: { userId: owner.userId } }),
    );

    await expect(
      runAsUser(stranger.userId, () => buildReceipt(stranger.userId, voucher!.id)),
    ).rejects.toThrow(/not found/i);
  });
});
