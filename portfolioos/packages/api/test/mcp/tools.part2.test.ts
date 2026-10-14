import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runAsUser } from '../../src/lib/requestContext.js';
import { createTestScope, type TestScope } from '../helpers/db.js';
import { CONNECTOR_TOOLS } from '../../src/services/mcp/tools/index.js';
import { maskForChatbot } from '../../src/services/mcp/mask.js';
import { runConnectorTool } from '../../src/services/mcp/server.js';
import { createAccount } from '../../src/services/bankAccounts.service.js';
import { createCard } from '../../src/services/creditCards.service.js';
import { createIncome } from '../../src/services/income.service.js';
import { createLoan } from '../../src/services/loans.service.js';
import { createLoanGiven } from '../../src/services/loansGiven.service.js';
import { createPolicy } from '../../src/services/insurance.service.js';
import { createProperty as createOwned } from '../../src/services/realEstate.service.js';
import { createProperty as createRental, createTenancy } from '../../src/services/rental.service.js';
import { createVehicle } from '../../src/services/vehicles.service.js';
import { createGoal } from '../../src/services/goals.service.js';
import type { AiConnectorArea } from '@everypaisa/shared';

const DB_URL = process.env.DATABASE_URL ?? '';
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) throw new Error('Refusing to run: DATABASE_URL must point at a local database');

const ACCOUNT = '50100234564821';
const CARD = '4111111111111111';
const POLICY = '987654321012';
const PLATE = 'MH47BT5950';
const PHONE = '9876543210';
const EMAIL = 'tenant.person@example.com';

let a: TestScope;
let b: TestScope;
const AREAS: AiConnectorArea[] = ['banking', 'loans', 'insurance', 'property', 'vehicles', 'goals_tax', 'split', 'will', 'documents'];

async function call(name: string, userId: string, args: Record<string, unknown> = {}) {
  const tool = CONNECTOR_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`no tool ${name}`);
  return runAsUser(userId, async () => maskForChatbot((await runConnectorTool(
    { userId, grantId: 'g', areas: AREAS, memberUserIds: [], planOk: true, now: new Date('2026-10-15T06:00:00Z') }, tool, args,
  )).data));
}

beforeAll(async () => {
  a = await createTestScope('mcp-p2-a');
  b = await createTestScope('mcp-p2-b');
  const u = a.userId;
  await runAsUser(u, async () => {
    await createAccount(u, { bankName: 'HDFC Bank', accountType: 'SAVINGS', accountNumber: ACCOUNT, accountHolder: 'Test', nickname: `Salary a/c ${ACCOUNT}`, currentBalance: '240000' } as never);
    await createCard(u, { issuerBank: 'ICICI Bank', cardName: 'Amazon Pay', cardNumber: CARD, creditLimit: '300000', outstandingBalance: '12000', statementDay: 5, dueDay: 25 } as never);
    await createIncome(u, { type: 'SALARY', sourceName: 'Acme', monthlyAmount: '150000', payDay: 1, notes: `ref ${PHONE}` } as never);
    await createLoan(u, {
      lenderName: 'SBI', accountNumber: ACCOUNT, loanType: 'HOME', borrowerName: 'Test', principalAmount: '5000000', interestRate: '8.5',
      tenureMonths: 240, emiAmount: '43391', emiDueDay: 5, disbursementDate: '2024-01-01', firstEmiDate: '2024-02-05',
    } as never);
    await createLoanGiven(u, { borrowerName: 'Ravi', borrowerContact: PHONE, principalAmount: '50000', lentOn: '2026-01-01', notes: `mail ${EMAIL}` } as never);
    await createPolicy(u, {
      insurer: 'LIC', policyNumber: POLICY, type: 'TERM', policyHolder: 'Test', sumAssured: '10000000', premiumAmount: '25000',
      premiumFrequency: 'ANNUAL', startDate: '2025-01-01', nominees: [{ name: 'Spouse', relation: 'SPOUSE', sharePercent: 100 }],
    } as never);
    const rental = await createRental(u, { name: 'Andheri flat', propertyType: 'RESIDENTIAL', address: '12 Long Road' } as never);
    await createTenancy(u, { propertyId: (rental as { id: string }).id, tenantName: 'Tenant T', tenantPhone: PHONE, tenantEmail: EMAIL, startDate: '2026-01-01', monthlyRent: '45000', rentDueDay: 1 } as never);
    await createOwned(u, { name: 'Home', propertyType: 'APARTMENT', city: 'Mumbai', purchasePrice: '9000000', currentValue: '12000000', electricityConsumerNo: '123456789012' } as never);
    await createVehicle(u, { registrationNo: PLATE, make: 'Maruti', model: 'Swift', currentValue: '450000' } as never);
    await createGoal(u, { name: 'Retire', category: 'RETIREMENT', targetAmount: '30000000', targetDate: '2045-01-01' } as never);
  });
});
afterAll(async () => {
  await a.cleanup();
  await b.cleanup();
});

