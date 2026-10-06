import { describe, it, expect } from 'vitest';
import { amountInWords } from '../../src/services/receipts/amountInWords.js';

describe('the amount spelled out on a receipt', () => {
  it('uses Indian groups, not millions', () => {
    expect(amountInWords('45000')).toBe('Forty-five thousand rupees only');
    expect(amountInWords('450000')).toBe('Four lakh fifty thousand rupees only');
    expect(amountInWords('45000000')).toBe('Four crore fifty lakh rupees only');
  });

  it('handles the awkward middles', () => {
    expect(amountInWords('101')).toBe('One hundred one rupees only');
    expect(amountInWords('1015')).toBe('One thousand fifteen rupees only');
    expect(amountInWords('119')).toBe('One hundred nineteen rupees only');
    expect(amountInWords('1000000')).toBe('Ten lakh rupees only');
  });

  it('spells paise separately, and says nothing when there are none', () => {
    expect(amountInWords('1250.50')).toBe('One thousand two hundred fifty rupees and fifty paise only');
    expect(amountInWords('1250.00')).toBe('One thousand two hundred fifty rupees only');
  });

  it('rounds sub-paise, carrying into the rupees when it must', () => {
    // The ledger keeps four decimals; a receipt cannot be written for a tenth
    // of a paisa, and 99.999 must not print as "ninety-nine and 100 paise".
    expect(amountInWords('99.9990')).toBe('One hundred rupees only');
    expect(amountInWords('10.0049')).toBe('Ten rupees only');
    expect(amountInWords('10.0050')).toBe('Ten rupees and one paise only');
  });

  it('survives zero and a number bigger than any one portfolio', () => {
    expect(amountInWords('0')).toBe('Zero rupees only');
    expect(amountInWords('12345678901')).toBe(
      'One thousand two hundred thirty-four crore fifty-six lakh seventy-eight thousand nine hundred one rupees only',
    );
  });
});
