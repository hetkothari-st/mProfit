/** Display helpers for Split Expenses. Money arrives as strings; parse before math. */
import { Decimal, formatCurrency, toDecimal } from '@everypaisa/shared';
import type { SplitMemberDto } from '@everypaisa/shared';

export type BalanceTone = 'owed' | 'owe' | 'settled';

const dec = (v: string | Decimal) => (v instanceof Decimal ? v : toDecimal(v));

export function formatSplitMoney(value: string | Decimal, currency: string): string {
  return formatCurrency(dec(value).abs().toFixed(2), currency);
}

export function balanceTone(net: string | Decimal): BalanceTone {
  const d = dec(net).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
  if (d.isZero()) return 'settled';
  return d.gt(0) ? 'owed' : 'owe';
}

export function balanceLabel(
  net: string | Decimal,
  currency: string,
  opts: { approx?: boolean; who?: string } = {},
): string {
  const tone = balanceTone(net);
  if (tone === 'settled') return 'settled up';
  const prefix = opts.who ?? (tone === 'owed' ? 'owes you' : 'you owe');
  return `${prefix} ${opts.approx ? '≈ ' : ''}${formatSplitMoney(net, currency)}`;
}

export function memberName(members: SplitMemberDto[], memberId: string): string {
  const m = members.find((x) => x.id === memberId);
  if (!m) return 'Former member';
  return m.isMe ? 'You' : m.displayName;
}

export function transferLabel(
  members: SplitMemberDto[],
  t: { fromMemberId: string; toMemberId: string; amount: string },
  currency: string,
): string {
  return `${memberName(members, t.fromMemberId)} pays ${memberName(members, t.toMemberId)} ${formatSplitMoney(t.amount, currency)}`;
}
