/**
 * What an FD / RD needs you to do soon, for the deposits page: maturity within
 * 30 days, and — for RDs — the next monthly installment within a week or
 * overdue. The server raises alerts-bell reminders on the same dates
 * (depositReminders.service); this is the on-page view of them.
 *
 * All dates are ISO `YYYY-MM-DD` and compared as UTC days, so a reminder never
 * shifts by a day with the viewer's timezone.
 */

export const MATURITY_WINDOW_DAYS = 30;
export const INSTALLMENT_WINDOW_DAYS = 7;
const URGENT_DAYS = 7;
const DAY_MS = 86_400_000;

export type ReminderTone = 'soon' | 'urgent' | 'overdue';

export interface DepositReminder {
  kind: 'maturity' | 'installment';
  /** The date the reminder is about (maturity or installment due date). */
  date: string;
  /** Days from today; negative when overdue. */
  daysLeft: number;
  tone: ReminderTone;
  text: string;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addMonthsIso(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function daysBetweenIso(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY_MS);
}

function monthsBetweenIso(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00Z`);
  const b = new Date(`${toIso}T00:00:00Z`);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

function days(n: number): string {
  return `${n} day${n === 1 ? '' : 's'}`;
}

const TONE_RANK: Record<ReminderTone, number> = { overdue: 0, urgent: 1, soon: 2 };

/** Most pressing first: overdue, then urgent, then soon; sooner dates first within each. */
export function compareReminders(a: DepositReminder, b: DepositReminder): number {
  return TONE_RANK[a.tone] - TONE_RANK[b.tone] || a.daysLeft - b.daysLeft;
}

export function depositReminders(input: {
  kind: 'FD' | 'RD';
  openDate: string | null;
  maturity: string | null;
  installmentsPaid: number;
  today: string;
}): DepositReminder[] {
  const { kind, openDate, maturity, installmentsPaid, today } = input;
  if (!maturity) return [];
  const out: DepositReminder[] = [];

  const toMaturity = daysBetweenIso(today, maturity);
  if (toMaturity >= 0 && toMaturity <= MATURITY_WINDOW_DAYS) {
    out.push({
      kind: 'maturity',
      date: maturity,
      daysLeft: toMaturity,
      tone: toMaturity <= URGENT_DAYS ? 'urgent' : 'soon',
      text: toMaturity === 0 ? 'Matures today' : `Matures in ${days(toMaturity)}`,
    });
  }

  if (kind === 'RD' && openDate && toMaturity >= 0) {
    const tenure = monthsBetweenIso(openDate, maturity);
    if (installmentsPaid < tenure) {
      // Installment k (from 0) falls due k months after the first one.
      const due = addMonthsIso(openDate, installmentsPaid);
      const toDue = daysBetweenIso(today, due);
      if (toDue <= INSTALLMENT_WINDOW_DAYS) {
        out.push({
          kind: 'installment',
          date: due,
          daysLeft: toDue,
          tone: toDue < 0 ? 'overdue' : 'urgent',
          text:
            toDue < 0
              ? `Installment overdue by ${days(-toDue)}`
              : toDue === 0
                ? 'Installment due today'
                : `Installment due in ${days(toDue)}`,
        });
      }
    }
  }

  return out.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || a.daysLeft - b.daysLeft);
}
