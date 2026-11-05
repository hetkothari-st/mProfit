import { Decimal } from 'decimal.js';
import { isSpendCategory, type SpendCategory } from '@everypaisa/shared';
import { prisma } from '../../lib/prisma.js';
import { BadRequestError } from '../../lib/errors.js';
import { categorise, payeeKey } from './categorise.js';
import { aiPayeeTagger, type PayeeTagger } from './aiPayeeTagger.js';
import { analyseSpending } from './spendAnalysisStore.js';

/**
 * Applies categories to a user's SpendTxn rows and keeps the per-payee tags
 * (SpendPayeeTag). Runs inside the user's context (runAsUser) or as system.
 */

async function loadTags(userId: string) {
  const tags = await prisma.spendPayeeTag.findMany({ where: { userId }, select: { payeeKey: true, category: true, source: true } });
  const user = new Map<string, SpendCategory>();
  const model = new Map<string, SpendCategory>();
  for (const t of tags) {
    if (!isSpendCategory(t.category)) continue;
    (t.source === 'user' ? user : model).set(t.payeeKey, t.category);
  }
  return { user, model, known: new Set(tags.map((t) => t.payeeKey)) };
}

const ROW_SELECT = {
  id: true, direction: true, eventType: true, counterparty: true, narration: true,
  excludeReason: true, category: true, categorySrc: true, amount: true, duplicateOfId: true,
} as const;

/**
 * Categorise every row of the user's. Payees still unknown after rules and
 * the merchant list go to the AI tagger once (largest spend first), unless
 * `tagger` is null. Returns how many rows changed.
 */
export async function categoriseSpending(userId: string, tagger: PayeeTagger | null = aiPayeeTagger): Promise<number> {
  const rows = await prisma.spendTxn.findMany({ where: { userId }, select: ROW_SELECT });
  const tags = await loadTags(userId);

  let results = rows.map((r) => categorise(r, tags.user, tags.model));

  if (tagger) {
    // Unknown debit payees the AI has not been asked about, biggest spend first.
    const spend = new Map<string, { label: string; total: Decimal }>();
    rows.forEach((r, i) => {
      if (results[i]!.category !== 'uncategorised' || r.direction !== 'DEBIT' || r.duplicateOfId) return;
      const key = payeeKey(r.counterparty, r.narration);
      if (!key || tags.known.has(key)) return;
      const cur = spend.get(key) ?? { label: (r.counterparty ?? r.narration ?? key).slice(0, 80), total: new Decimal(0) };
      cur.total = cur.total.plus(r.amount.toString());
      spend.set(key, cur);
    });
    const ask = [...spend.entries()]
      .sort((a, b) => b[1].total.comparedTo(a[1].total))
      .map(([key, v]) => ({ key, label: v.label }));
    if (ask.length > 0) {
      const answers = await tagger(userId, ask);
      if (answers.size > 0) {
        await prisma.spendPayeeTag.createMany({
          data: [...answers].map(([key, category]) => ({ userId, payeeKey: key, category, source: 'model' })),
          skipDuplicates: true,
        });
        for (const [key, category] of answers) if (!tags.user.has(key)) tags.model.set(key, category);
        results = rows.map((r) => categorise(r, tags.user, tags.model));
      }
    }
  }

  let changed = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const want = results[i]!;
    if (r.category !== want.category || r.categorySrc !== want.source) {
      await prisma.spendTxn.update({ where: { id: r.id }, data: { category: want.category, categorySrc: want.source } });
      changed += 1;
    }
  }
  return changed;
}

export interface UncategorisedPayee {
  payeeKey: string;
  label: string;
  count: number;
  total: string;
}

/** The payees still unsorted, by money spent over the last 12 months (spec §5: ask about the top 5). */
export async function listUncategorisedPayees(userId: string, limit = 5, now: Date = new Date()): Promise<UncategorisedPayee[]> {
  const from = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate()));
  const rows = await prisma.spendTxn.findMany({
    where: { userId, category: 'uncategorised', direction: 'DEBIT', duplicateOfId: null, txnDate: { gte: from } },
    select: { counterparty: true, narration: true, amount: true },
  });
  const by = new Map<string, { label: string; count: number; total: Decimal }>();
  for (const r of rows) {
    const key = payeeKey(r.counterparty, r.narration);
    if (!key) continue;
    const cur = by.get(key) ?? { label: (r.counterparty ?? r.narration ?? key).slice(0, 80), count: 0, total: new Decimal(0) };
    cur.count += 1;
    cur.total = cur.total.plus(r.amount.toString());
    by.set(key, cur);
  }
  return [...by.entries()]
    .sort((a, b) => b[1].total.comparedTo(a[1].total))
    .slice(0, limit)
    .map(([key, v]) => ({ payeeKey: key, label: v.label, count: v.count, total: v.total.toFixed(2) }));
}

/**
 * The user tags a payee (or clears their tag with null). Applies to every
 * past and future payment to that payee. Returns how many rows changed.
 */
export async function setPayeeCategory(userId: string, key: string, category: string | null): Promise<number> {
  if (category !== null && !isSpendCategory(category)) throw new BadRequestError(`Unknown category ${category}`);
  if (category === 'uncategorised') throw new BadRequestError('Pick a category, or clear the tag');
  if (category === null) {
    await prisma.spendPayeeTag.deleteMany({ where: { userId, payeeKey: key, source: 'user' } });
  } else {
    await prisma.spendPayeeTag.upsert({
      where: { userId_payeeKey: { userId, payeeKey: key } },
      create: { userId, payeeKey: key, category, source: 'user' },
      update: { category, source: 'user' },
    });
  }
  const changed = await categoriseSpending(userId, null);
  // Categories feed the series and monthly totals.
  if (changed > 0) await analyseSpending(userId);
  return changed;
}
