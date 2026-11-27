/**
 * One-off repair: link "Rent received" cash rows written before the rent
 * ledger existed to the months they paid for (launch review B7).
 *
 * Before 2026-09-08 "Mark received" wrote a CashFlow and set the receipt's
 * status, received amount and cashFlowId directly. The ledger migration did
 * not convert those payments, and the daily overdue job recomputed the
 * receipts from the still-empty ledger first: each month went back to
 * OVERDUE and lost its cashFlowId, while the cash stayed in Cash Activity.
 *
 * For each such orphan row (a "Rent received — … (YYYY-MM)" CashFlow with no
 * ledger entry, no receipt link and no canonical event, created before the
 * ledger rollout):
 *  - its tenancy + month already has a ledger PAYMENT of the same amount → a
 *    DUPLICATE (the month was marked received again later); --apply deletes
 *    the orphan cash row;
 *  - otherwise, when the match is unambiguous and the amount is that month's
 *    rent → a PAYMENT ledger entry pinned to the month, dated at the cash
 *    row's date and linked to it (sourceHash `repair:legacycash:` so a re-run
 *    inserts nothing), then the tenancy is recomputed;
 *  - anything else is skipped and listed with the reason. Nothing is guessed.
 *
 * Dry run (default): reads only. The plan, including every receipt's status
 * after the repair, is worked out with the same allocation and status rules
 * the recompute uses, so it runs on a read-only connection.
 * --apply: writes in one transaction, recomputes, then compares the stored
 * statuses with the plan and rolls everything back if they differ.
 *
 *   pnpm --filter @everypaisa/api exec tsx scripts/repairLegacyRentCash.ts --userId <id>
 *   pnpm --filter @everypaisa/api exec tsx scripts/repairLegacyRentCash.ts --userId <id> --apply
 */

import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma, runInTransaction } from '../src/lib/prisma.js';
import { runAsSystem } from '../src/lib/requestContext.js';
import { allocateCredits, deriveReceiptStatus, type ChargeInput, type CreditInput } from '../src/services/rental/rentalLedgerMath.js';
import { OVERDUE_GRACE_DAYS, recomputeTenancyLedger } from '../src/services/rental/rentalLedger.service.js';

/** The ledger migration (20260908000000_rental_ledger). Rent cash written after it always has a ledger entry. */
export const LEDGER_ROLLOUT = new Date('2026-09-08T00:00:00.000Z');
export const REPAIR_SOURCE_PREFIX = 'repair:legacycash:';
const RENT_RECEIVED_PREFIX = 'Rent received — ';

// Mirrors rentalLedger.service.ts (CHARGE_TYPES / CREDIT_TYPES). --apply
// checks the recompute's result against this plan, so a drift here aborts.
const CHARGE_ENTRY_TYPES = new Set(['LATE_FEE', 'OTHER_CHARGE']);
const CREDIT_ENTRY_TYPES = new Set(['PAYMENT', 'DISCOUNT']);

const ZERO = new Prisma.Decimal(0);
export const repairSourceHash = (cashFlowId: string) =>
  `${REPAIR_SOURCE_PREFIX}${createHash('sha256').update(`legacycash:${cashFlowId}`).digest('hex')}`;

export type MatchedBy = 'description' | 'amount+month';

export interface RepairLink { cashFlowId: string; tenancyId: string; receiptId: string; forMonth: string; amount: string; date: string; matchedBy: MatchedBy }
export interface RepairDuplicate { cashFlowId: string; tenancyId: string; forMonth: string; amount: string; ledgerAmount: string; matchedBy: MatchedBy }
export interface RepairSkip { cashFlowId: string; forMonth: string | null; amount: string; reason: string }
export interface RepairStatusChange { receiptId: string; tenancyId: string; forMonth: string; before: string; after: string }

export interface RepairReport {
  dryRun: boolean;
  orphanRows: number;
  linked: RepairLink[];
  duplicates: RepairDuplicate[];
  skipped: RepairSkip[];
  statusChanges: RepairStatusChange[];
  /** Sum of the cash rows linked into the ledger. */
  linkedInr: string;
  /** Sum of the duplicate cash rows (deleted with --apply). */
  duplicateInr: string;
  /** The user's OVERDUE receipts once the repair is in. */
  overdueAfter: number;
}

interface TenancyRow { id: string; propertyName: string; tenantName: string }
interface ReceiptRow { id: string; tenancyId: string; forMonth: string; expectedAmount: Prisma.Decimal; dueDate: Date; status: string; isSkipped: boolean }
interface EntryRow { id: string; tenancyId: string; entryType: string; amount: Prisma.Decimal; entryDate: Date; createdAt: Date; forMonth: string | null }

