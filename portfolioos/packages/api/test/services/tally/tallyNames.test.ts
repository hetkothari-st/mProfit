import { describe, it, expect } from 'vitest';
import { TallyNamer, TALLY_RESERVED_GROUPS } from '../../../src/services/tally/tallyNames.js';

// Tally rejects a master whose name is already used by another master of any
// kind ("Name/alias duplicated across masters"), and its predefined groups
// and ledgers exist in every company. Every name we emit must avoid both.

describe('TallyNamer', () => {
  it('returns the same name for the same key, every time', () => {
    const n = new TallyNamer();
    expect(n.name('bank:1', 'HDFC Bank Savings 1234')).toBe('HDFC Bank Savings 1234');
    expect(n.name('bank:1', 'HDFC Bank Savings 1234')).toBe('HDFC Bank Savings 1234');
  });

  it("never reuses one of Tally's predefined group names", () => {
    const n = new TallyNamer();
    expect(TALLY_RESERVED_GROUPS).toContain('Investments');
    expect(n.name('x', 'Investments')).toBe('Investments A/c');
    expect(n.name('y', 'bank accounts')).toBe('bank accounts A/c');
  });

  it("never reuses Tally's predefined ledgers", () => {
    const n = new TallyNamer();
    expect(n.name('a', 'Cash')).toBe('Cash A/c');
    expect(n.name('b', 'Profit & Loss A/c')).toBe('Profit & Loss A/c (2)');
  });

  it('numbers a second master with the same name, ignoring case', () => {
    const n = new TallyNamer();
    expect(n.name('fund:1', 'Axis Bluechip Fund')).toBe('Axis Bluechip Fund');
    expect(n.name('fund:2', 'axis bluechip fund')).toBe('axis bluechip fund (2)');
    expect(n.name('fund:3', 'Axis Bluechip Fund')).toBe('Axis Bluechip Fund (3)');
  });

  it('shares one namespace between groups and ledgers', () => {
    const n = new TallyNamer();
    expect(n.name('group:equity', 'Equity Shares')).toBe('Equity Shares');
    expect(n.name('ledger:odd', 'Equity Shares')).toBe('Equity Shares (2)');
  });

  it('cleans names: trims, collapses spaces, drops control characters, never empty', () => {
    const n = new TallyNamer();
    expect(n.name('a', '  Tata\tMotors \n Ltd  ')).toBe('Tata Motors Ltd');
    expect(n.name('b', '   ')).toBe('Unnamed');
  });
});
