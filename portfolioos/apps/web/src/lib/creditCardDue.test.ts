import { describe, it, expect } from 'vitest';
import { nextCardDue } from './creditCardDue';

const stmt = (dueDate: string, status: string, statementAmount = '5000', paidAmount: string | null = null) => ({
  dueDate,
  status,
  statementAmount,
  paidAmount,
});

describe('nextCardDue', () => {
  it("uses the pending statement's due date and what's left to pay", () => {
    const due = nextCardDue(
      { dueDay: 20, statements: [stmt('2026-09-15', 'PARTIAL', '5000', '1500'), stmt('2026-08-15', 'PAID')] },
      '2026-09-10',
    );
    expect(due).toEqual({ date: '2026-09-15', amount: '3500', fromStatement: true, daysLeft: 5 });
  });

  it('keeps an overdue statement, with negative days', () => {
    const due = nextCardDue({ dueDay: 20, statements: [stmt('2026-09-05', 'OVERDUE')] }, '2026-09-10');
    expect(due).toMatchObject({ date: '2026-09-05', daysLeft: -5, fromStatement: true });
  });

  it('takes the earliest unpaid statement', () => {
    const due = nextCardDue(
      { dueDay: 20, statements: [stmt('2026-10-15', 'PENDING'), stmt('2026-09-15', 'PENDING')] },
      '2026-09-10',
    );
    expect(due.date).toBe('2026-09-15');
  });

  it('otherwise falls on the next due day this month', () => {
    expect(nextCardDue({ dueDay: 20, statements: [] }, '2026-09-10')).toEqual({
      date: '2026-09-20',
      amount: null,
      fromStatement: false,
      daysLeft: 10,
    });
  });

  it('counts today as due, and rolls to next month once it has passed', () => {
    expect(nextCardDue({ dueDay: 10, statements: [] }, '2026-09-10').date).toBe('2026-09-10');
    expect(nextCardDue({ dueDay: 5, statements: [stmt('2026-08-05', 'PAID')] }, '2026-09-10').date).toBe(
      '2026-10-05',
    );
    expect(nextCardDue({ dueDay: 5, statements: [] }, '2026-12-20').date).toBe('2027-01-05');
  });

  it('clamps a due day the month does not have', () => {
    expect(nextCardDue({ dueDay: 31, statements: [] }, '2027-02-10').date).toBe('2027-02-28');
    expect(nextCardDue({ dueDay: 31, statements: [] }, '2026-09-10').date).toBe('2026-09-30');
  });
});
