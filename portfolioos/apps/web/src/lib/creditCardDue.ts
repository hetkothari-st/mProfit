/**
 * When a credit card's next payment falls due.
 *
 * An unpaid statement (pending, part-paid or overdue) knows its own due date
 * and amount. Without one, the card's due day of the month is the best
 * estimate: the next time that day comes round, clamped to short months
 * (a "31st" card falls due on 28 Feb).
 */
import { Decimal } from '@portfolioos/shared';

export interface CardDue {
  /** YYYY-MM-DD */
  date: string;
  /** What's left to pay on the statement; null when estimated from the due day. */
  amount: string | null;
  fromStatement: boolean;
  /** Negative once overdue. */
  daysLeft: number;
}

interface DueStatement {
  dueDate: string;
  status: string;
  statementAmount: string;
  paidAmount: string | null;
}

const UNPAID = new Set(['PENDING', 'PARTIAL', 'OVERDUE']);
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

/** Today in the viewer's own time zone, as YYYY-MM-DD. */
export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `day` of the given month (0-based), clamped to the month's length. */
function dayOf(year: number, month: number, day: number): string {
  const y = year + Math.floor(month / 12);
  const m = ((month % 12) + 12) % 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return `${y}-${pad(m + 1)}-${pad(Math.min(day, last))}`;
}

export function nextCardDue(
  card: { dueDay: number; statements: DueStatement[] },
  today: string,
): CardDue {
  const daysLeft = (date: string) => Math.round((utc(date) - utc(today)) / DAY_MS);

  const open = card.statements
    .filter((s) => UNPAID.has(s.status))
    .map((s) => ({ ...s, dueDate: s.dueDate.slice(0, 10) }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  if (open) {
    const left = new Decimal(open.statementAmount).minus(new Decimal(open.paidAmount ?? '0'));
    return {
      date: open.dueDate,
      amount: Decimal.max(left, 0).toString(),
      fromStatement: true,
      daysLeft: daysLeft(open.dueDate),
    };
  }

  const year = +today.slice(0, 4);
  const month = +today.slice(5, 7) - 1;
  let date = dayOf(year, month, card.dueDay);
  if (date < today) date = dayOf(year, month + 1, card.dueDay);
  return { date, amount: null, fromStatement: false, daysLeft: daysLeft(date) };
}
