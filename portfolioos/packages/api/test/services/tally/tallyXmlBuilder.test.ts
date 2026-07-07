import { describe, it, expect } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import {
  escapeXml,
  formatTallyDate,
  formatTallyAmount,
  buildLedgerMessage,
  buildVoucherMessage,
  wrapTallyEnvelope,
} from '../../../src/services/reportBuilder/tally/tallyXmlBuilder.js';

describe('escapeXml', () => {
  it('escapes all five XML special characters', () => {
    expect(escapeXml(`Tom & Jerry's "Fund" <India>`)).toBe(
      'Tom &amp; Jerry&apos;s &quot;Fund&quot; &lt;India&gt;',
    );
  });
});

describe('formatTallyDate', () => {
  it('formats as YYYYMMDD with no separators', () => {
    expect(formatTallyDate(new Date(Date.UTC(2026, 2, 15)))).toBe('20260315');
  });

  it('zero-pads single-digit month and day', () => {
    expect(formatTallyDate(new Date(Date.UTC(2026, 0, 5)))).toBe('20260105');
  });
});

describe('formatTallyAmount', () => {
  it('formats to exactly two decimal places', () => {
    expect(formatTallyAmount('1234.5')).toBe('1234.50');
    expect(formatTallyAmount(1000)).toBe('1000.00');
  });
});

describe('buildLedgerMessage', () => {
  it('produces well-formed XML with a negative opening balance for debit-normal ledgers', () => {
    const xml = buildLedgerMessage({
      name: 'Bank Accounts',
      parentGroup: 'Bank Accounts',
      openingBalance: '5000',
      isDebitOpening: true,
    });
    expect(xml).toBe(
      '<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="Bank Accounts" ACTION="Create">' +
        '<PARENT>Bank Accounts</PARENT>' +
        '<OPENINGBALANCE>-5000.00</OPENINGBALANCE></LEDGER></TALLYMESSAGE>',
    );
    expect(xml).not.toContain('<NAME>'); // redundant child tag — NAME attribute alone identifies the ledger
    expect(() => new XMLParser().parse(xml)).not.toThrow();
  });

  it('positive opening balance for credit-normal ledgers', () => {
    const xml = buildLedgerMessage({
      name: 'Capital Account',
      parentGroup: 'Capital Account',
      openingBalance: '100000',
      isDebitOpening: false,
    });
    expect(xml).toContain('<OPENINGBALANCE>100000.00</OPENINGBALANCE>');
  });

  it('escapes special characters in ledger names', () => {
    const xml = buildLedgerMessage({
      name: `O'Brien & Sons`,
      parentGroup: 'Sundry Debtors',
      openingBalance: '0',
      isDebitOpening: true,
    });
    expect(xml).toContain('NAME="O&apos;Brien &amp; Sons"');
    expect(() => new XMLParser({ ignoreAttributes: false }).parse(xml)).not.toThrow();
  });

  // A bare & not followed by a known entity name (amp;/lt;/gt;/quot;/apos;)
  // is what broke xmllint on the original unescaped output — this catches
  // that regression directly, independent of the parser library.
  const BARE_AMPERSAND = /&(?!amp;|lt;|gt;|quot;|apos;)/;

  it.each([
    ['ampersand', 'Bonds & Debentures'],
    ['double quote', 'Broker "ABC" Demat'],
    ['apostrophe', "O'Reilly Trading"],
    ['angle brackets', 'Fund <India> Ltd'],
  ])('escapes a ledger name containing a %s so the XML stays well-formed', (_label, name) => {
    const xml = buildLedgerMessage({
      name,
      parentGroup: 'Sundry Debtors',
      openingBalance: '0',
      isDebitOpening: true,
    });
    expect(() => new XMLParser({ ignoreAttributes: false }).parse(xml)).not.toThrow();
    expect(xml).not.toMatch(BARE_AMPERSAND);
    expect(xml).not.toContain(`NAME="${name}"`); // raw, unescaped attribute value must not survive
  });
});

describe('buildVoucherMessage', () => {
  it('emits one ALLLEDGERENTRIES.LIST per leg with the debit/credit sign convention', () => {
    const xml = buildVoucherMessage({
      vchType: 'Purchase',
      voucherNumber: 'AUTO-BUY-txn1',
      date: new Date(Date.UTC(2026, 2, 15)),
      narration: 'Buy 10 INFY',
      entries: [
        { ledgerName: 'Equity Holdings', isDebit: true, amount: '1000' },
        { ledgerName: 'Bank Accounts', isDebit: false, amount: '1000' },
      ],
    });
    expect(xml).toBe(
      '<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="Purchase" ACTION="Create">' +
        '<DATE>20260315</DATE><VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>' +
        '<VOUCHERNUMBER>AUTO-BUY-txn1</VOUCHERNUMBER><NARRATION>Buy 10 INFY</NARRATION>' +
        '<ALLLEDGERENTRIES.LIST><LEDGERNAME>Equity Holdings</LEDGERNAME>' +
        '<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-1000.00</AMOUNT></ALLLEDGERENTRIES.LIST>' +
        '<ALLLEDGERENTRIES.LIST><LEDGERNAME>Bank Accounts</LEDGERNAME>' +
        '<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>1000.00</AMOUNT></ALLLEDGERENTRIES.LIST>' +
        '</VOUCHER></TALLYMESSAGE>',
    );
  });

  it('omits NARRATION entirely when null/undefined rather than emitting an empty tag', () => {
    const xml = buildVoucherMessage({
      vchType: 'Journal',
      voucherNumber: 'AUTO-1',
      date: new Date(Date.UTC(2026, 0, 1)),
      narration: null,
      entries: [
        { ledgerName: 'A', isDebit: true, amount: '1' },
        { ledgerName: 'B', isDebit: false, amount: '1' },
      ],
    });
    expect(xml).not.toContain('<NARRATION>');
  });
});

describe('wrapTallyEnvelope', () => {
  it('produces a well-formed ENVELOPE with the Import Data request shape', () => {
    const xml = wrapTallyEnvelope(['<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="X" ACTION="Create"/></TALLYMESSAGE>']);
    expect(xml).toContain('<TALLYREQUEST>Import Data</TALLYREQUEST>');
    expect(xml).toContain('<REPORTNAME>All Masters</REPORTNAME>');
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
    expect(parsed.ENVELOPE.HEADER.TALLYREQUEST).toBe('Import Data');
  });
});
