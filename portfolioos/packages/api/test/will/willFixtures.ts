import { emptyWillPayload, type WillPayload } from '@everypaisa/shared';
import { prisma } from '../../src/lib/prisma.js';
import { runAsSystem } from '../../src/lib/requestContext.js';

export const TODAY = '2026-10-12';

/** Same will as packages/shared/src/will/__tests__/fixtures.ts: passes every BLOCKER and WARNING. */
export function validWillPayload(): WillPayload {
  const base = emptyWillPayload();
  const person = (p: Partial<WillPayload['people'][number]> & { id: string; name: string }) => ({
    partyType: 'INDIVIDUAL' as const, relationship: 'SON' as const, dob: '1990-01-01', contact: null,
    sourceFamilyMemberId: null, contingentId: null, ...p,
  });
  const item = (p: Partial<WillPayload['estate']['items'][number]> & { sourceKey: string; label: string }) => ({
    side: 'ASSET' as const, kind: 'BANK_ACCOUNT' as const, ref: null, value: '100000.00', valueAsOf: TODAY,
    ownership: { type: 'SOLE' as const, sharePct: '100' }, review: 'CONFIRMED' as const, userEdited: false, note: null, ...p,
  });
  return {
    ...base,
    details: {
      legalName: 'Ramesh Kumar Verma', dob: '1970-05-15', jurisdiction: 'IN', personalLaw: 'HINDU',
      address: '12 MG Road, Pune 411001', maritalStatus: 'MARRIED', hasChildren: true, hasDependents: false,
    },
    people: [
      person({ id: 'p-spouse', name: 'Sunita Verma', relationship: 'SPOUSE', dob: '1972-08-01' }),
      person({ id: 'p-son', name: 'Arjun Verma', relationship: 'SON', dob: '1998-02-10', contingentId: 'p-spouse' }),
      person({ id: 'p-trust', name: 'Pune Animal Trust', partyType: 'ORGANISATION', relationship: 'CHARITY', dob: null }),
    ],
    roles: { executorId: 'p-spouse', altExecutorId: 'p-son', guardianId: null, altGuardianId: null },
    estate: {
      asOf: TODAY,
      failedSources: [],
      items: [
        item({ sourceKey: 'bank:b1', label: 'HDFC Bank savings account', ref: 'XXXX1234', value: '250000.00' }),
        item({ sourceKey: 'holdings:pf1:EQUITY', kind: 'HOLDING', label: 'Equity - My Portfolio', value: '1500000.00' }),
        item({ sourceKey: 'loan:l1', side: 'LIABILITY', kind: 'LOAN', label: 'Home loan - SBI', value: '400000.00' }),
      ],
    },
    allocation: {
      residuary: [{ personId: 'p-spouse', sharePct: '60' }, { personId: 'p-son', sharePct: '40' }],
      specificGifts: [{ itemId: 'holdings:pf1:EQUITY', personId: 'p-son', sharePct: '100' }],
      fixedGifts: [{ personId: 'p-trust', amount: '50000' }],
    },
    instructions: { text: 'I wish my books to go to the Pune public library.' },
  };
}

/** One row of every estate source, all active, unlinked and with current values. */
export async function seedEstateFixture(userId: string, portfolioId: string): Promise<void> {
  await runAsSystem(async () => {
    await prisma.holdingProjection.createMany({
      data: [
        { portfolioId, assetKey: 'will-test:eq1', assetClass: 'EQUITY', assetName: 'Eq One', quantity: '10', avgCostPrice: '100', totalCost: '1000', currentValue: '1500.50', sourceTxCount: 1 },
        { portfolioId, assetKey: 'will-test:eq2', assetClass: 'EQUITY', assetName: 'Eq Two', quantity: '5', avgCostPrice: '200', totalCost: '1000', currentValue: '900', sourceTxCount: 1 },
        { portfolioId, assetKey: 'will-test:fd1', assetClass: 'FIXED_DEPOSIT', assetName: 'FD', quantity: '1', avgCostPrice: '50000', totalCost: '50000', currentValue: null, sourceTxCount: 1 },
      ],
    });
    await prisma.bankAccount.create({
      data: { userId, bankName: 'HDFC Bank', accountType: 'SAVINGS', accountHolder: 'Test', last4: '1234', currentBalance: '250000', jointHolders: ['Sunita'], nomineeName: 'Sunita' },
    });
    await prisma.ownedProperty.create({
      data: { userId, name: 'Pune house', city: 'Pune', propertyType: 'INDEPENDENT_HOUSE', ownershipType: 'JOINT', ownershipPercent: '50', currentValue: '12000000' },
    });
    await prisma.rentalProperty.create({ data: { userId, name: 'Andheri flat', propertyType: 'RESIDENTIAL', currentValue: '9000000' } });
    await prisma.vehicle.create({ data: { userId, registrationNo: 'MH47BT5950', make: 'Maruti', model: 'Swift', currentValue: '450000' } });
    await prisma.insurancePolicy.create({
      data: { userId, insurer: 'LIC', type: 'TERM', policyHolder: 'Test', sumAssured: '10000000', premiumAmount: '12000', premiumFrequency: 'ANNUAL', startDate: new Date('2020-01-01'), policyNumberLast4: '9876' },
    });
    await prisma.loanGiven.create({ data: { userId, borrowerName: 'Ravi', principalAmount: '20000', lentOn: new Date('2026-01-10') } });
    await prisma.loan.create({
      data: { userId, lenderName: 'SBI', loanType: 'HOME', borrowerName: 'Test', principalAmount: '1000000', interestRate: '8.5', tenureMonths: 240, emiAmount: '8678.23', disbursementDate: new Date('2026-01-01'), firstEmiDate: new Date('2026-02-05') },
    });
    await prisma.creditCard.create({
      data: { userId, issuerBank: 'HDFC Bank', cardName: 'Regalia', last4: '4321', creditLimit: '300000', outstandingBalance: '12500.75', statementDay: 5, dueDay: 25 },
    });
  });
}

/** Rows that do not cascade from User. Call before scope.cleanup(). */
export async function clearEstateFixture(userId: string): Promise<void> {
  await runAsSystem(() => prisma.providentFundAccount.deleteMany({ where: { userId } }));
}
