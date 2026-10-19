import { describe, it, expect } from 'vitest';
import { resolveTallyParentGroup, TALLY_RESERVED_GROUPS } from '../../../../src/services/reportBuilder/tally/accountGroupMapping.js';

describe('resolveTallyParentGroup', () => {
  it('maps every DEFAULT_COA code to a reserved Tally group', () => {
    const cases: Array<[string, string, 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE' | 'EQUITY']> = [
      ['1001', 'Bank Accounts', 'ASSET'],
      ['1002', 'Cash in Hand', 'ASSET'],
      ['1101', 'Equity Holdings', 'ASSET'],
      ['1102', 'Mutual Fund Holdings', 'ASSET'],
      ['1103', 'Fixed Deposits', 'ASSET'],
      ['1104', 'Bonds & Debentures', 'ASSET'],
      ['1105', 'Gold Holdings', 'ASSET'],
      ['2001', 'Loans & Borrowings', 'LIABILITY'],
      ['3001', 'Capital Account', 'EQUITY'],
      ['3002', 'Retained Earnings', 'EQUITY'],
      ['4001', 'Dividend Income', 'INCOME'],
      ['4003', 'Short-term Capital Gains', 'INCOME'],
      ['4004', 'Long-term Capital Gains', 'INCOME'],
      ['5001', 'Brokerage & Charges', 'EXPENSE'],
      ['5002', 'STT & Transaction Tax', 'EXPENSE'],
      ['5008', 'Loan Interest', 'EXPENSE'],
    ];
    for (const [code, name, type] of cases) {
      const group = resolveTallyParentGroup({ code, name, type });
      expect(TALLY_RESERVED_GROUPS as readonly string[]).toContain(group);
    }
  });

  it('gives the precise sub-group for bank, cash, deposit and tax accounts', () => {
    expect(resolveTallyParentGroup({ code: '1001', name: 'Bank Accounts', type: 'ASSET' })).toBe('Bank Accounts');
    expect(resolveTallyParentGroup({ code: '1002', name: 'Cash in Hand', type: 'ASSET' })).toBe('Cash-in-Hand');
    expect(resolveTallyParentGroup({ code: '1103', name: 'Fixed Deposits', type: 'ASSET' })).toBe('Deposits (Asset)');
    expect(resolveTallyParentGroup({ code: '5002', name: 'STT & Transaction Tax', type: 'EXPENSE' })).toBe('Duties & Taxes');
  });

  it('falls back to name heuristics for a custom account not in DEFAULT_COA', () => {
    expect(resolveTallyParentGroup({ code: '9001', name: 'HDFC Bank Savings', type: 'ASSET' })).toBe('Bank Accounts');
    expect(resolveTallyParentGroup({ code: '9002', name: 'Zerodha Demat', type: 'ASSET' })).toBe('Investments');
    expect(resolveTallyParentGroup({ code: '9003', name: 'Home Loan', type: 'LIABILITY' })).toBe('Loans (Liability)');
  });

  it('falls back to the per-AccountType default for an unrecognised custom account', () => {
    expect(resolveTallyParentGroup({ code: '9999', name: 'Miscellaneous Widget', type: 'ASSET' })).toBe('Current Assets');
    expect(resolveTallyParentGroup({ code: '9998', name: 'Miscellaneous Widget', type: 'LIABILITY' })).toBe(
      'Current Liabilities',
    );
    expect(resolveTallyParentGroup({ code: '9997', name: 'Miscellaneous Widget', type: 'INCOME' })).toBe(
      'Indirect Incomes',
    );
    expect(resolveTallyParentGroup({ code: '9996', name: 'Miscellaneous Widget', type: 'EXPENSE' })).toBe(
      'Indirect Expenses',
    );
    expect(resolveTallyParentGroup({ code: '9995', name: 'Miscellaneous Widget', type: 'EQUITY' })).toBe(
      'Capital Account',
    );
  });

  it('exposes exactly 28 reserved groups (15 primary + 13 sub-groups per Tally documentation)', () => {
    expect(TALLY_RESERVED_GROUPS.length).toBe(28);
    expect(new Set(TALLY_RESERVED_GROUPS).size).toBe(28);
  });
});