const monthOf = (description: string): string | null => description.match(/\((\d{4}-\d{2})\)\s*$/)?.[1] ?? null;

/** Each receipt's status from these entries, by the recompute's rules. */
function statusesFor(receipts: ReceiptRow[], entries: EntryRow[], today: Date): Map<string, string> {
  const charges: ChargeInput[] = [];
  for (const r of receipts) {
    if (!r.isSkipped) charges.push({ key: r.id, kind: 'RECEIPT', forMonth: r.forMonth, due: r.dueDate, amount: r.expectedAmount });
  }
  for (const e of entries) {
    if (CHARGE_ENTRY_TYPES.has(e.entryType)) charges.push({ key: e.id, kind: 'FEE', forMonth: null, due: e.entryDate, amount: e.amount });
  }
  const credits: CreditInput[] = entries
    .filter((e) => CREDIT_ENTRY_TYPES.has(e.entryType))
    .map((e) => ({ key: e.id, entryDate: e.entryDate, createdAt: e.createdAt, forMonth: e.forMonth, amount: e.amount }));
  const { perCharge } = allocateCredits(charges, credits);
  const out = new Map<string, string>();
  for (const r of receipts) {
    out.set(r.id, deriveReceiptStatus({
      isSkipped: r.isSkipped, expected: r.expectedAmount, allocated: perCharge.get(r.id)?.allocated ?? ZERO,
      dueDate: r.dueDate, today, graceDays: OVERDUE_GRACE_DAYS,
    }));
  }
  return out;
}

function allocatedFor(receiptId: string, receipts: ReceiptRow[], entries: EntryRow[]): Prisma.Decimal {
  const charges: ChargeInput[] = receipts.filter((r) => !r.isSkipped).map((r) => ({ key: r.id, kind: 'RECEIPT', forMonth: r.forMonth, due: r.dueDate, amount: r.expectedAmount }));
  for (const e of entries) if (CHARGE_ENTRY_TYPES.has(e.entryType)) charges.push({ key: e.id, kind: 'FEE', forMonth: null, due: e.entryDate, amount: e.amount });
  const credits: CreditInput[] = entries.filter((e) => CREDIT_ENTRY_TYPES.has(e.entryType))
    .map((e) => ({ key: e.id, entryDate: e.entryDate, createdAt: e.createdAt, forMonth: e.forMonth, amount: e.amount }));
  return allocateCredits(charges, credits).perCharge.get(receiptId)?.allocated ?? ZERO;
}

export interface RepairPlan {
  report: RepairReport;
  /** Planned statuses for every receipt of a touched tenancy. */
  planned: Map<string, string>;
  touchedTenancyIds: string[];
}

