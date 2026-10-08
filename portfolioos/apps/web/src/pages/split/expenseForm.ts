/**
 * Add/edit-expense form model. Pure: no React, no network. Validation mirrors
 * the server (Plan 1 allocate.ts) so the user sees problems before Save, but
 * the server stays the authority.
 */
import { Decimal } from '@everypaisa/shared';
import type { SplitExpenseDto, SplitMemberDto, SplitModeDto } from '@everypaisa/shared';
import type { ExpenseInput } from '@/api/split.api';
import { formatSplitMoney } from '@/lib/splitFormat';

export interface ExpenseFormState {
  description: string;
  amount: string;
  currency: string;
  fxRate: string;
  date: string;
  splitMode: SplitModeDto;
  payerMode: 'single' | 'multiple';
  singlePayerId: string;
  payerAmounts: Record<string, string>;
  included: Record<string, boolean>;
  values: Record<string, string>;
}

export interface ShareLine { memberId: string; amount: string | null }
export interface FormCheck { ok: boolean; error: string | null; remaining: string | null; preview: ShareLine[] }

const MONEY = /^\d+(\.\d{1,2})?$/;
const NUM = /^\d+(\.\d+)?$/;
const ZERO = new Decimal(0);
const PAISA = new Decimal('0.01');
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const active = (ms: SplitMemberDto[]) => ms.filter((m) => !m.leftAt);

export function cleanAmount(raw: string): string {
  return raw.replace(/[,\s₹]/g, '');
}

const plain = (v: string) => {
  const fixed = new Decimal(v).toFixed();
  return fixed.replace(/\.0+$|\.$/g, '');
};

export function emptyForm(members: SplitMemberDto[], baseCurrency: string, today: string): ExpenseFormState {
  const actives = active(members);
  const me = actives.find((m) => m.isMe) ?? actives[0];
  return {
    description: '',
    amount: '',
    currency: baseCurrency,
    fxRate: '',
    date: today,
    splitMode: 'EQUAL',
    payerMode: 'single',
    singlePayerId: me?.id ?? '',
    payerAmounts: Object.fromEntries(actives.map((m) => [m.id, ''])),
    included: Object.fromEntries(actives.map((m) => [m.id, true])),
    values: Object.fromEntries(actives.map((m) => [m.id, ''])),
  };
}

export function formFromExpense(e: SplitExpenseDto, members: SplitMemberDto[]): ExpenseFormState {
  const actives = active(members);
  const f = emptyForm(members, e.currency, e.date);
  f.description = e.description;
  f.amount = plain(e.amount);
  f.currency = e.currency;
  f.fxRate = new Decimal(e.fxRate).eq(1) ? '' : plain(e.fxRate);
  f.splitMode = e.splitMode;

  // Payers: only set if active
  const activePayers = e.payers.filter((p) => actives.some((m) => m.id === p.memberId));
  if (activePayers.length === 0) {
    f.payerMode = 'single';
    // Keep the stored payer even if they left, so edit shows the truth (checkForm blocks save).
    f.singlePayerId = e.payers[0]?.memberId ?? actives[0]?.id ?? '';
  } else if (activePayers.length === 1) {
    f.payerMode = 'single';
    f.singlePayerId = activePayers[0]!.memberId;
  } else {
    f.payerMode = 'multiple';
    for (const p of activePayers) f.payerAmounts[p.memberId] = plain(p.amount);
  }

  // Shares: only set if active
  const activeShares = e.shares.filter((s) => actives.some((m) => m.id === s.memberId));
  const sharedIds = new Set(activeShares.map((s) => s.memberId));
  for (const m of actives) f.included[m.id] = sharedIds.has(m.id);

  for (const s of activeShares) {
    if (e.splitMode === 'EXACT') {
      f.values[s.memberId] = plain(s.amount);
    } else if (s.rawInput) {
      f.values[s.memberId] = plain(s.rawInput);
    } else if (e.splitMode === 'SHARES') {
      // Fallback for SHARES: use amount as weight
      f.values[s.memberId] = plain(s.amount);
    } else if (e.splitMode === 'PERCENT') {
      // Fallback for PERCENT: calculate from amounts
      const pct = new Decimal(s.amount).div(e.amount).mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
      f.values[s.memberId] = pct.toString();
    }
  }

  // Adjust PERCENT if values don't sum to 100
  if (e.splitMode === 'PERCENT') {
    const sumPct = activeShares.reduce((a, s) => {
      const v = cleanAmount(f.values[s.memberId] ?? '');
      return a.plus(v ? new Decimal(v) : ZERO);
    }, ZERO);
    if (!sumPct.eq(100) && activeShares.length > 0) {
      const diff = new Decimal(100).minus(sumPct);
      const firstId = activeShares.sort((a, b) => byId({ id: a.memberId }, { id: b.memberId }))[0]?.memberId;
      if (firstId) {
        const current = cleanAmount(f.values[firstId] ?? '');
        f.values[firstId] = new Decimal(current || 0).plus(diff).toString();
      }
    }
  }

  return f;
}

function equalPreview(total: Decimal, ids: string[]): ShareLine[] {
  const sorted = [...ids].sort();
  const each = total.div(sorted.length).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  let left = total.minus(each.mul(sorted.length)).div(PAISA).toNumber();
  return sorted.map((id) => {
    const extra = left > 0 ? PAISA : ZERO;
    if (left > 0) left -= 1;
    return { memberId: id, amount: each.plus(extra).toFixed(2) };
  });
}

