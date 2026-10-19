/**
 * Tally's import rules, checked before a file is produced. A book that fails
 * any of these is never handed to the user as "ready to import".
 *
 * Sources: help.tallysolutions.com — Import Data errors and resolutions
 * ("Voucher totals do not match", "Referenced master missing", "Parent group
 * missing", "Name/alias duplicated across masters", "Decimal places exceed
 * 4"), and the voucher-date exceptions for dates outside the period or before
 * the books begin. Contra/Payment/Receipt rules follow Tally's voucher types:
 * Contra moves money between cash and bank only; Payment pays out of cash or
 * bank; Receipt receives into one.
 */
import { Decimal } from 'decimal.js';
import { financialYearFromDate } from '@everypaisa/shared';
import { isReservedTallyName, TALLY_RESERVED_GROUPS } from './tallyNames.js';
import type { TallyBook } from './tallyBook.js';

const RESERVED_GROUPS = new Set<string>(TALLY_RESERVED_GROUPS);

/** Every problem found, in plain words; empty when the book is ready to import. */
export function validateTallyBook(book: TallyBook): string[] {
  const issues: string[] = [];

  // Names: unique across groups and ledgers, and never one of Tally's own.
  const seen = new Map<string, string>();
  for (const name of [...book.groups.map((g) => g.name), ...book.ledgers.map((l) => l.name)]) {
    const key = name.toLowerCase();
    if (isReservedTallyName(name)) issues.push(`"${name}" is one of Tally's own names.`);
    else if (seen.has(key)) issues.push(`"${name}" duplicates "${seen.get(key)}" - Tally needs every name to be unique.`);
    seen.set(key, name);
  }

  // Parents: Tally's own groups, or a group defined earlier in the file.
  const knownGroups = new Set(RESERVED_GROUPS);
  for (const g of book.groups) {
    if (!knownGroups.has(g.parent)) issues.push(`Group "${g.name}" sits in "${g.parent}", which does not exist.`);
    knownGroups.add(g.name);
  }
  for (const l of book.ledgers) {
    if (!knownGroups.has(l.parent)) {
      issues.push(`Ledger "${l.name}" sits in "${l.parent}", a group that is neither Tally's own nor in this file.`);
    }
    if (l.openingBalance.decimalPlaces() > 2) issues.push(`Opening balance of "${l.name}" has more than two decimal places.`);
  }

  const openings = book.ledgers.reduce((s, l) => s.plus(l.openingBalance), new Decimal(0));
  if (!openings.isZero()) issues.push(`Opening balances add up to ${openings.toString()}, not zero.`);

  // Vouchers.
  const ledgerByName = new Map(book.ledgers.map((l) => [l.name, l]));
  const isCashOrBank = (ledger: string) => ledgerByName.get(ledger)?.isCashOrBank === true;
  for (const year of book.years) {
    for (const v of year.vouchers) {
      const label = `${v.type} ${v.number} of ${v.date}`;
      if (v.lines.length < 2) issues.push(`${label} needs at least two lines.`);
      let total = new Decimal(0);
      for (const line of v.lines) {
        if (!ledgerByName.has(line.ledger)) issues.push(`${label} uses ledger "${line.ledger}", which is not in the file.`);
        if (line.amount.isZero()) issues.push(`${label} has a zero line for "${line.ledger}".`);
        if (line.amount.decimalPlaces() > 2) issues.push(`${label}: ${line.amount.toString()} has more than two decimal places.`);
        total = total.plus(line.amount);
      }
      if (!total.isZero()) issues.push(`${label} does not balance (off by ${total.toString()}).`);

      if (v.type === 'Contra' && !v.lines.every((l) => isCashOrBank(l.ledger))) {
        issues.push(`${label}: a Contra may only move money between cash and bank ledgers.`);
      }
      if (v.type === 'Payment' && !v.lines.some((l) => isCashOrBank(l.ledger) && l.amount.lessThan(0))) {
        issues.push(`${label}: a Payment must pay out of a cash or bank ledger.`);
      }
      if (v.type === 'Receipt' && !v.lines.some((l) => isCashOrBank(l.ledger) && l.amount.greaterThan(0))) {
        issues.push(`${label}: a Receipt must receive into a cash or bank ledger.`);
      }

      if (financialYearFromDate(v.date) !== year.fy) issues.push(`${label} is dated ${v.date}, outside ${year.fy}.`);
      if (v.date < book.booksBeginning) issues.push(`${label} is dated before the books begin (${book.booksBeginning}).`);
    }
  }

  return issues;
}
