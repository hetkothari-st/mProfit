import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { generateRenewalAlerts } from '../../src/services/insurance/insurance.service.js';
import { generateCreditCardAlerts } from '../../src/services/banking/creditCards.service.js';

/**
 * Launch review B6: reminder alerts were dated the day the reminder fired, not
 * the day the money was due, so a "premium due in 15 days" reminder read as
 * "204d late" months later. Each reminder stage was also a new alert that never
 * closed, so a paid premium kept its 30/15/7/1-day reminders on the inbox.
 *
 * Synthetic numbers only.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoOf = (d: Date) => d.toISOString().slice(0, 10);

describe('reminder alerts are dated by the due date and collapse to one per item', () => {
  let scope: TestScope;

  beforeEach(async () => {
    scope = await createTestScope('alert-due-dates');
  });
  afterEach(async () => {
    vi.useRealTimers();
    await scope.cleanup();
  });

  const activeAlerts = (type: 'INSURANCE_PREMIUM' | 'CREDIT_CARD_DUE') =>
    scope.runAs(() =>
      prisma.alert.findMany({ where: { userId: scope.userId, type, isActive: true }, orderBy: { createdAt: 'asc' } }),
    );

  async function makePolicy(nextPremiumDue: string) {
    return scope.runAs(() =>
      prisma.insurancePolicy.create({
        data: {
          userId: scope.userId,
          insurer: 'Test Life',
          type: 'TERM',
          policyHolder: 'TEST USER',
          sumAssured: '1000000',
          premiumAmount: '12000',
          premiumFrequency: 'ANNUAL',
          startDate: day('2025-01-10'),
          nextPremiumDue: day(nextPremiumDue),
        },
      }),
    );
  }

  it('dates an insurance reminder by the premium due date, not the scan date', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-01-01T06:00:00Z') });
    await makePolicy('2026-01-15');
    await scope.runAs(() => generateRenewalAlerts(scope.userId));
    const [alert] = await activeAlerts('INSURANCE_PREMIUM');
    expect(alert!.title).toMatch(/due in 14 days/);
    // The alert's date is what the page measures "late" from.
    expect(isoOf(alert!.triggerDate)).toBe('2026-01-15');
  });

  it('keeps one reminder per premium as the stages move on', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-01-01T06:00:00Z') });
    await makePolicy('2026-01-15');
    await scope.runAs(() => generateRenewalAlerts(scope.userId)); // 15-day stage
    vi.setSystemTime(new Date('2026-01-10T06:00:00Z'));
    await scope.runAs(() => generateRenewalAlerts(scope.userId)); // 7-day stage
    vi.setSystemTime(new Date('2026-01-14T06:00:00Z'));
    await scope.runAs(() => generateRenewalAlerts(scope.userId)); // 1-day stage

    const open = await activeAlerts('INSURANCE_PREMIUM');
    expect(open).toHaveLength(1);
    expect(open[0]!.title).toMatch(/due in 1 day/);
  });

  it('closes the reminders once the premium is paid', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-01-01T06:00:00Z') });
    const policy = await makePolicy('2026-01-15');
    await scope.runAs(() => generateRenewalAlerts(scope.userId));
    expect(await activeAlerts('INSURANCE_PREMIUM')).toHaveLength(1);

    // Paying moves the next premium a year out, past the reminder window.
    await scope.runAs(() =>
      prisma.insurancePolicy.update({ where: { id: policy.id }, data: { nextPremiumDue: day('2027-01-15') } }),
    );
    vi.setSystemTime(new Date('2026-01-16T06:00:00Z'));
    await scope.runAs(() => generateRenewalAlerts(scope.userId));
    expect(await activeAlerts('INSURANCE_PREMIUM')).toHaveLength(0);
  });

  async function makeStatement(dueDate: string) {
    return scope.runAs(async () => {
      const card = await prisma.creditCard.create({
        data: { userId: scope.userId, issuerBank: 'TESTBANK', cardName: 'Test', last4: '0001', creditLimit: '100000', statementDay: 1, dueDay: 20 },
      });
      return prisma.creditCardStatement.create({
        data: { cardId: card.id, forMonth: '2026-01', statementAmount: '5000', dueDate: day(dueDate), status: 'PENDING' },
      });
    });
  }

  it('dates a card-due reminder by the statement due date and dedupes the stages', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-01-13T06:00:00Z') });
    await makeStatement('2026-01-20');
    await scope.runAs(() => generateCreditCardAlerts(scope.userId)); // 7d
    vi.setSystemTime(new Date('2026-01-17T06:00:00Z'));
    await scope.runAs(() => generateCreditCardAlerts(scope.userId)); // 3d
    vi.setSystemTime(new Date('2026-01-19T06:00:00Z'));
    await scope.runAs(() => generateCreditCardAlerts(scope.userId)); // 1d

    const open = await activeAlerts('CREDIT_CARD_DUE');
    expect(open).toHaveLength(1);
    expect(open[0]!.title).toMatch(/due in 1 day/);
    expect(isoOf(open[0]!.triggerDate)).toBe('2026-01-20');
  });

  it('keeps the overdue card alert across days, and closes it once the statement is paid', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-01-25T06:00:00Z') });
    const stmt = await makeStatement('2026-01-20');
    await scope.runAs(() => generateCreditCardAlerts(scope.userId));
    vi.setSystemTime(new Date('2026-01-26T06:00:00Z'));
    await scope.runAs(() => generateCreditCardAlerts(scope.userId));
    const overdue = await activeAlerts('CREDIT_CARD_DUE');
    expect(overdue).toHaveLength(1);
    expect(isoOf(overdue[0]!.triggerDate)).toBe('2026-01-20');

    await scope.runAs(() =>
      prisma.creditCardStatement.update({ where: { id: stmt.id }, data: { status: 'PAID', paidAmount: '5000', paidOn: day('2026-01-26') } }),
    );
    vi.setSystemTime(new Date('2026-01-27T06:00:00Z'));
    await scope.runAs(() => generateCreditCardAlerts(scope.userId));
    expect(await activeAlerts('CREDIT_CARD_DUE')).toHaveLength(0);
  });
});
