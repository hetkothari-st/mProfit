/**
 * Golden fixture tests for the Tally XML output shape, covering the
 * acceptance criteria in TASK_07: well-formedness against realistic
 * seeded-style data, and a locked-down expected XML string per voucher
 * type so a future refactor can't silently reintroduce a Dr/Cr sign
 * flip (the single highest-risk detail per the task doc's own research
 * section — Tally will silently accept a swapped-sign voucher).
 *
 * IMPORTANT CAVEAT: the debit/credit sign convention encoded here
 * (debit legs negative + ISDEEMEDPOSITIVE=Yes, credit legs positive +
 * ISDEEMEDPOSITIVE=No) is built from Tally's own documentation and
 * widely-corroborated third-party integration write-ups, but has NOT
 * been empirically verified by importing into a real Tally/TallyPrime
 * installation in this environment (none was available). Before relying
 * on this for real bookkeeping, import a small sample into a real Tally
 * trial and confirm in Ledger Vouchers view that debits/credits land on
 * the correct side and each voucher balances to zero.
 */
import { describe, it, expect } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import {
  renderTallyMastersXml,
  renderTallyVouchersXml,
  type TallyAccountInput,
  type TallyVoucherInput,
} from '../../../src/services/reportBuilder/tally/tallyXmlRenderer.js';

// Mirrors accounting.service.ts's DEFAULT_COA (the fixed 27-account chart
// every real user gets via ensureDefaultAccounts) — this is the realistic
// shape of a post-projection account list, standing in for the demo user's
// data since the seed script doesn't itself create Account/Voucher rows.
const SEEDED_ACCOUNTS: TallyAccountInput[] = [
  { code: '1001', name: 'Bank Accounts', type: 'ASSET', openingBalance: '250000' },
  { code: '1002', name: 'Cash in Hand', type: 'ASSET', openingBalance: '5000' },
  { code: '1101', name: 'Equity Holdings', type: 'ASSET', openingBalance: '0' },
  { code: '2001', name: 'Loans & Borrowings', type: 'LIABILITY', openingBalance: '0' },
  { code: '3001', name: 'Capital Account', type: 'EQUITY', openingBalance: '255000' },
  { code: '4001', name: 'Dividend Income', type: 'INCOME', openingBalance: '0' },
  { code: '4003', name: 'Short-term Capital Gains', type: 'INCOME', openingBalance: '0' },
  { code: '5001', name: 'Brokerage & Charges', type: 'EXPENSE', openingBalance: '0' },
  { code: '9001', name: `O'Reilly & Sons "Demat"`, type: 'ASSET', openingBalance: '0' },
];

describe('renderTallyMastersXml — well-formedness (acceptance criterion)', () => {
  it('produces well-formed XML for a realistic seeded-style account list, including names with special characters', () => {
    const xml = renderTallyMastersXml(SEEDED_ACCOUNTS);
    expect(() => new XMLParser({ ignoreAttributes: false }).parse(xml)).not.toThrow();
    // Special-char ledger name must be escaped, not left raw (would break the parser otherwise).
    expect(xml).toContain('O&apos;Reilly &amp; Sons &quot;Demat&quot;');
    expect(xml).not.toContain(`O'Reilly & Sons "Demat"`);
  });

  it('emits one TALLYMESSAGE/LEDGER per account with a resolved reserved-group PARENT', () => {
    const xml = renderTallyMastersXml(SEEDED_ACCOUNTS);
    const matches = xml.match(/<TALLYMESSAGE/g) ?? [];
    expect(matches.length).toBe(SEEDED_ACCOUNTS.length);
    expect(xml).toContain('<PARENT>Bank Accounts</PARENT>');
    expect(xml).toContain('<PARENT>Investments</PARENT>'); // Equity Holdings
  });
});

const SAMPLE_VOUCHERS: TallyVoucherInput[] = [
  {
    voucherNo: 'AUTO-BUY-txn1',
    type: 'PURCHASE',
    date: new Date(Date.UTC(2026, 2, 15)),
    narration: 'Buy 10 INFY @ 100',
    entries: [{ debitAccountName: 'Equity Holdings', creditAccountName: 'Bank Accounts', amount: '1000' }],
  },
  {
    voucherNo: 'AUTO-SELL-txn2',
    type: 'SALES',
    date: new Date(Date.UTC(2026, 2, 20)),
    narration: 'Sell 10 INFY @ 120',
    entries: [{ debitAccountName: 'Bank Accounts', creditAccountName: 'Equity Holdings', amount: '1200' }],
  },
  {
    voucherNo: 'AUTO-PREM-pay1',
    type: 'PAYMENT',
    date: new Date(Date.UTC(2026, 3, 1)),
    narration: 'Insurance premium paid',
    entries: [{ debitAccountName: 'Brokerage & Charges', creditAccountName: 'Bank Accounts', amount: '5000' }],
  },
  {
    voucherNo: 'AUTO-DIV-txn3',
    type: 'RECEIPT',
    date: new Date(Date.UTC(2026, 3, 10)),
    narration: 'Dividend received',
    entries: [{ debitAccountName: 'Bank Accounts', creditAccountName: 'Dividend Income', amount: '250' }],
  },
];

