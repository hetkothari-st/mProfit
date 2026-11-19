// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import type { FamilyWealth } from '@everypaisa/shared';
import { FamilyWealthCard } from './FamilyWealthCard';

vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));
// Charts need real layout; this test is about the ledger table.
vi.mock('recharts', async (orig) => {
  const actual = await orig<typeof import('recharts')>();
  return { ...actual, ResponsiveContainer: () => null };
});

afterEach(cleanup);

const member = (over: Record<string, unknown>) => ({
  userId: 'u1', name: 'Asha', email: 'asha@example.com', isSelf: true, restricted: false,
  netWorth: '5000000.00', invested: '4000000.00', unrealisedPnL: '100000.00', unrealisedPnLPct: 2.5,
  totalLiabilities: '1000000.00', netWorthAfterLiabilities: '4000000.00', sharePct: 80, ...over,
});

const data = {
  familyId: 'f1', callerId: 'u1', asOf: '2026-11-19T00:00:00.000Z', hiddenMemberCount: 0,
  totals: {
    memberCount: 2, netWorth: '6250000.00', invested: '5000000.00', unrealisedPnL: '150000.00', unrealisedPnLPct: 3,
    totalLiabilities: '1000000.00', netWorthAfterLiabilities: '5250000.00',
  },
  members: [
    member({}),
    member({
      userId: 'u2', name: 'Ravi', email: 'ravi@example.com', isSelf: false, netWorth: '1250000.00',
      invested: '1000000.00', unrealisedPnL: '50000.00', totalLiabilities: '0.00', netWorthAfterLiabilities: '1250000.00', sharePct: 20,
    }),
  ],
  allocation: [],
  visibility: { restrictedMemberCount: 0, hiddenMemberCount: 0, partial: false },
} as unknown as FamilyWealth;

describe('FamilyWealthCard member ledger', () => {
  it('labels the gross figure "Assets" and gives each member a real net worth after their loans', () => {
    render(<FamilyWealthCard data={data} isLoading={false} isError={false} />);
    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Member', 'Assets', 'Loans', 'Net worth', 'Invested', 'Unrealised P&L', 'Share of assets']);

    const asha = within(table).getByText('Asha').closest('tr')!;
    const cells = within(asha).getAllByRole('cell').map((c) => c.textContent);
    expect(cells[1]).toContain('50,00,000'); // assets
    expect(cells[2]).toContain('10,00,000'); // loans
    expect(cells[3]).toContain('40,00,000'); // net worth = assets - loans
  });

  it('shows a member with no loans as equal assets and net worth', () => {
    render(<FamilyWealthCard data={data} isLoading={false} isError={false} />);
    const ravi = within(screen.getByRole('table')).getByText('Ravi').closest('tr')!;
    const cells = within(ravi).getAllByRole('cell').map((c) => c.textContent);
    expect(cells[1]).toContain('12,50,000');
    expect(cells[3]).toContain('12,50,000');
  });
});
