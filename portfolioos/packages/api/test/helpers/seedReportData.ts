import { randomUUID } from 'node:crypto';
import type { AssetClass, TransactionType } from '@prisma/client';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from './db.js';
import { recomputeForPortfolio } from '../../src/services/holdingsProjection.js';
import { persistCapitalGainsForPortfolio } from '../../src/services/capitalGains.service.js';
import { recomputeDerivativePosition } from '../../src/services/derivativePosition.service.js';

/**
 * One user with something in every stream the reports read: equity (including
 * an intraday pair, a split and a bonus), mutual funds, a bond with STT, a
 * deposit, gold, a foreign holding, F&O, dividends and interest, a loan, rent,
 * an insurance premium, a bank account with cash flows, and a PF passbook.
 *
 * Small on purpose — enough for every report to have rows, few enough to read
 * when one of them is wrong.
 */
export interface SeededReports extends TestScope {
  bankAccountId: string;
  loanId: string;
  pfAccountId: string;
}

type Tx = {
  type: TransactionType;
  date: string;
  name: string;
  qty: string;
  price: string;
  assetClass?: AssetClass;
  assetKey?: string;
  stt?: string;
  brokerage?: string;
  broker?: string;
  currency?: string;
  fxRateAtTrade?: string;
  expiryDate?: string;
  lotSize?: number;
  orderNo?: string;
};

const FNO_KEY = 'fno:NIFTY:FUT:000000:2025-06-26';

const TXS: Tx[] = [
  // Equity: a long-term exit, a partial sale, a split, a bonus, an intraday pair.
  { type: 'BUY', date: '2023-05-10', name: 'Infosys', qty: '100', price: '1400', stt: '140', brokerage: '20', broker: 'Zerodha', orderNo: 'Z-1' },
  { type: 'BUY', date: '2024-06-10', name: 'Infosys', qty: '50', price: '1600', stt: '80', brokerage: '15', broker: 'Zerodha', orderNo: 'Z-2' },
  { type: 'SELL', date: '2025-01-15', name: 'Infosys', qty: '60', price: '1900', stt: '114', brokerage: '25', broker: 'Zerodha', orderNo: 'Z-3' },
  { type: 'BUY', date: '2023-08-01', name: 'Tata Motors', qty: '200', price: '600', broker: 'Groww' },
  { type: 'SPLIT', date: '2024-02-01', name: 'Tata Motors', qty: '200', price: '0' },
  { type: 'BONUS', date: '2024-09-01', name: 'Tata Motors', qty: '100', price: '0' },
  { type: 'BUY', date: '2025-02-03', name: 'Reliance', qty: '80', price: '1200', broker: 'Zerodha' },
  { type: 'SELL', date: '2025-02-03', name: 'Reliance', qty: '80', price: '1245', broker: 'Zerodha' },
  { type: 'DIVIDEND_PAYOUT', date: '2024-07-20', name: 'Infosys', qty: '0', price: '0' },
  // Mutual funds: SIPs and a partial redemption.
  { type: 'SIP', date: '2023-04-05', name: 'Axis Bluechip', qty: '500', price: '40', assetClass: 'MUTUAL_FUND' },
  { type: 'SIP', date: '2024-04-05', name: 'Axis Bluechip', qty: '400', price: '50', assetClass: 'MUTUAL_FUND' },
  { type: 'REDEMPTION', date: '2025-03-01', name: 'Axis Bluechip', qty: '300', price: '62', assetClass: 'MUTUAL_FUND' },
  // Bond, deposit, gold, foreign equity.
  { type: 'BUY', date: '2023-07-01', name: 'NHAI Bond', qty: '10', price: '1000', assetClass: 'BOND' },
  { type: 'INTEREST_RECEIVED', date: '2024-07-01', name: 'NHAI Bond', qty: '0', price: '0', assetClass: 'BOND' },
  { type: 'DEPOSIT', date: '2024-01-01', name: 'HDFC FD', qty: '200000', price: '1', assetClass: 'FIXED_DEPOSIT' },
  { type: 'BUY', date: '2024-05-05', name: 'Sovereign Gold Bond', qty: '20', price: '6000', assetClass: 'GOLD_BOND' },
  { type: 'BUY', date: '2024-08-08', name: 'Apple Inc', qty: '10', price: '180', assetClass: 'FOREIGN_EQUITY', currency: 'USD', fxRateAtTrade: '83.5' },
  // F&O: one closed future, one open.
  { type: 'BUY', date: '2025-05-02', name: 'NIFTY FUT', qty: '75', price: '22000', assetClass: 'FUTURES', assetKey: FNO_KEY, expiryDate: '2025-06-26', lotSize: 75 },
  { type: 'SELL', date: '2025-06-02', name: 'NIFTY FUT', qty: '50', price: '22400', assetClass: 'FUTURES', assetKey: FNO_KEY, expiryDate: '2025-06-26', lotSize: 75 },
];

