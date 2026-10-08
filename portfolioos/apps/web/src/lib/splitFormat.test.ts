import { describe, it, expect } from 'vitest';
import type { SplitMemberDto } from '@everypaisa/shared';
import { formatSplitMoney, balanceTone, balanceLabel, memberName, transferLabel } from './splitFormat';

const members: SplitMemberDto[] = [
  { id: 'm1', displayName: 'Alice', userId: 'u1', contactId: null, isMe: true, leftAt: null },
  { id: 'm2', displayName: 'Bob', userId: 'u2', contactId: 'c2', isMe: false, leftAt: null },
];

describe('splitFormat', () => {
  it('formatSplitMoney INR uses Indian grouping and drops sign', () => {
    expect(formatSplitMoney('-123456.5000', 'INR')).toBe('₹1,23,456.50');
  });
  it('formatSplitMoney USD', () => {
    expect(formatSplitMoney('20.0000', 'USD')).toBe('$20.00');
  });
  it('balanceTone', () => {
    expect(balanceTone('10.0000')).toBe('owed');
    expect(balanceTone('-0.0100')).toBe('owe');
    expect(balanceTone('0.0000')).toBe('settled');
  });
  it('balanceLabel copy', () => {
    expect(balanceLabel('500.0000', 'INR')).toBe('owes you ₹500.00');
    expect(balanceLabel('-500.0000', 'INR')).toBe('you owe ₹500.00');
    expect(balanceLabel('0.0000', 'INR')).toBe('settled up');
    expect(balanceLabel('500.0000', 'INR', { approx: true })).toBe('owes you ≈ ₹500.00');
    expect(balanceLabel('500.0000', 'INR', { who: 'you are owed' })).toBe('you are owed ₹500.00');
  });
  it('memberName says You for me', () => {
    expect(memberName(members, 'm1')).toBe('You');
    expect(memberName(members, 'm2')).toBe('Bob');
    expect(memberName(members, 'zz')).toBe('Former member');
  });
  it('transferLabel', () => {
    expect(transferLabel(members, { fromMemberId: 'm2', toMemberId: 'm1', amount: '70.0000' }, 'INR')).toBe('Bob pays You ₹70.00');
  });
});
