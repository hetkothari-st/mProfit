import { describe, it, expect } from 'vitest';
import { redactForLlm, redactText } from '../../src/ingestion/pii.js';

/**
 * Per CLAUDE.md §15.9: >=20 patterns covering PAN, Aadhaar, account numbers,
 * phone, CVV/PIN/OTP. Every test either asserts the exact redacted output
 * (to catch accidental over/under-match) or asserts that the redactor
 * leaves specific non-PII fields untouched (ISINs, amounts, dates,
 * institution names).
 */

describe('redactForLlm — PAN', () => {
  it('1. masks a bare PAN', () => {
    const { text, stats } = redactForLlm('PAN: ABCDE1234F');
    expect(text).toBe('PAN: XXXXX1234F');
    expect(stats.pan).toBe(1);
  });

  it('2. masks two PANs in one message', () => {
    const { text, stats } = redactForLlm('Primary ABCDE1234F, nominee XYZAB9999Z');
    expect(text).toBe('Primary XXXXX1234F, nominee XXXXX9999Z');
    expect(stats.pan).toBe(2);
  });

  it('3. leaves a non-PAN-shaped string alone', () => {
    // Only 4 letters → not a PAN
    const { text, stats } = redactForLlm('Ref: ABCD1234F transaction ok');
    expect(text).toBe('Ref: ABCD1234F transaction ok');
    expect(stats.pan).toBe(0);
  });
});

describe('redactForLlm — Aadhaar', () => {
  it('4. masks Aadhaar with spaces', () => {
    const { text, stats } = redactForLlm('Aadhaar 1234 5678 9012 verified');
    expect(text).toBe('Aadhaar XXXX XXXX 9012 verified');
    expect(stats.aadhaar).toBe(1);
  });

  it('5. masks Aadhaar with hyphens', () => {
    const { text } = redactForLlm('UID 1234-5678-9012');
    expect(text).toBe('UID XXXX XXXX 9012');
  });

  it('6. masks Aadhaar with no separators', () => {
    const { text } = redactForLlm('Aadhaar123456789012');
    expect(text).toBe('AadhaarXXXX XXXX 9012');
  });
});

describe('redactForLlm — account numbers', () => {
  it('7. masks a/c number preserving last 4', () => {
    const { text, stats } = redactForLlm('A/c 50100123456789 credited');
    expect(text).toBe('A/c XXXXXXXXXX6789 credited');
    expect(stats.account).toBe(1);
  });

  it('8. masks "Account Number: 12345678901"', () => {
    const { text } = redactForLlm('Account Number: 12345678901 with SBI');
    expect(text).toBe('Account Number: XXXXXXX8901 with SBI');
  });

  it('9. does NOT mask a short 6-digit reference (under 9-digit threshold)', () => {
    const { text, stats } = redactForLlm('Order 123456 placed');
    expect(text).toBe('Order 123456 placed');
    expect(stats.account).toBe(0);
  });

  it('10. does NOT mask a bare long digit run that is not Aadhaar-shaped', () => {
    // A 15-digit number (longer than Aadhaar, shorter than a card) not
    // under an "account" label → could be a txn id or order ref; leave
    // it for the model. Shorter 12-digit runs are deliberately caught
    // by the Aadhaar regex as a defensive mask.
    const { text, stats } = redactForLlm('Ref 123456789012345 completed');
    expect(text).toBe('Ref 123456789012345 completed');
    expect(stats.account).toBe(0);
    expect(stats.aadhaar).toBe(0);
  });

  it('11. masks "Acct 1234567890"', () => {
    const { text } = redactForLlm('Acct 1234567890 now has balance');
    expect(text).toBe('Acct XXXXXX7890 now has balance');
  });
});

describe('redactForLlm — phone', () => {
  it('12. masks a 10-digit Indian mobile with +91 prefix', () => {
    const { text, stats } = redactForLlm('Call +91 9876543210');
    expect(text).toBe('Call XXXXXXX3210');
    expect(stats.phone).toBe(1);
  });

  it('13. masks a bare 10-digit mobile starting with 9', () => {
    const { text } = redactForLlm('Contact 9876543210 for support');
    expect(text).toBe('Contact XXXXXXX3210 for support');
  });

  it('14. masks a mobile with hyphens', () => {
    const { text } = redactForLlm('98765-43210 reachable');
    expect(text).toBe('XXXXXXX3210 reachable');
  });
});