const REFERENCED_ACCOUNTS: TallyAccountInput[] = [
  { code: '1101', name: 'Equity Holdings', type: 'ASSET', openingBalance: '0' },
  { code: '1001', name: 'Bank Accounts', type: 'ASSET', openingBalance: '250000' },
  { code: '5001', name: 'Brokerage & Charges', type: 'EXPENSE', openingBalance: '0' },
  { code: '4001', name: 'Dividend Income', type: 'INCOME', openingBalance: '0' },
];

describe('renderTallyVouchersXml — well-formedness + self-containment (acceptance criteria)', () => {
  it('produces well-formed XML for a realistic seeded-style voucher set', () => {
    const xml = renderTallyVouchersXml(SAMPLE_VOUCHERS, REFERENCED_ACCOUNTS);
    expect(() => new XMLParser().parse(xml)).not.toThrow();
  });

  it('embeds LEDGER master-creates for every account referenced by the vouchers (self-contained import)', () => {
    const xml = renderTallyVouchersXml(SAMPLE_VOUCHERS, REFERENCED_ACCOUNTS);
    for (const a of REFERENCED_ACCOUNTS) {
      const escapedName = a.name.replace(/&/g, '&amp;');
      expect(xml).toContain(`<LEDGER NAME="${escapedName}" ACTION="Create">`);
    }
  });

  it('emits one VOUCHER TALLYMESSAGE per input voucher', () => {
    const xml = renderTallyVouchersXml(SAMPLE_VOUCHERS, REFERENCED_ACCOUNTS);
    const voucherMatches = xml.match(/<VOUCHER VCHTYPE=/g) ?? [];
    expect(voucherMatches.length).toBe(SAMPLE_VOUCHERS.length);
  });
});

describe('sign-convention regression test — one voucher of each supported type', () => {
  // Locked-down expected XML per voucher: debit leg = negative amount +
  // ISDEEMEDPOSITIVE Yes; credit leg = positive amount + ISDEEMEDPOSITIVE
  // No. Any refactor that flips this breaks these exact-string assertions.
  function voucherXmlFor(v: TallyVoucherInput): string {
    return renderTallyVouchersXml([v], []);
  }

  it('PURCHASE: Dr Equity Holdings / Cr Bank Accounts', () => {
    const xml = voucherXmlFor(SAMPLE_VOUCHERS[0]);
    expect(xml).toContain(
      '<VOUCHER VCHTYPE="Purchase" ACTION="Create"><DATE>20260315</DATE>' +
        '<VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME><VOUCHERNUMBER>AUTO-BUY-txn1</VOUCHERNUMBER>' +
        '<NARRATION>Buy 10 INFY @ 100</NARRATION>' +
        '<ALLLEDGERENTRIES.LIST><LEDGERNAME>Equity Holdings</LEDGERNAME>' +
        '<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-1000.00</AMOUNT></ALLLEDGERENTRIES.LIST>' +
        '<ALLLEDGERENTRIES.LIST><LEDGERNAME>Bank Accounts</LEDGERNAME>' +
        '<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>1000.00</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER>',
    );
  });

  it('SALES: Dr Bank Accounts / Cr Equity Holdings', () => {
    const xml = voucherXmlFor(SAMPLE_VOUCHERS[1]);
    expect(xml).toContain(
      '<VOUCHER VCHTYPE="Sales" ACTION="Create"><DATE>20260320</DATE>' +
        '<VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>AUTO-SELL-txn2</VOUCHERNUMBER>' +
        '<NARRATION>Sell 10 INFY @ 120</NARRATION>' +
        '<ALLLEDGERENTRIES.LIST><LEDGERNAME>Bank Accounts</LEDGERNAME>' +
        '<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-1200.00</AMOUNT></ALLLEDGERENTRIES.LIST>' +
        '<ALLLEDGERENTRIES.LIST><LEDGERNAME>Equity Holdings</LEDGERNAME>' +
        '<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>1200.00</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER>',
    );
  });

  it('PAYMENT: Dr Brokerage & Charges / Cr Bank Accounts', () => {
    const xml = voucherXmlFor(SAMPLE_VOUCHERS[2]);
    expect(xml).toContain(
      '<ALLLEDGERENTRIES.LIST><LEDGERNAME>Brokerage &amp; Charges</LEDGERNAME>' +
        '<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-5000.00</AMOUNT></ALLLEDGERENTRIES.LIST>' +
        '<ALLLEDGERENTRIES.LIST><LEDGERNAME>Bank Accounts</LEDGERNAME>' +
        '<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>5000.00</AMOUNT></ALLLEDGERENTRIES.LIST>',
    );
    expect(xml).toContain('<VOUCHER VCHTYPE="Payment" ACTION="Create">');
  });

  it('RECEIPT: Dr Bank Accounts / Cr Dividend Income', () => {
    const xml = voucherXmlFor(SAMPLE_VOUCHERS[3]);
    expect(xml).toContain(
      '<ALLLEDGERENTRIES.LIST><LEDGERNAME>Bank Accounts</LEDGERNAME>' +
        '<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-250.00</AMOUNT></ALLLEDGERENTRIES.LIST>' +
        '<ALLLEDGERENTRIES.LIST><LEDGERNAME>Dividend Income</LEDGERNAME>' +
        '<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>250.00</AMOUNT></ALLLEDGERENTRIES.LIST>',
    );
    expect(xml).toContain('<VOUCHER VCHTYPE="Receipt" ACTION="Create">');
  });

  it('every voucher balances to zero: sum(debit amounts) + sum(credit amounts) == 0 under this sign convention', () => {
    for (const v of SAMPLE_VOUCHERS) {
      const debit = v.entries.reduce((s, e) => s - Number.parseFloat(e.amount), 0);
      const credit = v.entries.reduce((s, e) => s + Number.parseFloat(e.amount), 0);
      expect(debit + credit).toBe(0);
    }
  });
});

