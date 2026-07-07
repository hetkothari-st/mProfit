/**
 * Low-level Tally XML construction helpers.
 *
 * No XML-builder dependency exists in this repo (checked package.json /
 * pnpm-lock.yaml — only a transitive `xmlbuilder` pulled in by `twilio`,
 * not a declared dependency, so importing it would be fragile). Matches
 * the repo's existing convention for generated documents (pdfkit/exceljs
 * calls, `pdfSafe()` escaping in mprofitStyle.ts): hand-built template
 * strings with every interpolated value passed through `escapeXml`.
 *
 * Shape reference — Tally's "Import Data" XML (help.tallysolutions.com):
 *
 * <ENVELOPE>
 *   <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
 *   <BODY>
 *     <IMPORTDATA>
 *       <REQUESTDESC>
 *         <REPORTNAME>All Masters</REPORTNAME>
 *         <STATICVARIABLES><SVCURRENTCOMPANY>...</SVCURRENTCOMPANY></STATICVARIABLES>
 *       </REQUESTDESC>
 *       <REQUESTDATA>
 *         <TALLYMESSAGE xmlns:UDF="TallyUDF">...one LEDGER/VOUCHER...</TALLYMESSAGE>
 *       </REQUESTDATA>
 *     </IMPORTDATA>
 *   </BODY>
 * </ENVELOPE>
 */

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Tally dates are `YYYYMMDD`, no separators, no locale variance. */
export function formatTallyDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** Tally amounts are plain decimals (no currency symbol, no thousands separators). */
export function formatTallyAmount(value: string | number): string {
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return n.toFixed(2);
}

export interface TallyLedgerInput {
  name: string;
  parentGroup: string;
  openingBalance: string;
  /** ASSET/EXPENSE ledgers carry a debit opening balance in Tally's convention. */
  isDebitOpening: boolean;
}

/**
 * One <TALLYMESSAGE> wrapping a <LEDGER ACTION="Create">. `ACTION="Create"`
 * is used for both new-ledger creation and (per Tally's own duplicate-name
 * handling) update-in-place if a same-named ledger already exists in the
 * destination company — see the in-app help copy for what that means for
 * the user.
 */
export function buildLedgerMessage(input: TallyLedgerInput): string {
  const name = escapeXml(input.name);
  const parent = escapeXml(input.parentGroup);
  const opening = formatTallyAmount(input.openingBalance);
  // Tally's OPENINGBALANCE sign convention matches ALLLEDGERENTRIES: debit
  // balances (Assets/Expenses) are negative, credit balances (Liabilities/
  // Income/Equity) are positive. See tallyExport.service.ts for the same
  // convention applied to voucher entries, and the caveat that this must be
  // empirically verified against a real Tally install before production use.
  const signedOpening = input.isDebitOpening ? `-${opening}` : opening;
  // NAME attribute alone identifies the ledger to Tally's importer — the
  // child <NAME> element used in the original implementation duplicated it
  // with no basis in Tally's own documentation examples; dropped.
  return (
    `<TALLYMESSAGE xmlns:UDF="TallyUDF">` +
    `<LEDGER NAME="${name}" ACTION="Create">` +
    `<PARENT>${parent}</PARENT>` +
    `<OPENINGBALANCE>${signedOpening}</OPENINGBALANCE>` +
    `</LEDGER>` +
    `</TALLYMESSAGE>`
  );
}

export interface TallyVoucherLedgerEntry {
  ledgerName: string;
  /** true = this leg is the debit side of the entry. */
  isDebit: boolean;
  amount: string;
}

export interface TallyVoucherInput {
  vchType: string; // Tally VCHTYPE / VOUCHERTYPENAME, e.g. "Purchase"
  voucherNumber: string;
  date: Date;
  narration?: string | null;
  entries: TallyVoucherLedgerEntry[];
}

/**
 * One <TALLYMESSAGE> wrapping a <VOUCHER ACTION="Create">. Each ledger leg
 * becomes one <ALLLEDGERENTRIES.LIST> block with <AMOUNT> + <ISDEEMEDPOSITIVE>
 * per the debit/credit sign convention documented in tallyExport.service.ts.
 */
export function buildVoucherMessage(input: TallyVoucherInput): string {
  const vchType = escapeXml(input.vchType);
  const voucherNumber = escapeXml(input.voucherNumber);
  const date = formatTallyDate(input.date);
  const narration = input.narration ? `<NARRATION>${escapeXml(input.narration)}</NARRATION>` : '';

  const legs = input.entries
    .map((e) => {
      const ledgerName = escapeXml(e.ledgerName);
      const amount = formatTallyAmount(e.amount);
      // Debit legs: negative amount + ISDEEMEDPOSITIVE Yes.
      // Credit legs: positive amount + ISDEEMEDPOSITIVE No.
      const signedAmount = e.isDebit ? `-${amount}` : amount;
      const isDeemedPositive = e.isDebit ? 'Yes' : 'No';
      return (
        `<ALLLEDGERENTRIES.LIST>` +
        `<LEDGERNAME>${ledgerName}</LEDGERNAME>` +
        `<ISDEEMEDPOSITIVE>${isDeemedPositive}</ISDEEMEDPOSITIVE>` +
        `<AMOUNT>${signedAmount}</AMOUNT>` +
        `</ALLLEDGERENTRIES.LIST>`
      );
    })
    .join('');

  return (
    `<TALLYMESSAGE xmlns:UDF="TallyUDF">` +
    `<VOUCHER VCHTYPE="${vchType}" ACTION="Create">` +
    `<DATE>${date}</DATE>` +
    `<VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>` +
    `<VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER>` +
    narration +
    legs +
    `</VOUCHER>` +
    `</TALLYMESSAGE>`
  );
}

/**
 * Full <ENVELOPE> wrapper. `reportName` is the `<REPORTNAME>` hint Tally's
 * importer uses — "All Masters" accepts a mix of LEDGER/GROUP/VOUCHER
 * TALLYMESSAGE blocks in one file (this is the convention used to make the
 * vouchers export self-contained — see tallyExport.service.ts), so both
 * builders in this module use "All Masters" rather than a separate
 * "Vouchers" report name. Verify against a real Tally/TallyPrime install
 * before shipping (see BLOCKED.md-equivalent note in the task summary).
 */
export function wrapTallyEnvelope(messages: string[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<ENVELOPE>` +
    `<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>` +
    `<BODY>` +
    `<IMPORTDATA>` +
    `<REQUESTDESC>` +
    `<REPORTNAME>All Masters</REPORTNAME>` +
    `</REQUESTDESC>` +
    `<REQUESTDATA>` +
    messages.join('') +
    `</REQUESTDATA>` +
    `</IMPORTDATA>` +
    `</BODY>` +
    `</ENVELOPE>`
  );
}
