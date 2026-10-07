/**
 * Group balances, derived on every read from payers, shares and settlements
 * (all already in the group's base currency). Nothing here touches the DB.
 * Net > 0 means the member is owed money.
 */
import { Decimal } from 'decimal.js';
import { AppError } from '../../lib/errors.js';

export interface LedgerExpense { payers: Array<{ memberId: string; baseAmount: Decimal }>; shares: Array<{ memberId: string; baseAmount: Decimal }> }
export interface LedgerSettlement { fromMemberId: string; toMemberId: string; baseAmount: Decimal }
export interface Transfer { fromMemberId: string; toMemberId: string; amount: Decimal }

const ZERO = new Decimal(0);
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function memberNets(expenses: LedgerExpense[], settlements: LedgerSettlement[], memberIds: string[]): Map<string, Decimal> {
  const nets = new Map<string, Decimal>(memberIds.map((id) => [id, ZERO]));
  const add = (id: string, v: Decimal) => nets.set(id, (nets.get(id) ?? ZERO).plus(v));
  for (const e of expenses) {
    for (const p of e.payers) add(p.memberId, p.baseAmount);
    for (const s of e.shares) add(s.memberId, s.baseAmount.neg());
  }
  for (const s of settlements) {
    add(s.fromMemberId, s.baseAmount);
    add(s.toMemberId, s.baseAmount.neg());
  }
  return nets;
}

export function pairwiseDebts(expenses: LedgerExpense[], settlements: LedgerSettlement[]): Transfer[] {
  // owed[x][y] = how much x owes y (full precision until the end)
  const owed = new Map<string, Decimal>();
  const key = (x: string, y: string) => `${x}\u0000${y}`;
  const bump = (x: string, y: string, v: Decimal) => owed.set(key(x, y), (owed.get(key(x, y)) ?? ZERO).plus(v));

  for (const e of expenses) {
    const paidTotal = e.payers.reduce((a, p) => a.plus(p.baseAmount), ZERO);
    if (paidTotal.isZero()) continue;
    for (const s of e.shares) {
      for (const p of e.payers) {
        if (p.memberId === s.memberId) continue;
        bump(s.memberId, p.memberId, s.baseAmount.mul(p.baseAmount).div(paidTotal));
      }
    }
  }
  for (const s of settlements) bump(s.fromMemberId, s.toMemberId, s.baseAmount.neg());

  const pairs = new Set<string>();
  for (const k of owed.keys()) {
    const [x, y] = k.split('\u0000') as [string, string];
    pairs.add(x < y ? key(x, y) : key(y, x));
  }
  const out: Transfer[] = [];
  for (const k of [...pairs].sort()) {
    const [x, y] = k.split('\u0000') as [string, string];
    const net = (owed.get(key(x, y)) ?? ZERO).minus(owed.get(key(y, x)) ?? ZERO).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
    if (net.gt(0)) out.push({ fromMemberId: x, toMemberId: y, amount: net });
    else if (net.lt(0)) out.push({ fromMemberId: y, toMemberId: x, amount: net.neg() });
  }
  return out;
}

export function simplify(nets: Map<string, Decimal>): Transfer[] {
  const total = [...nets.values()].reduce((a, b) => a.plus(b), ZERO);
  if (!total.isZero()) {
    throw new AppError(`SPLIT_NETS_UNBALANCED: nets sum to ${total.toString()}`, 500, 'SPLIT_NETS_UNBALANCED');
  }
  const creditors = [...nets].filter(([, v]) => v.gt(0)).map(([id, v]) => ({ id, v }));
  const debtors = [...nets].filter(([, v]) => v.lt(0)).map(([id, v]) => ({ id, v: v.neg() }));
  const order = (a: { id: string; v: Decimal }, b: { id: string; v: Decimal }) => b.v.cmp(a.v) || byId(a.id, b.id);
  const out: Transfer[] = [];
  while (creditors.length && debtors.length) {
    creditors.sort(order);
    debtors.sort(order);
    const c = creditors[0]!;
    const d = debtors[0]!;
    const amt = Decimal.min(c.v, d.v);
    out.push({ fromMemberId: d.id, toMemberId: c.id, amount: amt });
    c.v = c.v.minus(amt);
    d.v = d.v.minus(amt);
    if (c.v.isZero()) creditors.shift();
    if (d.v.isZero()) debtors.shift();
  }
  return out;
}