describe('redactForLlm — CVV / PIN / OTP (full blank)', () => {
  it('15. blanks a 3-digit CVV after the "CVV" label', () => {
    const { text, stats } = redactForLlm('CVV 123 to confirm');
    expect(text).toBe('CVV [REDACTED] to confirm');
    expect(stats.cvv).toBe(1);
  });

  it('16. blanks a 4-digit ATM PIN', () => {
    const { text, stats } = redactForLlm('Your ATM PIN is 4567');
    expect(text).toBe('Your ATM PIN is [REDACTED]');
    expect(stats.pin).toBe(1);
  });

  it('17. blanks a 6-digit OTP', () => {
    const { text, stats } = redactForLlm('OTP: 987654 valid for 5 min');
    expect(text).toBe('OTP: [REDACTED] valid for 5 min');
    expect(stats.otp).toBe(1);
  });

  it('18. blanks OTP introduced by "is"', () => {
    const { text } = redactForLlm('Your OTP is 123456 for login');
    expect(text).toBe('Your OTP is [REDACTED] for login');
  });
});

describe('redactForLlm — preservation (things we must NOT redact)', () => {
  it('19. leaves ISINs untouched (12-char alphanumeric, looks like PAN but isn\'t)', () => {
    const { text, stats } = redactForLlm('ISIN INE009A01021 equity');
    expect(text).toBe('ISIN INE009A01021 equity');
    expect(stats.pan).toBe(0);
  });

  it('20. leaves Rupee amounts and ISO dates untouched (they are NOT PII)', () => {
    const input = 'Credited Rs. 1,25,000.00 on 21-Apr-2026 to your a/c 50100123456789';
    const { text } = redactForLlm(input);
    // Amount and date preserved verbatim; only the account mask applied.
    expect(text).toContain('Rs. 1,25,000.00');
    expect(text).toContain('21-Apr-2026');
    expect(text).toContain('XXXXXXXXXX6789');
  });

  it('21. leaves institution names and stock symbols intact', () => {
    const { text } = redactForLlm('HDFC Bank alert: INFY shares allotted via Zerodha');
    expect(text).toBe('HDFC Bank alert: INFY shares allotted via Zerodha');
  });
});

describe('redactForLlm — combined (realistic email bodies)', () => {
  it('22. HDFC-style credit alert: masks a/c + phone but keeps amount/date', () => {
    const input = [
      'Dear Customer,',
      'Rs. 1,25,000.00 has been credited to your A/c 50100123456789 on 21-Apr-2026',
      'from RAJESH KUMAR via UPI. If not you, call +91 9876543210.',
    ].join('\n');
    const { text, stats } = redactForLlm(input);
    expect(text).toContain('Rs. 1,25,000.00');
    expect(text).toContain('21-Apr-2026');
    expect(text).toContain('XXXXXXXXXX6789'); // account
    expect(text).toContain('XXXXXXX3210'); // phone
    expect(stats.account).toBe(1);
    expect(stats.phone).toBe(1);
  });

  it('23. Zerodha-style contract note excerpt: PAN masked, order number kept', () => {
    const input =
      'Client PAN: ABCDE1234F. Order no 2026042100012345 for INFY at Rs. 1500.';
    const { text, stats } = redactForLlm(input);
    expect(text).toContain('XXXXX1234F');
    // Bare 16-digit order number is NOT in a labelled account context,
    // so it stays as-is for the parser to consume.
    expect(text).toContain('2026042100012345');
    expect(stats.pan).toBe(1);
    expect(stats.account).toBe(0);
  });
});

describe('redactText — thin wrapper', () => {
  it('24. returns only the redacted string', () => {
    expect(redactText('PAN: ABCDE1234F')).toBe('PAN: XXXXX1234F');
  });
});
