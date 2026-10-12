import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestScope, prisma, type TestScope } from '../helpers/db.js';
import { runAsSystem } from '../../src/lib/requestContext.js';
import { encryptSecret } from '../../src/lib/secrets.js';
import { buildLegacyView, renderLegacyPdf } from '../../src/services/legacy/view.service.js';

describe('buildLegacyView', () => {
  let s: TestScope; let planId: string; let full: string; let blind: string;
  beforeAll(async () => {
    s = await createTestScope('legacy-view');
    planId = (await runAsSystem(() => prisma.legacyPlan.create({ data: {
      userId: s.userId, status: 'RELEASED', releasedAt: new Date(), letterEnc: encryptSecret('Locker #42'),
    } }))).id;
    await runAsSystem(() => prisma.insurancePolicy.create({ data: {
      userId: s.userId, insurer: 'LIC', type: 'TERM', policyHolder: 'Asha', sumAssured: '10000000', premiumAmount: '12000',
      premiumFrequency: 'ANNUAL', startDate: new Date('2020-01-01'), policyNumberLast4: '4321',
    } }));
    await runAsSystem(() => prisma.bankAccount.create({ data: {
      userId: s.userId, bankName: 'HDFC Bank', accountType: 'SAVINGS', accountHolder: 'Asha', last4: '9876',
      currentBalance: '250000.50', nomineeName: 'Ravi',
    } }));
    const mk = (email: string, showAmounts: boolean, categories: string[]) => runAsSystem(() => prisma.legacyNominee.create({ data: {
      planId, userId: s.userId, nameEnc: encryptSecret('N'), emailEnc: encryptSecret(email), relationship: 'Spouse', priority: 1,
      categories, showAmounts,
    } })).then((n) => n.id);
    full = await mk('full@test.local', true, ['INSURANCE', 'BANK_ACCOUNTS', 'LETTER']);
    blind = await mk('blind@test.local', false, ['INSURANCE', 'BANK_ACCOUNTS']);
  });
  afterAll(async () => {
    await runAsSystem(async () => {
      await prisma.legacyPlan.deleteMany({ where: { userId: s.userId } });
      await prisma.insurancePolicy.deleteMany({ where: { userId: s.userId } });
      await prisma.bankAccount.deleteMany({ where: { userId: s.userId } });
    });
    await s.cleanup();
  });

  it('full nominee sees amounts, last4 and the letter', async () => {
    const v = await buildLegacyView(s.userId, full);
    const bank = v.sections.find((x) => x.category === 'BANK_ACCOUNTS')!;
    expect(bank.items[0]).toMatchObject({ label: 'HDFC Bank', identifierLast4: '9876', nominee: 'Ravi', amount: '250000.5' });
    expect(v.letter).toBe('Locker #42');
    expect(v.netWorth).toBe('250000.5');
  });

  it('showAmounts=false strips every amount and net worth', async () => {
    const v = await buildLegacyView(s.userId, blind);
    expect(v.netWorth).toBeNull();
    for (const sec of v.sections) for (const it of sec.items) expect(it.amount).toBeNull();
    expect(JSON.stringify(v)).not.toContain('250000');
    expect(JSON.stringify(v)).not.toContain('10000000');
  });

  it('out-of-scope categories are absent', async () => {
    const v = await buildLegacyView(s.userId, blind);
    expect(v.sections.map((x) => x.category).sort()).toEqual(['BANK_ACCOUNTS', 'INSURANCE']);
    expect(v.letter).toBeNull();
  });

  it('refuses when the plan is not released', async () => {
    await runAsSystem(() => prisma.legacyPlan.update({ where: { id: planId }, data: { status: 'ARMED' } }));
    await expect(buildLegacyView(s.userId, full)).rejects.toThrow();
    await runAsSystem(() => prisma.legacyPlan.update({ where: { id: planId }, data: { status: 'RELEASED' } }));
  });

  it('renders a PDF', async () => {
    const pdf = await renderLegacyPdf(await buildLegacyView(s.userId, full));
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
