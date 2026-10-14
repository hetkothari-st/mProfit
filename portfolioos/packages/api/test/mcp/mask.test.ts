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
  it('masks spaced and hyphenated digit groups (phones, accounts, cards)', () => {
    const out = maskForChatbot({ a: 'Call +91 98765 43210', b: 'A/c 1234-5678-9012', c: 'Card 4111 1111 1111 1111' });
    expect(out.a).not.toMatch(/98765/);
    expect(out.b).not.toMatch(/1234-5678/);
    expect(out.c).not.toMatch(/\d{4} \d{4}/);
    expect(out.c).toContain('1111');
  });
  it('masks lowercase PAN, OTP, UPI ids and emails', () => {
    const out = maskForChatbot({ t: 'pan abcde1234f OTP 482913 via 9876543210@ybl mail ramesh.k@gmail.com' });
    expect(out.t).not.toMatch(/abcde1234f/i);
    expect(out.t).not.toContain('482913');
    expect(out.t).not.toContain('9876543210');
    expect(out.t).not.toContain('ramesh.k');
    expect(out.t).toContain('@ybl');
  });
  it('keeps Indian-format amounts and dates readable', () => {
    const v = { t: 'Paid 1,00,000.00 on 10/04/2026 and 2,40,000 later' };
    expect(maskForChatbot(v)).toEqual(v);
  });
  it('masks Indian vehicle registration plates in free text', () => {
    const out = maskForChatbot({ t: 'Maruti Swift (MH47BT5950) and MH 12 AB 1234 and DL3CAF0001' });
    expect(out.t).not.toMatch(/MH47BT|MH 12 AB|DL3CAF/);
    expect(out.t).toContain('5950');
    expect(out.t).toContain('Maruti Swift');
  });
});