/** Read-only: what the repair would do for this user. */
export async function planLegacyRentCashRepair(userId: string, today: Date = new Date()): Promise<RepairPlan> {
  if (!userId) throw new Error('planLegacyRentCashRepair needs a userId');
  const portfolios = await prisma.portfolio.findMany({ where: { userId }, select: { id: true } });
  const properties = await prisma.rentalProperty.findMany({ where: { userId }, select: { id: true, name: true } });
  const tenancyRows = await prisma.tenancy.findMany({
    where: { propertyId: { in: properties.map((p) => p.id) } },
    select: { id: true, propertyId: true, tenantName: true },
  });
  const nameOf = new Map(properties.map((p) => [p.id, p.name]));
  const tenancies: TenancyRow[] = tenancyRows.map((t) => ({ id: t.id, propertyName: nameOf.get(t.propertyId) ?? '', tenantName: t.tenantName }));
  const tenancyIds = tenancies.map((t) => t.id);
  const receipts: ReceiptRow[] = await prisma.rentReceipt.findMany({
    where: { tenancyId: { in: tenancyIds } },
    select: { id: true, tenancyId: true, forMonth: true, expectedAmount: true, dueDate: true, status: true, isSkipped: true },
  });
  const entries: EntryRow[] = await prisma.rentLedgerEntry.findMany({
    where: { tenancyId: { in: tenancyIds } },
    select: { id: true, tenancyId: true, entryType: true, amount: true, entryDate: true, createdAt: true, forMonth: true },
  });

  // Orphan rent cash: written by the pre-ledger "Mark received", linked to nothing.
  const cash = await prisma.cashFlow.findMany({
    where: {
      portfolioId: { in: portfolios.map((p) => p.id) },
      type: 'INFLOW',
      description: { startsWith: RENT_RECEIVED_PREFIX },
      createdAt: { lt: LEDGER_ROLLOUT },
    },
    select: { id: true, date: true, amount: true, description: true },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });
  const ids = cash.map((c) => c.id);
  const [byLedger, byReceipt, byEvent] = await Promise.all([
    prisma.rentLedgerEntry.findMany({ where: { cashFlowId: { in: ids } }, select: { cashFlowId: true } }),
    prisma.rentReceipt.findMany({ where: { cashFlowId: { in: ids } }, select: { cashFlowId: true } }),
    prisma.canonicalEvent.findMany({ where: { projectedCashFlowId: { in: ids } }, select: { projectedCashFlowId: true } }),
  ]);
  const linkedIds = new Set([...byLedger.map((x) => x.cashFlowId), ...byReceipt.map((x) => x.cashFlowId), ...byEvent.map((x) => x.projectedCashFlowId)]);
  const orphans = cash.filter((c) => !linkedIds.has(c.id));

  const report: RepairReport = {
    dryRun: true, orphanRows: orphans.length, linked: [], duplicates: [], skipped: [], statusChanges: [],
    linkedInr: '0', duplicateInr: '0', overdueAfter: 0,
  };
  const plannedEntries: EntryRow[] = [];
  const claimed = new Set<string>(); // tenancy|month already given a planned link

  for (const c of orphans) {
    const amount = new Prisma.Decimal(c.amount.toString());
    const desc = c.description ?? '';
    const month = monthOf(desc);
    const skip = (reason: string) => report.skipped.push({ cashFlowId: c.id, forMonth: month, amount: amount.toFixed(2), reason });
    if (!month) { skip('no month in the description'); continue; }

    let tenancy: TenancyRow | null = null;
    let matchedBy: MatchedBy = 'description';
    const byDescription = tenancies.filter((t) => t.propertyName && desc.includes(` — ${t.propertyName} / ${t.tenantName}`));
    if (byDescription.length === 1) tenancy = byDescription[0]!;
    else if (byDescription.length > 1) { skip('description matches more than one tenancy'); continue; }
    else {
      // The property may have been renamed since: fall back to the one tenancy
      // whose rent for that month is exactly this amount.
      const byAmount = tenancies.filter((t) =>
        receipts.some((r) => r.tenancyId === t.id && r.forMonth === month && r.expectedAmount.equals(amount)));
      if (byAmount.length !== 1) {
        skip(byAmount.length === 0 ? 'no tenancy matches by name, or by amount and month' : 'two or more candidate tenancies by amount and month');
        continue;
      }
      tenancy = byAmount[0]!;
      matchedBy = 'amount+month';
    }

    const receipt = receipts.find((r) => r.tenancyId === tenancy!.id && r.forMonth === month);
    if (!receipt) { skip('the tenancy has no receipt for that month'); continue; }
    const tEntries = entries.filter((e) => e.tenancyId === tenancy!.id);
    const paidForMonth = tEntries
      .filter((e) => e.entryType === 'PAYMENT' && e.forMonth === month)
      .reduce((s, e) => s.plus(e.amount), ZERO);

    if (paidForMonth.greaterThan(0)) {
      if (paidForMonth.equals(amount)) {
        report.duplicates.push({ cashFlowId: c.id, tenancyId: tenancy.id, forMonth: month, amount: amount.toFixed(2), ledgerAmount: paidForMonth.toFixed(2), matchedBy });
      } else {
        skip(`the month already has a ledger payment of a different amount (${paidForMonth.toFixed(2)})`);
      }
      continue;
    }
    if (!amount.equals(receipt.expectedAmount)) { skip(`amount differs from that month's rent (${receipt.expectedAmount.toFixed(2)})`); continue; }
    const claimKey = `${tenancy.id}|${month}`;
    if (claimed.has(claimKey)) { skip('another orphan row already links this month'); continue; }
    if (allocatedFor(receipt.id, receipts.filter((r) => r.tenancyId === tenancy!.id), tEntries).greaterThanOrEqualTo(receipt.expectedAmount)) {
      skip('the month is already fully paid');
      continue;
    }

    claimed.add(claimKey);
    report.linked.push({ cashFlowId: c.id, tenancyId: tenancy.id, receiptId: receipt.id, forMonth: month, amount: amount.toFixed(2), date: c.date.toISOString().slice(0, 10), matchedBy });
    plannedEntries.push({ id: `planned:${c.id}`, tenancyId: tenancy.id, entryType: 'PAYMENT', amount, entryDate: c.date, createdAt: new Date(), forMonth: month });
  }

  const touchedTenancyIds = [...new Set(report.linked.map((l) => l.tenancyId))];
  const planned = new Map<string, string>();
  for (const tid of touchedTenancyIds) {
    const tReceipts = receipts.filter((r) => r.tenancyId === tid);
    const after = statusesFor(tReceipts, [...entries.filter((e) => e.tenancyId === tid), ...plannedEntries.filter((e) => e.tenancyId === tid)], today);
    for (const r of tReceipts) {
      const next = after.get(r.id)!;
      planned.set(r.id, next);
      if (next !== r.status) report.statusChanges.push({ receiptId: r.id, tenancyId: tid, forMonth: r.forMonth, before: r.status, after: next });
    }
  }
  report.statusChanges.sort((a, b) => a.tenancyId.localeCompare(b.tenancyId) || a.forMonth.localeCompare(b.forMonth));
  report.linkedInr = report.linked.reduce((s, l) => s.plus(l.amount), ZERO).toFixed(2);
  report.duplicateInr = report.duplicates.reduce((s, d) => s.plus(d.amount), ZERO).toFixed(2);
  report.overdueAfter = receipts.filter((r) => (planned.get(r.id) ?? r.status) === 'OVERDUE').length;
  return { report, planned, touchedTenancyIds };
}

