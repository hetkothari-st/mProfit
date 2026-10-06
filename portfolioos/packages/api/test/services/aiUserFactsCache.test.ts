import { describe, it, expect, vi, beforeEach } from 'vitest';

// The adviser's facts are cached so a conversation doesn't rebuild every
// figure on every message — but the moment the user's data changes, the next
// message must see it.

const svc = vi.hoisted(() => ({
  buildAdvisorFacts: vi.fn(),
  listRecommendations: vi.fn(),
  computeHealthScore: vi.fn(),
  activeMonthlyIncomeTotal: vi.fn(),
  listPolicies: vi.fn(),
  getDashboardNetWorthForScope: vi.fn(),
  computeSummary: vi.fn(),
  bankAccountFindMany: vi.fn(),
}));
vi.mock('../../src/services/advisor/advisorFacts.builder.js', () => ({ buildAdvisorFacts: svc.buildAdvisorFacts }));
vi.mock('../../src/services/advisor/advisorRecommendations.service.js', () => ({ listRecommendations: svc.listRecommendations }));
vi.mock('../../src/services/healthScore.service.js', () => ({ computeHealthScore: svc.computeHealthScore }));
vi.mock('../../src/services/income.service.js', () => ({ activeMonthlyIncomeTotal: svc.activeMonthlyIncomeTotal }));
vi.mock('../../src/services/insurance.service.js', () => ({ listPolicies: svc.listPolicies }));
vi.mock('../../src/services/dashboard.service.js', () => ({ getDashboardNetWorthForScope: svc.getDashboardNetWorthForScope }));
vi.mock('../../src/services/realEstate.service.js', () => ({ computeSummary: svc.computeSummary }));
vi.mock('../../src/lib/prisma.js', () => ({ prisma: { bankAccount: { findMany: svc.bankAccountFindMany } } }));

import { loadAdvisorContext } from '../../src/ai/userFacts.js';
import { markUserDataChanged } from '../../src/lib/userDataVersion.js';

beforeEach(() => {
  vi.clearAllMocks();
  svc.buildAdvisorFacts.mockResolvedValue(null);
  svc.listRecommendations.mockResolvedValue([]);
  svc.computeHealthScore.mockResolvedValue(null);
  svc.activeMonthlyIncomeTotal.mockResolvedValue(null);
  svc.listPolicies.mockResolvedValue([]);
  svc.getDashboardNetWorthForScope.mockResolvedValue(null);
  svc.computeSummary.mockResolvedValue(null);
  svc.bankAccountFindMany.mockResolvedValue([]);
});

describe('loadAdvisorContext cache', () => {
  it("reuses the facts until that user's data changes", async () => {
    const opts = { familyId: null, readableUserIds: ['cache-u1'], profile: {} };
    await loadAdvisorContext('cache-u1', opts);
    await loadAdvisorContext('cache-u1', opts);
    expect(svc.buildAdvisorFacts).toHaveBeenCalledTimes(1);

    markUserDataChanged('cache-someone-else');
    await loadAdvisorContext('cache-u1', opts);
    expect(svc.buildAdvisorFacts).toHaveBeenCalledTimes(1);

    markUserDataChanged('cache-u1');
    await loadAdvisorContext('cache-u1', opts);
    expect(svc.buildAdvisorFacts).toHaveBeenCalledTimes(2);
  });

  it("refreshes a household view when any member's data changes", async () => {
    const opts = { familyId: 'cache-f1', readableUserIds: ['cache-u2', 'cache-u3'], profile: {} };
    await loadAdvisorContext('cache-u2', opts);
    markUserDataChanged('cache-u3');
    await loadAdvisorContext('cache-u2', opts);
    expect(svc.buildAdvisorFacts).toHaveBeenCalledTimes(2);
  });
});
