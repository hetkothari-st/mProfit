/**
 * Tally XML, in the shapes Tally's own documentation shows
 * (help.tallysolutions.com):
 *
 *  - Masters — Case Study I: HEADER VERSION 1 / TALLYREQUEST Import / TYPE
 *    Data / ID All Masters; each LEDGER carries its name as both the NAME
 *    attribute and a <NAME> element; a bank ledger's debit opening balance is
 *    written -12500.
 *  - Vouchers — Sample XML: ID Vouchers, BODY/DATA/TALLYMESSAGE/VOUCHER with
 *    VCHTYPE and ACTION="Create", DATE as YYYYMMDD, and a debit leg as
 *    ISDEEMEDPOSITIVE Yes with a negative AMOUNT (credit: No, positive).
 *
 * Masters and vouchers go in separate files: Tally imports them as separate
 * requests.
 *
 * Output is plain ASCII. Anything else is written as a numeric character
 * reference, so the file reads the same whatever encoding Tally assumes.
 */
import { Decimal } from 'decimal.js';
import type { TallyVoucher } from './tallyBook.js';

/** Existing masters are left exactly as they are — a re-import never alters the user's own ledgers. */
const IMPORT_DUPLICATES = '@@DUPIGNORECOMBINE';

function header(id: 'All Masters' | 'Vouchers'): string {
  return `<HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>${id}</ID></HEADER>`;
}

/** Escape for XML text and attributes; non-ASCII becomes &#NNNN;. */
function x(value: string): string {
  let out = '';
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    if (ch === '&') out += '&amp;';
    else if (ch === '<') out += '&lt;';
    else if (ch === '>') out += '&gt;';
    else if (ch === '"') out += '&quot;';
    else if (ch === "'") out += '&apos;';
    else if (cp === 9 || cp === 10 || cp === 13) out += `&#${cp};`;
    else if (cp < 0x20 || cp === 0x7f) continue;
    else if (cp > 0x7e) out += `&#${cp};`;
    else out += ch;
  }
  return out;
}

/** Exact decimal, two places, half up. */
export function formatTallyAmount(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

function tallyDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '');
}

export interface MastersInput {
  groups: ReadonlyArray<{ name: string; parent: string }>;
  /** openingBalance: positive = debit, negative = credit. */
  ledgers: ReadonlyArray<{ name: string; parent: string; openingBalance: Decimal }>;
}

export function renderMastersXml(input: MastersInput): string {
  const groups = input.groups.map(
    (g) =>
      `<TALLYMESSAGE><GROUP NAME="${x(g.name)}" Action="Create"><NAME>${x(g.name)}</NAME>` +
      `<PARENT>${x(g.parent)}</PARENT></GROUP></TALLYMESSAGE>`,
  );
  const ledgers = input.ledgers.map((l) => {
    const rounded = l.openingBalance.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    // Tally's sign: a debit balance is negative.
    const opening = rounded.isZero() ? '' : `<OPENINGBALANCE>${formatTallyAmount(rounded.negated())}</OPENINGBALANCE>`;
    return (
      `<TALLYMESSAGE><LEDGER NAME="${x(l.name)}" Action="Create"><NAME>${x(l.name)}</NAME>` +
      `<PARENT>${x(l.parent)}</PARENT>${opening}</LEDGER></TALLYMESSAGE>`
    );
  });
  return (
    `<ENVELOPE>${header('All Masters')}<BODY>` +
    `<DESC><STATICVARIABLES><IMPORTDUPS>${IMPORT_DUPLICATES}</IMPORTDUPS></STATICVARIABLES></DESC>` +
    `<DATA>${[...groups, ...ledgers].join('')}</DATA></BODY></ENVELOPE>`
  );
}

/** Vouchers; each line's amount is positive for a debit, negative for a credit. */
export function renderVouchersXml(vouchers: readonly TallyVoucher[]): string {
  const messages = vouchers.map((v) => {
    const narration = v.narration ? `<NARRATION>${x(v.narration)}</NARRATION>` : '';
    const legs = v.lines
      .map((line) => {
        const isDebit = line.amount.greaterThan(0);
        return (
          `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${x(line.ledger)}</LEDGERNAME>` +
          `<ISDEEMEDPOSITIVE>${isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>` +
          `<AMOUNT>${formatTallyAmount(line.amount.negated())}</AMOUNT></ALLLEDGERENTRIES.LIST>`
        );
      })
      .join('');
    return (
      `<TALLYMESSAGE><VOUCHER VCHTYPE="${x(v.type)}" ACTION="Create"><DATE>${tallyDate(v.date)}</DATE>` +
      `<VOUCHERTYPENAME>${x(v.type)}</VOUCHERTYPENAME><VOUCHERNUMBER>${x(v.number)}</VOUCHERNUMBER>` +
      `${narration}${legs}</VOUCHER></TALLYMESSAGE>`
    );
  });
  return `<ENVELOPE>${header('Vouchers')}<BODY><DATA>${messages.join('')}</DATA></BODY></ENVELOPE>`;
}
