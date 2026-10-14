import { describe, it, expect } from 'vitest';
import { maskForChatbot, last4 } from '../../src/services/mcp/mask.js';

describe('maskForChatbot', () => {
  it('masks identifier keys to last 4', () => {
    expect(maskForChatbot({ accountNumber: '50100234564821', folio: '1234567/89', pan: 'ABCDE1234F', uan: '100200300400' }))
      .toEqual({ accountNumber: 'XXXX4821', folio: 'XXXX7/89', pan: 'XXXX234F', uan: 'XXXX0400' });
  });
  it('leaves money and quantities alone, even very large ones', () => {
    const v = { currentValue: '1234567890.12', quantity: '10.000000', count: 3 };
    expect(maskForChatbot(v)).toEqual(v);
  });
  it('masks long digit runs and PANs inside free text', () => {
    const out = maskForChatbot({ narration: 'Paid from A/c 50100234564821 PAN ABCDE1234F ref 77' });
    expect(out.narration).not.toMatch(/50100234564821|ABCDE1234F/);
    expect(out.narration).toContain('4821');
    expect(out.narration).toContain('ref 77');
  });
  it('masks a bare long integer string under any key', () => {
    expect(maskForChatbot({ note: '123456789012' }).note).toBe('XXXX9012');
  });
  it('walks arrays and nested objects', () => {
    expect(maskForChatbot({ rows: [{ meta: { cardNumber: '4111111111111111' } }] })).toEqual({ rows: [{ meta: { cardNumber: 'XXXX1111' } }] });
  });
  it('last4 handles empty values', () => {
    expect(last4(null)).toBeNull();
    expect(last4('')).toBeNull();
    expect(last4('12')).toBe('XXXX12');
  });
});
