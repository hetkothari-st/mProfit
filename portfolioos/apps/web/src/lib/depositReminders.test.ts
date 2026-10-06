import { describe, it, expect } from 'vitest';
import { depositReminders } from './depositReminders';

const TODAY = '2026-09-10';

const fd = (maturity: string | null) =>
  depositReminders({ kind: 'FD', openDate: '2026-05-01', maturity, installmentsPaid: 0, today: TODAY });

// 24-month RD from 5 Jan 2026; `paid` installments recorded.
const rd = (paid: number, today = TODAY, maturity = '2028-01-05') =>
  depositReminders({ kind: 'RD', openDate: '2026-01-05', maturity, installmentsPaid: paid, today });

describe('depositReminders', () => {
  it('reminds about an FD maturing within 30 days', () => {
    expect(fd('2026-09-25')).toEqual([
      { kind: 'maturity', date: '2026-09-25', daysLeft: 15, tone: 'soon', text: 'Matures in 15 days' },
    ]);
  });

  it('marks maturity within a week as urgent, and today as today', () => {
    expect(fd('2026-09-17')[0]).toMatchObject({ tone: 'urgent', text: 'Matures in 7 days' });
    expect(fd('2026-09-10')[0]).toMatchObject({ daysLeft: 0, text: 'Matures today' });
  });

  it('says nothing for maturity more than 30 days out, already past, or unknown', () => {
    expect(fd('2026-10-11')).toEqual([]);
    expect(fd('2026-09-09')).toEqual([]);
    expect(fd(null)).toEqual([]);
  });

  it('flags an overdue RD installment', () => {
    // 8 paid: the 9th was due 5 Sep.
    expect(rd(8)).toEqual([
      { kind: 'installment', date: '2026-09-05', daysLeft: -5, tone: 'overdue', text: 'Installment overdue by 5 days' },
    ]);
  });

  it('reminds about an RD installment due within a week', () => {
    expect(rd(8, '2026-09-02')[0]).toMatchObject({ daysLeft: 3, tone: 'urgent', text: 'Installment due in 3 days' });
    expect(rd(8, '2026-09-05')[0]).toMatchObject({ text: 'Installment due today' });
    expect(rd(8, '2026-08-20')).toEqual([]);
  });

  it('stops installment reminders once every installment is paid', () => {
    expect(rd(24, '2027-12-20').filter((r) => r.kind === 'installment')).toEqual([]);
  });

  it('lists overdue before anything else', () => {
    // 9-month plan maturing 5 Oct (25 days out): 8 paid, the 9th overdue.
    const both = rd(8, TODAY, '2026-10-05');
    expect(both.map((r) => r.kind)).toEqual(['installment', 'maturity']);
  });
});