export async function seedReportData(label = 'reports-smoke'): Promise<SeededReports> {
  const scope = await createTestScope(label);
  const suffix = randomUUID().slice(0, 6);

  const extra = await runAsSystem(async () => {
    for (const t of TXS) {
      const qty = Number(t.qty);
      const gross = (qty * Number(t.price)).toFixed(4);
      const charges = Number(t.stt ?? 0) + Number(t.brokerage ?? 0);
      const isBuy = ['BUY', 'SIP', 'BONUS', 'SPLIT', 'DEPOSIT'].includes(t.type);
      const net = (Number(gross) + (isBuy ? charges : -charges)).toFixed(4);
      await prisma.transaction.create({
        data: {
          portfolioId: scope.portfolioId,
          assetClass: t.assetClass ?? 'EQUITY',
          transactionType: t.type,
          assetName: t.name,
          assetKey: t.assetKey ?? `name:${t.name}`,
          tradeDate: new Date(t.date),
          settlementDate: new Date(t.date),
          quantity: t.qty,
          price: t.price,
          grossAmount: gross,
          netAmount: net,
          ...(t.stt ? { stt: t.stt } : {}),
          ...(t.brokerage ? { brokerage: t.brokerage } : {}),
          ...(t.broker ? { broker: t.broker } : {}),
          ...(t.orderNo ? { orderNo: t.orderNo } : {}),
          ...(t.currency ? { currency: t.currency, fxRateAtTrade: t.fxRateAtTrade } : {}),
          ...(t.expiryDate ? { expiryDate: new Date(t.expiryDate), lotSize: t.lotSize } : {}),
        },
      });
    }

    // A dividend and interest amount the loop above leaves at zero.
    await prisma.transaction.updateMany({
      where: { portfolioId: scope.portfolioId, transactionType: 'DIVIDEND_PAYOUT' },
      data: { grossAmount: '4500', netAmount: '4500' },
    });
    await prisma.transaction.updateMany({
      where: { portfolioId: scope.portfolioId, transactionType: 'INTEREST_RECEIVED' },
      data: { grossAmount: '7250', netAmount: '7250' },
    });

    const bank = await prisma.bankAccount.create({
      data: {
        userId: scope.userId,
        bankName: 'HDFC Bank',
        accountType: 'SAVINGS',
        accountHolder: 'Test User',
        last4: '4321',
        currentBalance: '250000',
      },
    });
    for (const [date, type, amount, description] of [
      ['2025-01-05', 'INFLOW', '85000', 'Salary credit'],
      ['2025-01-09', 'OUTFLOW', '1500', 'UPI to Torrent Power'],
      ['2025-02-11', 'OUTFLOW', '12000', 'Insurance premium debit'],
    ] as const) {
      await prisma.cashFlow.create({
        data: { portfolioId: scope.portfolioId, date: new Date(date), type, amount, description, bankAccountId: bank.id },
      });
    }

    const loan = await prisma.loan.create({
      data: {
        userId: scope.userId,
        lenderName: 'HDFC Bank',
        loanType: 'HOME',
        borrowerName: 'Test User',
        principalAmount: '2500000',
        interestRate: '8.75',
        tenureMonths: 240,
        emiAmount: '22000',
        disbursementDate: new Date('2023-04-10'),
        firstEmiDate: new Date('2023-05-10'),
      },
    });
    await prisma.loanPayment.create({
      data: { loanId: loan.id, paymentType: 'EMI', paidOn: new Date('2025-01-10'), amount: '22000', interestPart: '18000', principalPart: '4000' },
    });
    await prisma.loanPayment.create({
      data: { loanId: loan.id, paymentType: 'PROCESSING_FEE', paidOn: new Date('2023-04-10'), amount: '15000' },
    });

    const property = await prisma.rentalProperty.create({
      data: { userId: scope.userId, name: 'Andheri Flat', propertyType: 'RESIDENTIAL', portfolioId: scope.portfolioId },
    });
    const tenancy = await prisma.tenancy.create({
      data: { propertyId: property.id, tenantName: 'Rajesh Kumar', startDate: new Date('2024-04-01'), monthlyRent: '25000' },
    });
    await prisma.rentReceipt.create({
      data: {
        tenancyId: tenancy.id,
        forMonth: '2025-01',
        expectedAmount: '25000',
        receivedAmount: '25000',
        dueDate: new Date('2025-01-05'),
        receivedOn: new Date('2025-01-05'),
        status: 'RECEIVED',
      },
    });

    const policy = await prisma.insurancePolicy.create({
      data: {
        userId: scope.userId,
        insurer: 'HDFC Life',
        policyNumber: `POL-${suffix}`,
        type: 'TERM',
        policyHolder: 'Test User',
        sumAssured: '10000000',
        premiumAmount: '24000',
        premiumFrequency: 'ANNUAL',
        startDate: new Date('2022-06-01'),
      },
    });
    await prisma.premiumPayment.create({
      data: {
        policyId: policy.id,
        paidOn: new Date('2024-06-01'),
        amount: '24000',
        periodFrom: new Date('2024-06-01'),
        periodTo: new Date('2025-05-31'),
      },
    });

    const pf = await prisma.providentFundAccount.create({
      data: {
        userId: scope.userId,
        type: 'EPF',
        institution: 'EPFO',
        identifierCipher: Buffer.from('not-a-real-uan'),
        identifierLast4: '7788',
        holderName: 'Test User',
        assetKey: `pf:epf:${suffix}`,
        lastRefreshedAt: new Date('2025-03-31'),
      },
    });
    const pfEvents: Array<[string, string, string]> = [
      ['PF_OPENING_BALANCE', '2024-04-01', '450000'],
      ['PF_EMPLOYEE_CONTRIBUTION', '2024-05-31', '7200'],
      ['PF_EMPLOYER_CONTRIBUTION', '2024-05-31', '7200'],
      ['PF_INTEREST_CREDIT', '2025-03-31', '38000'],
    ];
    for (const [eventType, date, amount] of pfEvents) {
      await prisma.canonicalEvent.create({
        data: {
          userId: scope.userId,
          sourceAdapter: 'pf.epfo.v1',
          sourceAdapterVer: '1',
          sourceRef: pf.id,
          sourceHash: `pf-${suffix}-${eventType}-${date}`,
          eventType: eventType as never,
          eventDate: new Date(date),
          amount,
          status: 'CONFIRMED',
          metadata: { memberIdLast4: '9090' },
        },
      });
    }

    await recomputeForPortfolio(scope.portfolioId);
    await persistCapitalGainsForPortfolio(scope.portfolioId);
    await recomputeDerivativePosition(scope.portfolioId, FNO_KEY);

    return { bankAccountId: bank.id, loanId: loan.id, pfAccountId: pf.id };
  });

  const cleanup = scope.cleanup;
  return {
    ...scope,
    ...extra,
    cleanup: async () => {
      await runAsSystem(async () => {
        await prisma.rentReceipt.deleteMany({ where: { tenancy: { property: { userId: scope.userId } } } });
        await prisma.tenancy.deleteMany({ where: { property: { userId: scope.userId } } });
        await prisma.rentalProperty.deleteMany({ where: { userId: scope.userId } });
        await prisma.premiumPayment.deleteMany({ where: { policy: { userId: scope.userId } } });
        await prisma.insurancePolicy.deleteMany({ where: { userId: scope.userId } });
        await prisma.loanPayment.deleteMany({ where: { loan: { userId: scope.userId } } });
        await prisma.loan.deleteMany({ where: { userId: scope.userId } });
        await prisma.canonicalEvent.deleteMany({ where: { userId: scope.userId } });
        await prisma.providentFundAccount.deleteMany({ where: { userId: scope.userId } });
        await prisma.derivativePosition.deleteMany({ where: { portfolioId: scope.portfolioId } });
        await prisma.cashFlow.deleteMany({ where: { portfolioId: scope.portfolioId } });
        await prisma.bankAccount.deleteMany({ where: { userId: scope.userId } });
      });
      await cleanup();
    },
  };
}
