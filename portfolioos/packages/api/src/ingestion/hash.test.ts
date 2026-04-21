import { describe, it, expect } from 'vitest';
import {
  gmailSourceHash,
  casSourceHash,
  statementSourceHash,
  eventWithinSourceHash,
  bodyStructureHash,
  normalizeForStructureHash,
} from './hash.js';

describe('gmailSourceHash', () => {
  it('is deterministic for the same messageId', () => {
    const a = gmailSourceHash('18bc72f3d4e1a000');
    const b = gmailSourceHash('18bc72f3d4e1a000');
    expect(a).toBe(b);
  });

  it('produces 64-char hex (sha256)', () => {
    expect(gmailSourceHash('abc')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('different messageIds → different hashes', () => {
    expect(gmailSourceHash('msg-1')).not.toBe(gmailSourceHash('msg-2'));
  });

  it('rejects empty messageId (would collide across all sources)', () => {
    expect(() => gmailSourceHash('')).toThrow();
  });
});

describe('casSourceHash', () => {
  it('is deterministic for identical file bytes', () => {
    const bytes = Buffer.from('fake-pdf-contents');
    expect(casSourceHash(bytes)).toBe(casSourceHash(bytes));
  });

  it('different byte sequences → different hashes', () => {
    const a = casSourceHash(Buffer.from('file-a'));
    const b = casSourceHash(Buffer.from('file-b'));
    expect(a).not.toBe(b);
  });

  it('scope-prefixed so a file-hash can never collide with a gmail-hash', () => {
    // The file-bytes of "abc" and the gmailSourceHash("abc") should differ
    // even though both carry the 3-byte content "abc" — because of the
    // `cas:` vs `gmail:` scope.
    const fileHash = casSourceHash(Buffer.from('abc'));
    const msgHash = gmailSourceHash('abc');
    expect(fileHash).not.toBe(msgHash);
  });
});

describe('statementSourceHash', () => {
  it('is deterministic for the same natural key', () => {
    const a = statementSourceHash({
      accountLast4: '1234',
      txDate: '2026-04-21',
      amount: '12500.00',
      description: 'UPI from Rajesh',
    });
    const b = statementSourceHash({
      accountLast4: '1234',
      txDate: '2026-04-21',
      amount: '12500.00',
      description: 'UPI from Rajesh',
    });
    expect(a).toBe(b);
  });

  it('normalises whitespace in description (mail reflow resilience)', () => {
    const a = statementSourceHash({
      accountLast4: '1234',
      txDate: '2026-04-21',
      amount: '12500.00',
      description: 'UPI   from    Rajesh',
    });
    const b = statementSourceHash({
      accountLast4: '1234',
      txDate: '2026-04-21',
      amount: '12500.00',
      description: '  UPI from Rajesh  ',
    });
    expect(a).toBe(b);
  });

  it('different amounts → different hashes (no silent merge)', () => {
    const base = {
      accountLast4: '1234',
      txDate: '2026-04-21',
      description: 'UPI from Rajesh',
    };
    expect(
      statementSourceHash({ ...base, amount: '1000' }),
    ).not.toBe(statementSourceHash({ ...base, amount: '1001' }));
  });
});

describe('eventWithinSourceHash', () => {
  it('different indices under the same source → different event hashes', () => {
    const source = gmailSourceHash('msg-abc');
    const a = eventWithinSourceHash({
      sourceHash: source,
      index: 0,
      amount: '100',
      eventDate: '2026-04-21',
    });
    const b = eventWithinSourceHash({
      sourceHash: source,
      index: 1,
      amount: '100',
      eventDate: '2026-04-21',
    });
    expect(a).not.toBe(b);
  });

  it('same (source, index, amount, date) is stable across calls', () => {
    const source = gmailSourceHash('msg-abc');
    const a = eventWithinSourceHash({
      sourceHash: source,
      index: 3,
      amount: '500.50',
      eventDate: '2026-04-21',
    });
    const b = eventWithinSourceHash({
      sourceHash: source,
      index: 3,
      amount: '500.50',
      eventDate: '2026-04-21',
    });
    expect(a).toBe(b);
  });
});

describe('bodyStructureHash', () => {
  it('same template with different values → same hash', () => {
    // Two HDFC-style credit-alert emails with different amount, date,
    // account-last-4, and UPI reference — should hash identically because
    // only numeric/date fields vary. Counterparty names are part of the
    // template surface (§6.3 normalisation does not replace proper nouns),
    // so we keep them fixed across both samples.
    const a = `
      Dear Customer,
      Rs. 1,25,000.00 has been credited to your account XX1234 on 21-Apr-2026
      from SENDER NAME via UPI (UPI Ref: 612345678901).
      HDFC Bank
    `;
    const b = `
      Dear Customer,
      Rs. 45,000.00 has been credited to your account XX5678 on 03-Feb-2026
      from SENDER NAME via UPI (UPI Ref: 987654321099).
      HDFC Bank
    `;
    expect(bodyStructureHash(a)).toBe(bodyStructureHash(b));
  });

  it('different templates → different hashes', () => {
    const hdfcAlert = 'Rs. 1000 credited to XX1234 on 21-Apr-2026';
    const zerodhaFill = 'You bought 100 shares of INFY at Rs. 1500 on 2026-04-21';
    expect(bodyStructureHash(hdfcAlert)).not.toBe(bodyStructureHash(zerodhaFill));
  });

  it('strips HTML and normalises to the same hash as the plain-text twin', () => {
    const html = '<p>Your balance is <b>Rs. 500.00</b> as of 21-Apr-2026.</p>';
    const text = 'Your balance is Rs. 500.00 as of 21-Apr-2026.';
    expect(bodyStructureHash(html)).toBe(bodyStructureHash(text));
  });

  it('is case-insensitive on the email body', () => {
    const lower = 'rs. 100 credited on 21-apr-2026';
    const upper = 'RS. 100 CREDITED ON 21-APR-2026';
    expect(bodyStructureHash(lower)).toBe(bodyStructureHash(upper));
  });

  it('returns a 16-char hex fingerprint', () => {
    expect(bodyStructureHash('hello world')).toMatch(/^[a-f0-9]{16}$/);
  });

  it('URLs of different domains still hash to the same template', () => {
    const a = 'Click here: https://example.com/pay/abc123';
    const b = 'Click here: https://different-domain.net/pay/xyz789';
    expect(bodyStructureHash(a)).toBe(bodyStructureHash(b));
  });

  it('email sender difference in the body does not change the hash', () => {
    const a = 'Contact alerts@hdfcbank.net for queries';
    const b = 'Contact support@icicibank.com for queries';
    expect(bodyStructureHash(a)).toBe(bodyStructureHash(b));
  });

  it('preserves table/list structure via block-tag → newline conversion', () => {
    // Two emails with the same table shape (3 rows) should hash the same
    // regardless of the cell values.
    const a = '<table><tr><td>Rs. 100</td><td>21-Apr-2026</td></tr></table>';
    const b = '<table><tr><td>Rs. 999</td><td>01-Jan-2020</td></tr></table>';
    expect(bodyStructureHash(a)).toBe(bodyStructureHash(b));
  });
});

describe('normalizeForStructureHash (inspect normalization output)', () => {
  it('replaces a Rupee amount with <AMT> and keeps the sentence frame', () => {
    const out = normalizeForStructureHash('You paid Rs. 1,234.56 today');
    expect(out).toContain('<AMT>'.toLowerCase());
    // `today` is kept as-is; only values were replaced.
    expect(out).toContain('you paid');
    expect(out).toContain('today');
  });

  it('replaces ISO and DD-MMM-YYYY dates with <DATE>', () => {
    expect(normalizeForStructureHash('on 2026-04-21 only')).toContain('<date>');
    expect(normalizeForStructureHash('on 21-Apr-2026 only')).toContain('<date>');
  });
});
