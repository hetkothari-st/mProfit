import { describe, it, expect } from 'vitest';
import { providentFundEmptyOverride } from './ProvidentFundPage';

describe('providentFundEmptyOverride', () => {
  it('keeps the default empty state when no account is linked', () => {
    expect(providentFundEmptyOverride(undefined)).toBeUndefined();
    expect(providentFundEmptyOverride([])).toBeUndefined();
  });

  it('says the account is linked, not that there is no provident fund', () => {
    const o = providentFundEmptyOverride([{ type: 'EPF', identifierLast4: '1234' }]);
    expect(o?.title).toBe('Your EPF account ending 1234 is linked, but no balance has been fetched yet');
    expect(o?.description).toMatch(/Refresh or Passbook/);
  });

  it('counts accounts when several are linked', () => {
    const o = providentFundEmptyOverride([
      { type: 'EPF', identifierLast4: '1234' },
      { type: 'PPF', identifierLast4: '9876' },
    ]);
    expect(o?.title).toMatch(/Your 2 provident fund accounts are linked/);
  });
});
