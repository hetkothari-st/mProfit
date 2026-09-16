/**
 * Builds a user's Tally export and then checks the rendered XML from the
 * outside — parsing the text that would reach Tally rather than trusting the
 * builder that produced it.
 *
 *   pnpm --filter @everypaisa/api exec tsx scripts/tallyVerifyExport.ts --email you@example.com --out C:/tmp
 *
 * Read-only against the database. Writes the export files to --out (default:
 * the current directory) so they can be opened or imported by hand.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { Decimal } from 'decimal.js';
import { prisma } from '../src/lib/prisma.js';
import { runAsSystem, runAsUser } from '../src/lib/requestContext.js';
import { buildUserTallyBook } from '../src/services/tally/tallyZip.service.js';
import { tallyZipEntries } from '../src/services/tally/tallyPackage.js';
import { validateTallyBook } from '../src/services/tally/tallyValidate.js';
import { TALLY_RESERVED_GROUPS } from '../src/services/tally/tallyNames.js';
import { financialYearRange } from '@everypaisa/shared';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const problems: string[] = [];
const notes: string[] = [];
function fail(where: string, msg: string) {
  problems.push(`${where}: ${msg}`);
}

/** Tally reads these as predefined; a voucher may reference them without a master. */
const PREDEFINED_LEDGERS = new Set(['Cash', 'Profit & Loss A/c']);

const reserved = new Set<string>(TALLY_RESERVED_GROUPS.map((g: string) => g.toLowerCase()));

const asArray = <T,>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

