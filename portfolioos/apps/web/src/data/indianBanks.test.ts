import { describe, it, expect } from 'vitest';
import { INDIAN_BANKS, bankForIfsc, findBankByName } from './indianBanks';

describe('INDIAN_BANKS', () => {
  it('has well-formed, unique IFSC prefixes and names', () => {
    const prefixes = INDIAN_BANKS.map((b) => b.ifscPrefix);
    for (const p of prefixes) expect(p).toMatch(/^[A-Z]{4}$/);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    const names = INDIAN_BANKS.map((b) => b.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('resolves a bank from an IFSC, case-insensitively', () => {
    expect(bankForIfsc('hdfc0000240')?.name).toBe('HDFC Bank');
    expect(bankForIfsc('UTIB0000001')?.name).toBe('Axis Bank');
    expect(bankForIfsc('SBI')).toBeUndefined();
    expect(bankForIfsc('ZZZZ0000001')).toBeUndefined();
  });

  it('finds a bank by exact display name', () => {
    expect(findBankByName(' state bank of india ')?.ifscPrefix).toBe('SBIN');
    expect(findBankByName('State Bank')).toBeUndefined();
  });
});
