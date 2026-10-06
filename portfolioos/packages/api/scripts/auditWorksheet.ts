/**
 * Read-only. Pulls the rows behind each finding in the Tally audit so they can
 * be looked at one by one, with ids, dates and amounts. Writes nothing.
 *
 *   pnpm --filter @everypaisa/api exec tsx scripts/auditWorksheet.ts --email you@example.com
 */
import { prisma } from '../src/lib/prisma.js';
import { runAsSystem, runAsUser } from '../src/lib/requestContext.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '—');

async function main() {
  const email = arg('email');
  if (!email) throw new Error('Pass --email');
  const user = await runAsSystem(() =>
    prisma.user.findUnique({ where: { email }, select: { id: true, email: true } }),
  );
  if (!user) throw new Error(`No user with email ${email}`);

  await runAsUser(user.id, async () => {
    console.log(`\n=== 1. EMIs dated before the loan was disbursed ===`);
    const loans = await prisma.loan.findMany({
      where: { userId: user.id },
      select: {
        id: true, lenderName: true, loanType: true, disbursementDate: true, firstEmiDate: true,
        principalAmount: true, emiAmount: true, status: true,
        payments: { select: { id: true, paidOn: true, amount: true, paymentType: true, forMonth: true }, orderBy: { paidOn: 'asc' } },
      },
    });
    for (const l of loans) {
      const early = l.payments.filter((p) => p.paidOn < l.disbursementDate);
      console.log(
        `  ${l.lenderName} ${l.loanType} (${l.id}) principal ${l.principalAmount} disbursed ${day(l.disbursementDate)} firstEmi ${day(l.firstEmiDate)} — ${l.payments.length} payment(s), ${early.length} before disbursement`,
      );
      for (const p of early) console.log(`      EARLY ${p.id} ${day(p.paidOn)} ${p.paymentType} ${p.amount} ${p.forMonth ?? ''}`);
    }
    if (loans.length === 0) console.log('  (no loans)');

    console.log(`\n=== 2. Derivative positions still open past expiry ===`);
    const positions = await prisma.derivativePosition.findMany({
      where: { portfolio: { userId: user.id }, status: 'OPEN', expiryDate: { lt: new Date() } },
      select: { id: true, underlying: true, instrumentType: true, strikePrice: true, expiryDate: true, netQuantity: true, lotSize: true, assetKey: true },
      orderBy: { expiryDate: 'asc' },
    });
    for (const p of positions) {
      console.log(`  ${p.id} ${p.underlying} ${p.instrumentType} ${p.strikePrice ?? ''} exp ${day(p.expiryDate)} netQty ${p.netQuantity} lot ${p.lotSize}`);
    }
    if (positions.length === 0) console.log('  (none)');

    console.log(`\n=== 3. Holdings showing a negative quantity ===`);
    const negatives = await prisma.holdingProjection.findMany({
      where: { portfolio: { userId: user.id }, quantity: { lt: 0 } },
      select: { id: true, assetName: true, assetClass: true, quantity: true, totalCost: true, assetKey: true, portfolioId: true },
    });
    for (const h of negatives) {
      const rows = await prisma.transaction.findMany({
        where: { portfolioId: h.portfolioId, assetKey: h.assetKey },
        select: { id: true, transactionType: true, tradeDate: true, quantity: true, price: true, sourceAdapter: true },
        orderBy: { tradeDate: 'asc' },
      });
      console.log(`  ${h.assetName} (${h.assetClass}) qty ${h.quantity} cost ${h.totalCost} — ${rows.length} transaction(s):`);
      for (const r of rows) console.log(`      ${r.transactionType} ${r.quantity} @ ${r.price} on ${day(r.tradeDate)} ${r.sourceAdapter ?? 'manual'} (${r.id})`);
    }
    if (negatives.length === 0) console.log('  (none)');

    console.log(`\n=== 4. Holdings sharing one asset key under different names ===`);
    const byKey = new Map<string, Set<string>>();
    const all = await prisma.transaction.findMany({
      where: { portfolio: { userId: user.id } },
      select: { assetKey: true, assetName: true, stock: { select: { name: true } }, fund: { select: { schemeName: true } } },
    });
    for (const t of all) {
      const key = t.assetKey ?? '(none)';
      const name = t.stock?.name ?? t.fund?.schemeName ?? t.assetName ?? '(unnamed)';
      const set = byKey.get(key) ?? new Set<string>();
      set.add(name);
      byKey.set(key, set);
    }
    let shared = 0;
    for (const [key, names] of byKey) {
      if (names.size > 1) {
        shared += 1;
        console.log(`  ${key}: ${[...names].join(' | ')}`);
      }
    }
    if (shared === 0) console.log('  (none)');

    console.log(`\n=== 5. Credit cards and their earliest recorded activity ===`);
    const cards = await prisma.creditCard.findMany({
      where: { userId: user.id },
      select: { id: true, issuerBank: true, cardName: true, last4: true, outstandingBalance: true, statementDay: true },
    });
    for (const c of cards) {
      const statements = await prisma.creditCardStatement.findMany({
        where: { cardId: c.id },
        select: { id: true, forMonth: true, statementAmount: true, minimumDue: true, paidAmount: true, dueDate: true, status: true },
        orderBy: { forMonth: 'asc' },
        take: 5,
      });
      console.log(`  ${c.issuerBank} ${c.cardName} ••${c.last4} outstanding ${c.outstandingBalance ?? '—'}`);
      for (const s of statements)
        console.log(`      statement ${s.forMonth} amount ${s.statementAmount} min ${s.minimumDue ?? '—'} paid ${s.paidAmount ?? '—'} due ${day(s.dueDate)} [${s.status}] (${s.id})`);
    }
    if (cards.length === 0) console.log('  (no cards)');

    console.log(`\n=== 6. Cash flows with no bank account attached (the Tally suspense) ===`);
    const flows = await prisma.cashFlow.findMany({
      where: { portfolio: { userId: user.id }, bankAccountId: null },
      select: { id: true, date: true, type: true, amount: true, description: true },
      orderBy: { date: 'asc' },
    });
    let inflow = 0;
    let outflow = 0;
    for (const f of flows) {
      if (f.type === 'INFLOW') inflow += Number(f.amount);
      else outflow += Number(f.amount);
    }
    console.log(`  ${flows.length} unattached flow(s): inflow ${inflow.toFixed(2)}, outflow ${outflow.toFixed(2)}`);
    for (const f of flows.slice(0, 25)) {
      console.log(`      ${day(f.date)} ${f.type} ${f.amount} — ${f.description ?? ''} (${f.id})`);
    }
    if (flows.length > 25) console.log(`      … ${flows.length - 25} more`);

    const banks = await prisma.bankAccount.findMany({
      where: { userId: user.id },
      select: { id: true, bankName: true, accountType: true, last4: true, currentBalance: true, status: true },
    });
    console.log(`\n  Known bank accounts: ${banks.map((b) => `${b.bankName} ${b.accountType} ••${b.last4} ${b.currentBalance} [${b.status}]`).join('; ') || '(none)'}`);
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