/** Plan, and with `apply` write it in one transaction checked against the plan. */
export async function repairLegacyRentCash(opts: {
  userId: string;
  apply: boolean;
  today?: Date;
  /** Delete duplicate orphan rows on --apply (default). The ledger backfill passes false: it only links. */
  deleteDuplicates?: boolean;
}): Promise<RepairReport> {
  if (!opts.userId) throw new Error('repairLegacyRentCash needs a userId; it never runs unscoped');
  return runAsSystem(async () => {
    const plan = await planLegacyRentCashRepair(opts.userId, opts.today);
    const report = { ...plan.report, dryRun: !opts.apply };
    if (!opts.apply) return report;

    await runInTransaction(
      async (tx) => {
        for (const l of report.linked) {
          const sourceHash = repairSourceHash(l.cashFlowId);
          if (await tx.rentLedgerEntry.findUnique({ where: { sourceHash }, select: { id: true } })) continue;
          await tx.rentLedgerEntry.create({
            data: {
              tenancyId: l.tenancyId, entryType: 'PAYMENT', amount: l.amount, entryDate: new Date(`${l.date}T00:00:00Z`),
              forMonth: l.forMonth, cashFlowId: l.cashFlowId, sourceHash,
              note: 'Linked from a "Mark received" entry made before the rent ledger',
            },
          });
        }
        for (const d of opts.deleteDuplicates === false ? [] : report.duplicates) {
          // Still an orphan? Delete only then.
          const stillLinked =
            (await tx.rentLedgerEntry.count({ where: { cashFlowId: d.cashFlowId } })) +
            (await tx.rentReceipt.count({ where: { cashFlowId: d.cashFlowId } })) +
            (await tx.canonicalEvent.count({ where: { projectedCashFlowId: d.cashFlowId } }));
          if (stillLinked > 0) throw new Error(`duplicate ${d.cashFlowId} is no longer an orphan; nothing written`);
          console.log(`deleting duplicate cash row ${d.cashFlowId} (${d.forMonth}, ${d.amount})`);
          await tx.cashFlow.delete({ where: { id: d.cashFlowId } });
        }
        for (const tid of plan.touchedTenancyIds) await recomputeTenancyLedger(tx, tid);
        const stored = await tx.rentReceipt.findMany({ where: { tenancyId: { in: plan.touchedTenancyIds } }, select: { id: true, status: true } });
        const mismatch = stored.filter((r) => plan.planned.get(r.id) !== r.status);
        if (mismatch.length > 0) {
          throw new Error(`recompute disagrees with the plan for ${mismatch.length} receipt(s); everything rolled back`);
        }
      },
      { timeout: 120_000 },
    );
    return report;
  });
}

export function parseRepairArgs(argv: string[]): { userId: string; apply: boolean } {
  const i = argv.findIndex((a) => a === '--userId' || a.startsWith('--userId='));
  const userId = i === -1 ? '' : argv[i]!.includes('=') ? argv[i]!.split('=')[1]! : argv[i + 1] ?? '';
  if (!userId || userId.startsWith('--')) throw new Error('--userId <id> is required: this repair never runs unscoped');
  return { userId, apply: argv.includes('--apply') };
}

if (process.argv[1]?.endsWith('repairLegacyRentCash.ts')) {
  let args: { userId: string; apply: boolean };
  try {
    args = parseRepairArgs(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(2);
  }
  repairLegacyRentCash(args)
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