async function main() {
  const email = arg('email');
  const outDir = arg('out') ?? process.cwd();
  if (!email) throw new Error('Pass --email');

  const user = await runAsSystem(() =>
    prisma.user.findUnique({ where: { email }, select: { id: true, email: true } }),
  );
  if (!user) throw new Error(`No user with email ${email}`);

  const { book, entries, dbTotals } = await runAsUser(user.id, async () => {
    const book = await buildUserTallyBook(user.id);
    const entries = tallyZipEntries(book, { extraFiles: [] });
    const [trades, flows, rentIn] = await Promise.all([
      prisma.transaction.count({ where: { portfolio: { userId: user.id } } }),
      prisma.cashFlow.count({ where: { portfolio: { userId: user.id } } }),
      prisma.cashFlow.aggregate({
        where: { portfolio: { userId: user.id }, type: 'INFLOW' },
        _sum: { amount: true },
      }),
    ]);
    return { book, entries, dbTotals: { trades, flows, rentIn: rentIn._sum.amount?.toString() ?? '0' } };
  });

  // ── What the builder itself says ────────────────────────────────
  console.log(`\n=== Builder ===`);
  console.log(`books beginning ${book.booksBeginning}, ${book.groups.length} group(s), ${book.ledgers.length} ledger(s), ${book.years.length} year(s)`);
  for (const y of book.years) console.log(`  FY${y.fy}: ${y.vouchers.length} voucher(s)`);
  const builderProblems = validateTallyBook(book);
  console.log(`validator: ${builderProblems.length === 0 ? 'clean' : `${builderProblems.length} problem(s)`}`);
  for (const p of builderProblems) console.log(`  ! ${p}`);
  console.log(`issues raised for the user: ${book.issues.length}`);
  for (const i of book.issues) console.log(`  - [${i.severity ?? 'note'}] ${i.message}`);

  // ── Write the files out ─────────────────────────────────────────
  for (const e of entries) writeFileSync(join(outDir, e.name), e.content, 'utf8');
  console.log(`\nWrote ${entries.length} file(s) to ${outDir}`);

  // ── Check the rendered XML from the outside ─────────────────────
  const masters = entries.find((e) => e.name.endsWith('Masters.xml'))!;
  const vouchersFiles = entries.filter((e) => /Transactions FY/.test(e.name));

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', parseTagValue: false });

  // Well-formedness + encoding, for every XML file.
  for (const e of [masters, ...vouchersFiles]) {
    const valid = XMLValidator.validate(e.content);
    if (valid !== true) fail(e.name, `not well-formed XML: ${JSON.stringify(valid.err)}`);
    const nonAscii = [...e.content].find((ch) => ch.codePointAt(0)! > 0x7f);
    if (nonAscii) fail(e.name, `contains a non-ASCII character (${JSON.stringify(nonAscii)}) — Tally's importer reads the file as ASCII`);
    if (!e.content.startsWith('<ENVELOPE>')) fail(e.name, `does not start with <ENVELOPE>`);
    if (/\r\n/.test(e.content)) notes.push(`${e.name}: CRLF line endings (Tally accepts both)`);
  }

  // ── Masters ─────────────────────────────────────────────────────
  // The import envelope Tally documents: TALLYREQUEST Import, TYPE Data, and
  // ID naming the target — "All Masters" or "Vouchers".
  const mDoc = parser.parse(masters.content);
  const mHeader = mDoc?.ENVELOPE?.HEADER;
  if (mHeader?.TALLYREQUEST !== 'Import') fail(masters.name, `HEADER/TALLYREQUEST is ${JSON.stringify(mHeader?.TALLYREQUEST)}, expected "Import"`);
  if (mHeader?.TYPE !== 'Data') fail(masters.name, `HEADER/TYPE is ${JSON.stringify(mHeader?.TYPE)}, expected "Data"`);
  if (mHeader?.ID !== 'All Masters') fail(masters.name, `HEADER/ID is ${JSON.stringify(mHeader?.ID)}, expected "All Masters"`);
  if (String(mHeader?.VERSION) !== '1') fail(masters.name, `HEADER/VERSION is ${JSON.stringify(mHeader?.VERSION)}, expected 1`);
  const dups = mDoc?.ENVELOPE?.BODY?.DESC?.STATICVARIABLES?.IMPORTDUPS;
  if (dups !== '@@DUPCOMBINE' && dups !== '@@DUPIGNORECOMBINE') fail(masters.name, `IMPORTDUPS is ${JSON.stringify(dups)} — masters need one so a re-import merges instead of doubling`);

  const mData = mDoc?.ENVELOPE?.BODY?.DATA?.TALLYMESSAGE;
  const messages = asArray(mData);
  const groupNames = new Set<string>();
  const ledgerNames = new Set<string>();
  const ledgerParents = new Map<string, string>();
  const openings = new Map<string, Decimal>();

  for (const msg of messages) {
    for (const g of asArray(msg.GROUP)) {
      const name = g['@NAME'] ?? g.NAME;
      if (!g.NAME) fail(masters.name, `group ${name} has no <NAME> child (Tally needs the attribute and the child)`);
      if (reserved.has(String(name).toLowerCase())) fail(masters.name, `group "${name}" is one of Tally's own 28 reserved groups`);
      groupNames.add(String(name));
      if (!g.PARENT) fail(masters.name, `group "${name}" has no <PARENT>`);
    }
    for (const l of asArray(msg.LEDGER)) {
      const name = String(l['@NAME'] ?? l.NAME ?? '');
      if (!l.NAME) fail(masters.name, `ledger ${name} has no <NAME> child`);
      if (!l.PARENT) fail(masters.name, `ledger "${name}" has no <PARENT>`);
      if (ledgerNames.has(name)) fail(masters.name, `ledger "${name}" is declared twice`);
      ledgerNames.add(name);
      ledgerParents.set(name, String(l.PARENT ?? ''));
      if (l.OPENINGBALANCE !== undefined) {
        const raw = String(l.OPENINGBALANCE);
        if (!/^-?\d+\.\d{2}$/.test(raw)) fail(masters.name, `ledger "${name}" opening balance "${raw}" is not a plain 2-decimal number`);
        openings.set(name, new Decimal(raw));
      }
    }
  }

  // Every parent must resolve: either a group we ship, or one of Tally's own.
  for (const [name, parent] of ledgerParents) {
    if (!groupNames.has(parent) && !reserved.has(parent.toLowerCase())) {
      fail(masters.name, `ledger "${name}" hangs off "${parent}", which is neither a group in this file nor a reserved Tally group`);
    }
  }

  const openingSum = [...openings.values()].reduce((a, b) => a.plus(b), new Decimal(0));
  if (!openingSum.isZero()) {
    fail(masters.name, `opening balances sum to ${openingSum.toFixed(2)}, not zero — Tally would post the difference to Difference in Opening Balances`);
  }

  console.log(`\n=== Masters (read back) ===`);
  console.log(`${groupNames.size} group(s), ${ledgerNames.size} ledger(s), ${openings.size} with an opening balance, opening sum ${openingSum.toFixed(2)}`);

  // ── Vouchers ────────────────────────────────────────────────────
  const allowedTypes = new Set(['Payment', 'Receipt', 'Journal', 'Contra']);
  let voucherCount = 0;
  let entryCount = 0;
  const seen = new Map<string, number>();
  const referenced = new Set<string>();
  const perType = new Map<string, number>();
  let debitTotal = new Decimal(0);

  for (const file of vouchersFiles) {
    const fy = /FY(\d{4}-\d{2})/.exec(file.name)?.[1];
    const range = fy ? financialYearRange(fy) : null;
    const doc = parser.parse(file.content);
    const header = doc?.ENVELOPE?.HEADER;
    if (header?.TALLYREQUEST !== 'Import') fail(file.name, `HEADER/TALLYREQUEST is ${JSON.stringify(header?.TALLYREQUEST)}, expected "Import"`);
    if (header?.TYPE !== 'Data') fail(file.name, `HEADER/TYPE is ${JSON.stringify(header?.TYPE)}, expected "Data"`);
    if (header?.ID !== 'Vouchers') fail(file.name, `HEADER/ID is ${JSON.stringify(header?.ID)}, expected "Vouchers"`);

    for (const msg of asArray(doc?.ENVELOPE?.BODY?.DATA?.TALLYMESSAGE)) {
      for (const v of asArray(msg.VOUCHER)) {
        voucherCount += 1;
        const type = String(v.VOUCHERTYPENAME ?? v['@VCHTYPE'] ?? '');
        perType.set(type, (perType.get(type) ?? 0) + 1);
        if (!allowedTypes.has(type)) fail(file.name, `voucher type "${type}" is outside the four we export`);
        if (v['@VCHTYPE'] && v['@VCHTYPE'] !== type) fail(file.name, `VCHTYPE attribute "${v['@VCHTYPE']}" disagrees with VOUCHERTYPENAME "${type}"`);

        const date = String(v.DATE ?? '');
        if (!/^\d{8}$/.test(date)) fail(file.name, `voucher date "${date}" is not YYYYMMDD`);
        else if (range) {
          const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
          if (iso < range.from || iso > range.to) fail(file.name, `voucher dated ${iso} sits outside FY${fy} (${range.from}..${range.to})`);
        }

        const lines = asArray(v['ALLLEDGERENTRIES.LIST']);
        if (lines.length < 2) fail(file.name, `voucher dated ${date} has ${lines.length} ledger line(s)`);
        let sum = new Decimal(0);
        const names: string[] = [];
        for (const line of lines) {
          entryCount += 1;
          const ledger = String(line.LEDGERNAME ?? '');
          names.push(ledger);
          referenced.add(ledger);
          const raw = String(line.AMOUNT ?? '');
          if (!/^-?\d+\.\d{2}$/.test(raw)) fail(file.name, `amount "${raw}" on ${ledger} is not a plain 2-decimal number`);
          const amt = new Decimal(raw || '0');
          sum = sum.plus(amt);
          if (amt.isNegative()) debitTotal = debitTotal.plus(amt.abs());
          const deemed = String(line.ISDEEMEDPOSITIVE ?? '');
          const expected = amt.isNegative() ? 'Yes' : 'No';
          if (deemed !== expected) {
            fail(file.name, `${ledger} on ${date}: AMOUNT ${raw} with ISDEEMEDPOSITIVE ${deemed} — a debit must be negative with Yes, a credit positive with No`);
          }
        }
        if (!sum.isZero()) fail(file.name, `voucher dated ${date} (${names.join(' / ')}) is out by ${sum.toFixed(2)}`);

        // The narration is part of what makes a voucher distinct: ten months of
        // arrears cleared on one day are ten vouchers, not one repeated.
        const key = `${date}|${type}|${String(v.NARRATION ?? '')}|${[...names].sort().join('|')}|${lines.map((l) => l.AMOUNT).sort().join('|')}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
  }

  for (const ledger of referenced) {
    if (!ledgerNames.has(ledger) && !PREDEFINED_LEDGERS.has(ledger)) {
      fail('vouchers', `ledger "${ledger}" is posted to but never declared in Masters`);
    }
  }
  const unusedLedgers = [...ledgerNames].filter((l) => !referenced.has(l));
  const repeated = [...seen.entries()].filter(([, n]) => n > 1);

  console.log(`\n=== Vouchers (read back) ===`);
  console.log(`${voucherCount} voucher(s), ${entryCount} ledger line(s), total debits ${debitTotal.toFixed(2)}`);
  console.log(`by type: ${[...perType.entries()].map(([t, n]) => `${t} ${n}`).join(', ')}`);
  console.log(`ledgers never posted to: ${unusedLedgers.length}${unusedLedgers.length ? ` (${unusedLedgers.slice(0, 8).join(', ')}${unusedLedgers.length > 8 ? ', …' : ''})` : ''}`);
  console.log(`identical voucher groups: ${repeated.length}`);
  for (const [key, n] of repeated.slice(0, 12)) console.log(`  ${n} × ${key.split('|').slice(0, 3).join(' ')}`);

  console.log(`\n=== Against the database ===`);
  console.log(`transactions ${dbTotals.trades}, cash flows ${dbTotals.flows}, total inflow ${dbTotals.rentIn}`);

  console.log(`\n=== Verdict ===`);
  if (problems.length === 0) console.log('No format or arithmetic problem found in the rendered files.');
  for (const p of problems) console.log(`  X ${p}`);
  for (const n of notes) console.log(`  · ${n}`);
  console.log(`\n${problems.length} problem(s), ${notes.length} note(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
