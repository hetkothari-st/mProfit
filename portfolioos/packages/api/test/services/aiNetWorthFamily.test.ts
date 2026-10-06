import { describe, it, expect, vi } from 'vitest';

// F2: in a family view the assistant compared the FAMILY's current net worth
// with the CALLER's personal history (1/3/6/12 months), so "your net worth
// grew 300%" was family-vs-me. With no family history on the same basis,
// family view must not report growth at all.

const { DAY, iso } = vi.hoisted(() => ({
  DAY: 86_400_000,
  iso: (msAgo: number) => new Date(Date.now() - msAgo).toISOString().slice(0, 10),
}));

vi.mock('../../src/lib/prisma.js', () => ({ prisma: {} }));
vi.mock('../../src/services/dashboard.service.js', () => ({
  getDashboardNetWorthForScope: vi.fn().mockResolvedValue({
    totalNetWorth: '4000000',
    totalLiabilities: '0',
    netWorthAfterLiabilities: '4000000',
  }),
}));
vi.mock('../../src/services/analytics.service.js', () => ({
  getAnalyticsSnapshot: vi.fn().mockResolvedValue({
    portfolioValueLine: [
      { date: iso(400 * DAY), value: '900000' },
      { date: iso(200 * DAY), value: '950000' },
      { date: iso(100 * DAY), value: '980000' },
      { date: iso(40 * DAY), value: '1000000' },
      { date: iso(1 * DAY), value: '1000000' },
    ],
  }),
}));
vi.mock('../../src/services/familyScope.service.js', () => ({ getEffectiveScope: vi.fn() }));
vi.mock('../../src/services/xirr.service.js', () => ({ computeUserXirr: vi.fn() }));
vi.mock('../../src/services/capitalGains.service.js', () => ({ computeUserCapitalGains: vi.fn() }));
vi.mock('../../src/services/tax.service.js', () => ({ taxHarvestReport: vi.fn() }));
vi.mock('../../src/services/goals.service.js', () => ({ listGoals: vi.fn() }));
vi.mock('../../src/services/loans.service.js', () => ({ listLoans: vi.fn() }));
vi.mock('../../src/services/creditCards.service.js', () => ({ listCards: vi.fn() }));
vi.mock('../../src/services/insurance.service.js', () => ({ listPolicies: vi.fn() }));

import { buildNetWorthData } from '../../src/ai/contextBuilder.js';

const personal = { familyId: null } as never;
const family = { familyId: 'fam1' } as never;

describe('buildNetWorthData', () => {
  it('reports growth against the caller\u2019s own history in personal view', async () => {
    const d = await buildNetWorthData('u1', personal);
    expect(d.netWorth1mAgo).not.toBeNull();
    expect((d.changes as Record<string, unknown>)['1m']).not.toBeNull();
  });

  it('reports no growth figures in family view', async () => {
    const d = await buildNetWorthData('u1', family);
    expect(d.currentNetWorth).toBe(4000000);
    expect(d.netWorth1mAgo).toBeNull();
    expect(d.netWorth12mAgo).toBeNull();
    expect(Object.values(d.changes as Record<string, unknown>).every((c) => c === null)).toBe(true);
    expect(d.historyMonthly).toEqual([]);
    expect(String(d.historyNote)).toMatch(/family/i);
  });
});