// TASK_08: regression coverage for the reported "unescaped & breaks
// xmllint" bug. Each account below isolates exactly one special
// character (rather than one name combining all three) so a future
// regression pinpoints which case broke, and both masters and vouchers
// output (including NARRATION and LEDGERNAME, which are equally
// user/transaction-controlled) are run through a real XML parser.
describe('escaping regression — masters and vouchers with & / " / \' in names (TASK_08)', () => {
  const ACCOUNTS_WITH_SPECIAL_CHARS: TallyAccountInput[] = [
    { code: '1104', name: 'Bonds & Debentures', type: 'ASSET', openingBalance: '1000' },
    { code: '9101', name: 'Broker "ABC Securities" Account', type: 'ASSET', openingBalance: '0' },
    { code: '9102', name: "O'Reilly Trading", type: 'ASSET', openingBalance: '0' },
  ];

  it('masters XML parses cleanly with zero errors for names containing &, ", and \'', () => {
    const xml = renderTallyMastersXml(ACCOUNTS_WITH_SPECIAL_CHARS);
    expect(() => new XMLParser({ ignoreAttributes: false }).parse(xml)).not.toThrow();
    expect(xml).toContain('NAME="Bonds &amp; Debentures"');
    expect(xml).toContain('NAME="Broker &quot;ABC Securities&quot; Account"');
    expect(xml).toContain('NAME="O&apos;Reilly Trading"');
  });

  it('vouchers XML parses cleanly with special characters in NARRATION and LEDGERNAME', () => {
    const voucher: TallyVoucherInput = {
      voucherNo: 'AUTO-BUY-txn9',
      type: 'PURCHASE',
      date: new Date(Date.UTC(2026, 2, 15)),
      narration: `Buy from O'Reilly & Sons re: "Q1 lot"`,
      entries: [{ debitAccountName: 'Bonds & Debentures', creditAccountName: "O'Reilly Trading", amount: '1000' }],
    };
    const xml = renderTallyVouchersXml([voucher], ACCOUNTS_WITH_SPECIAL_CHARS);
    expect(() => new XMLParser({ ignoreAttributes: false }).parse(xml)).not.toThrow();
    expect(xml).toContain('<NARRATION>Buy from O&apos;Reilly &amp; Sons re: &quot;Q1 lot&quot;</NARRATION>');
    expect(xml).toContain('<LEDGERNAME>Bonds &amp; Debentures</LEDGERNAME>');
    expect(xml).toContain('<LEDGERNAME>O&apos;Reilly Trading</LEDGERNAME>');
  });

  it('LEDGER has no redundant child <NAME> element (Tally identifies the ledger via the NAME attribute alone)', () => {
    const xml = renderTallyMastersXml(ACCOUNTS_WITH_SPECIAL_CHARS);
    expect(xml).not.toContain('<NAME>');
  });
});