describe('Part 2 tools', () => {
  it('registers the 13 tools under their areas', () => {
    const map = Object.fromEntries(CONNECTOR_TOOLS.map((t) => [t.name, t.area]));
    expect(map).toMatchObject({
      list_bank_accounts: 'banking', list_credit_cards: 'banking', list_income: 'banking',
      list_loans: 'loans', list_loans_given: 'loans', list_insurance: 'insurance', list_properties: 'property',
      list_vehicles: 'vehicles', list_goals: 'goals_tax', get_tax_summary: 'goals_tax', list_split_balances: 'split',
      get_will_summary: 'will', list_nominees: 'will', list_documents: 'documents',
    });
  });

  const cases: Array<[string, (d: Record<string, unknown>) => unknown]> = [
    ['list_bank_accounts', (d) => d.accounts], ['list_credit_cards', (d) => d.cards], ['list_income', (d) => d.incomes],
    ['list_loans', (d) => d.loans], ['list_loans_given', (d) => d.loans], ['list_insurance', (d) => d.policies],
    ['list_vehicles', (d) => d.vehicles], ['list_goals', (d) => d.goals],
  ];
  for (const [name, rows] of cases) {
    it(`${name} returns the row and leaks no identifier`, async () => {
      const out = await call(name, a.userId);
      expect(rows(out) as unknown[]).toHaveLength(1);
      const s = JSON.stringify(out);
      for (const secret of [ACCOUNT, CARD, POLICY, PLATE, PHONE, 'tenant.person', '123456789012']) expect(s, `${name} leaked ${secret}`).not.toContain(secret);
    });
  }

  it('list_properties lists owned and rental, without tenant contact, address or utility numbers', async () => {
    const out = await call('list_properties', a.userId);
    expect(out.owned).toHaveLength(1);
    expect(out.rentals).toHaveLength(1);
    const s = JSON.stringify(out);
    for (const secret of [PHONE, 'tenant.person', '12 Long Road', '123456789012']) expect(s).not.toContain(secret);
    expect(s).toContain('Tenant T');
  });

  it('tax, split, will, nominees and documents answer for a user with none', async () => {
    for (const name of ['get_tax_summary', 'list_split_balances', 'get_will_summary', 'list_nominees', 'list_documents']) {
      await expect(call(name, a.userId), name).resolves.toBeTruthy();
    }
    expect((await call('get_will_summary', a.userId)).status).toBe('NOT_CREATED');
  });

  it('user B sees none of user A rows', async () => {
    for (const [name, rows] of cases) expect(rows(await call(name, b.userId)) as unknown[], name).toHaveLength(0);
    const p = await call('list_properties', b.userId);
    expect(p.owned).toHaveLength(0);
    expect(p.rentals).toHaveLength(0);
  });
});
