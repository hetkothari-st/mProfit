import { describe, it, expect } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import { Decimal } from 'decimal.js';
import { formatTallyAmount, renderMastersXml, renderVouchersXml } from '../../../src/services/tally/tallyXml.js';

// Shapes follow Tally's own documentation:
//  - masters: Case Study I (help.tallysolutions.com) — HEADER VERSION/TALLYREQUEST
//    Import/TYPE Data/ID All Masters; LEDGER with NAME attribute AND <NAME>;
//    OPENINGBALANCE -12500 for a bank ledger (debit = negative).
//  - vouchers: Sample XML — ID Vouchers, BODY/DATA/TALLYMESSAGE/VOUCHER
//    VCHTYPE + ACTION="Create", DATE YYYYMMDD, and debit legs as
//    ISDEEMEDPOSITIVE Yes with a negative AMOUNT.

const d = (v: string) => new Decimal(v);
const parse = (xml: string) => new XMLParser({ ignoreAttributes: false }).parse(xml);

describe('formatTallyAmount', () => {
  it('writes exact decimals to two places, rounding half up, never via floating point', () => {
    expect(formatTallyAmount(d('1234.5'))).toBe('1234.50');
    expect(formatTallyAmount(d('0.005'))).toBe('0.01');
    expect(formatTallyAmount(d('0.1').plus(d('0.2')))).toBe('0.30');
    expect(formatTallyAmount(d('-12500'))).toBe('-12500.00');
  });
});

describe('renderMastersXml', () => {
  const xml = renderMastersXml({
    groups: [{ name: 'Equity Shares', parent: 'Investments' }],
    ledgers: [
      { name: 'ICICI Bank Savings 1234', parent: 'Bank Accounts', openingBalance: d('12500') },
      { name: "Owner's Capital", parent: 'Capital Account', openingBalance: d('-12500') },
      { name: 'Infosys Ltd', parent: 'Equity Shares', openingBalance: d('0') },
    ],
  });

  it("uses Tally's documented header and never alters a master that already exists", () => {
    expect(xml.startsWith(
      '<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>All Masters</ID></HEADER>',
    )).toBe(true);
    expect(xml).toContain('<DESC><STATICVARIABLES><IMPORTDUPS>@@DUPIGNORECOMBINE</IMPORTDUPS></STATICVARIABLES></DESC>');
    expect(parse(xml).ENVELOPE.HEADER.ID).toBe('All Masters');
  });

  it('creates each group before any ledger inside it', () => {
    expect(xml.indexOf('<GROUP NAME="Equity Shares"')).toBeLessThan(xml.indexOf('<LEDGER NAME="Infosys Ltd"'));
  });

  it('names every master with both the NAME attribute and a NAME element', () => {
    expect(xml).toContain(
      '<TALLYMESSAGE><GROUP NAME="Equity Shares" Action="Create"><NAME>Equity Shares</NAME><PARENT>Investments</PARENT></GROUP></TALLYMESSAGE>',
    );
    expect(xml).toContain(
      '<TALLYMESSAGE><LEDGER NAME="ICICI Bank Savings 1234" Action="Create"><NAME>ICICI Bank Savings 1234</NAME>' +
        '<PARENT>Bank Accounts</PARENT><OPENINGBALANCE>-12500.00</OPENINGBALANCE></LEDGER></TALLYMESSAGE>',
    );
  });

  it('writes a debit opening balance as negative and a credit one as positive, and escapes names', () => {
    expect(xml).toContain(
      '<LEDGER NAME="Owner&apos;s Capital" Action="Create"><NAME>Owner&apos;s Capital</NAME>' +
        '<PARENT>Capital Account</PARENT><OPENINGBALANCE>12500.00</OPENINGBALANCE></LEDGER>',
    );
  });

  it('leaves out a zero opening balance', () => {
    expect(xml).toContain('<LEDGER NAME="Infosys Ltd" Action="Create"><NAME>Infosys Ltd</NAME><PARENT>Equity Shares</PARENT></LEDGER>');
  });
});

describe('renderVouchersXml', () => {
  const xml = renderVouchersXml([
    {
      type: 'Journal',
      number: '1',
      date: '2024-04-15',
      narration: 'Buy 10 Infosys Ltd @ Rs. 1,450.00',
      lines: [
        { ledger: 'Infosys Ltd', amount: d('14500') },
        { ledger: 'Unallocated Funds', amount: d('-14500') },
      ],
    },
  ]);

  it("uses Tally's documented voucher import header", () => {
    expect(xml.startsWith(
      '<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER><BODY><DATA>',
    )).toBe(true);
    expect(parse(xml).ENVELOPE.HEADER.ID).toBe('Vouchers');
  });

  it('writes debits as negative with ISDEEMEDPOSITIVE Yes, and credits as positive with No', () => {
    expect(xml).toContain(
      '<TALLYMESSAGE><VOUCHER VCHTYPE="Journal" ACTION="Create"><DATE>20240415</DATE>' +
        '<VOUCHERTYPENAME>Journal</VOUCHERTYPENAME><VOUCHERNUMBER>1</VOUCHERNUMBER>' +
        '<NARRATION>Buy 10 Infosys Ltd @ Rs. 1,450.00</NARRATION>' +
        '<ALLLEDGERENTRIES.LIST><LEDGERNAME>Infosys Ltd</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-14500.00</AMOUNT></ALLLEDGERENTRIES.LIST>' +
        '<ALLLEDGERENTRIES.LIST><LEDGERNAME>Unallocated Funds</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>14500.00</AMOUNT></ALLLEDGERENTRIES.LIST>' +
        '</VOUCHER></TALLYMESSAGE>',
    );
  });

  it('keeps the file plain ASCII, writing other characters as numeric references', () => {
    const out = renderVouchersXml([
      {
        type: 'Journal',
        number: '2',
        date: '2024-04-16',
        narration: 'Café ₹',
        lines: [
          { ledger: 'A', amount: d('1') },
          { ledger: 'B', amount: d('-1') },
        ],
      },
    ]);
    expect(out).toContain('<NARRATION>Caf&#233; &#8377;</NARRATION>');
    expect(/^[\x20-\x7e]*$/.test(out)).toBe(true);
    expect(() => parse(out)).not.toThrow();
  });
});