function weightedPreview(total: Decimal, weights: Array<{ id: string; w: Decimal }>): ShareLine[] {
  const live = weights.filter((x) => x.w.gt(0)).sort((x, y) => byId({ id: x.id }, { id: y.id }));
  const sum = live.reduce((a, x) => a.plus(x.w), ZERO);
  if (sum.isZero()) return [];
  const floors = live.map((x) => ({ id: x.id, v: total.mul(x.w).div(sum).toDecimalPlaces(2, Decimal.ROUND_DOWN) }));
  let left = total.minus(floors.reduce((a, x) => a.plus(x.v), ZERO)).div(PAISA).toNumber();
  return floors.map((x) => {
    const extra = left > 0 ? PAISA : ZERO;
    if (left > 0) left -= 1;
    return { memberId: x.id, amount: x.v.plus(extra).toFixed(2) };
  });
}

const fail = (error: string, remaining: string | null = null, preview: ShareLine[] = []): FormCheck => ({ ok: false, error, remaining, preview });

export function checkForm(f: ExpenseFormState, members: SplitMemberDto[], baseCurrency: string): FormCheck {
  const actives = active(members);
  if (!f.description.trim()) return fail('Add a description');
  const amountRaw = cleanAmount(f.amount);
  if (!MONEY.test(amountRaw) || new Decimal(amountRaw).lte(0)) return fail('Enter an amount above 0 with at most 2 decimals');
  const total = new Decimal(amountRaw);
  if (f.currency !== baseCurrency) {
    const rate = cleanAmount(f.fxRate);
    if (!NUM.test(rate) || new Decimal(rate).lte(0)) return fail(`Enter the ${f.currency} → ${baseCurrency} exchange rate`);
  }

  // Payers
  if (f.payerMode === 'single') {
    if (!actives.some((m) => m.id === f.singlePayerId)) return fail('Pick who paid');
  } else {
    let paid = ZERO;
    for (const m of actives) {
      const v = cleanAmount(f.payerAmounts[m.id] ?? '');
      if (!v) continue;
      if (!MONEY.test(v)) return fail(`Check the amount paid by ${m.isMe ? 'you' : m.displayName}`);
      paid = paid.plus(v);
    }
    if (!paid.eq(total)) {
      return fail(`Paid amounts add up to ${formatSplitMoney(paid, f.currency)}, not ${formatSplitMoney(total, f.currency)}`);
    }
  }

  // Shares
  const ids = actives.map((m) => m.id);
  if (f.splitMode === 'EQUAL') {
    const chosen = ids.filter((id) => f.included[id]);
    if (chosen.length === 0) return fail('Pick at least one person to split with');
    return { ok: true, error: null, remaining: null, preview: equalPreview(total, chosen) };
  }

  const parsed: Array<{ id: string; w: Decimal }> = [];
  for (const m of actives) {
    const v = cleanAmount(f.values[m.id] ?? '');
    if (!v) continue;
    if (!NUM.test(v)) return fail(`Check the value for ${m.isMe ? 'you' : m.displayName}`);
    if (f.splitMode === 'EXACT' && !MONEY.test(v)) return fail(`Use at most 2 decimals for ${m.isMe ? 'you' : m.displayName}`);
    parsed.push({ id: m.id, w: new Decimal(v) });
  }
  const sum = parsed.reduce((a, x) => a.plus(x.w), ZERO);
  if (f.splitMode === 'EXACT') {
    const remaining = total.minus(sum);
    const preview = parsed.filter((x) => x.w.gt(0)).sort((x, y) => byId({ id: x.id }, { id: y.id })).map((x) => ({ memberId: x.id, amount: x.w.toFixed(2) }));
    if (!remaining.isZero()) {
      return fail(remaining.gt(0) ? `${formatSplitMoney(remaining, f.currency)} left to assign` : `Over by ${formatSplitMoney(remaining, f.currency)}`, remaining.toFixed(2), preview);
    }
    if (preview.length === 0) return fail('Pick at least one person to split with');
    return { ok: true, error: null, remaining: '0.00', preview };
  }
  if (f.splitMode === 'PERCENT' && !sum.eq(100)) return fail(`Percentages add up to ${sum.toString()}%, not 100%`);
  if (sum.lte(0)) return fail('Pick at least one person to split with');
  return { ok: true, error: null, remaining: null, preview: weightedPreview(total, parsed) };
}

export function toPayload(f: ExpenseFormState, members: SplitMemberDto[], baseCurrency: string): Omit<ExpenseInput, 'groupId'> {
  const actives = active(members);
  const amount = cleanAmount(f.amount);
  const payers = f.payerMode === 'single'
    ? [{ memberId: f.singlePayerId, amount }]
    : actives
        .map((m) => ({ memberId: m.id, amount: cleanAmount(f.payerAmounts[m.id] ?? '') }))
        .filter((p) => p.amount && new Decimal(p.amount).gt(0));
  const shares = f.splitMode === 'EQUAL'
    ? actives.filter((m) => f.included[m.id]).map((m) => ({ memberId: m.id }))
    : actives
        .map((m) => ({ memberId: m.id, value: cleanAmount(f.values[m.id] ?? '') }))
        .filter((s) => s.value && new Decimal(s.value).gt(0));
  return {
    description: f.description.trim(),
    date: f.date,
    amount,
    currency: f.currency,
    fxRate: f.currency === baseCurrency ? null : cleanAmount(f.fxRate),
    splitMode: f.splitMode,
    payers,
    shares,
  };
}
