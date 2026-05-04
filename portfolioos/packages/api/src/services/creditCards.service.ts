/**
 * Credit Cards service — CRUD for CreditCard and CreditCardStatement,
 * computed card summary, and alert scanner for upcoming/overdue due dates.
 *
 * Money math uses decimal.js throughout per §3.2.
 */

import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { serializeMoney } from '@portfolioos/shared';

// ── Constants ────────────────────────────────────────────────────────────────

export const CARD_NETWORKS = ['VISA', 'MASTERCARD', 'RUPAY', 'AMEX', 'DINERS', 'OTHER'] as const;

export const CARD_STATUSES = ['ACTIVE', 'INACTIVE', 'BLOCKED', 'CLOSED'] as const;

export const STATEMENT_STATUSES = ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED'] as const;

const ALERT_THRESHOLDS = [30, 15, 7, 1] as const;

// ── Input types ──────────────────────────────────────────────────────────────

export interface CreateCardInput {
  issuerBank: string;
  cardName: string;
  last4: string;
  network?: (typeof CARD_NETWORKS)[number] | null;
  creditLimit: string;
  outstandingBalance?: string | null;
  statementDay: number;
  dueDay: number;
  interestRate?: string | null;
  annualFee?: string | null;
  status?: (typeof CARD_STATUSES)[number];
}

export type UpdateCardInput = Partial<CreateCardInput>;

export interface AddStatementInput {
  forMonth: string;          // YYYY-MM
  statementAmount: string;
  minimumDue?: string | null;
  dueDate: string;           // YYYY-MM-DD
  paidAmount?: string | null;
  paidOn?: string | null;
  status: (typeof STATEMENT_STATUSES)[number];
  canonicalEventId?: string | null;
}

export interface MarkStatementPaidInput {
  paidAmount: string;
  paidOn: string;
  status?: (typeof STATEMENT_STATUSES)[number];
}

// ── Computed types ───────────────────────────────────────────────────────────

export interface CardSummary {
  totalLimit: string;
  outstanding: string;
  utilizationPct: number;
  overdueStatements: number;
  nextDueDate: string | null;
  nextDueAmount: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDate(s: string): Date {
  return new Date(s + 'T00:00:00Z');
}

function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Card CRUD ────────────────────────────────────────────────────────────────

export async function listCards(userId: string) {
  return prisma.creditCard.findMany({
    where: { userId },
    include: {
      statements: {
        orderBy: { dueDate: 'desc' },
        take: 3,
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getCard(userId: string, cardId: string) {
  const card = await prisma.creditCard.findFirst({
    where: { id: cardId, userId },
    include: {
      statements: { orderBy: { dueDate: 'desc' } },
    },
  });
  if (!card) throw new NotFoundError(`CreditCard ${cardId} not found`);
  return card;
}

export async function createCard(userId: string, input: CreateCardInput) {
  return prisma.creditCard.create({
    data: {
      userId,
      issuerBank: input.issuerBank,
      cardName: input.cardName,
      last4: input.last4,
      network: input.network ?? null,
      creditLimit: new Prisma.Decimal(input.creditLimit),
      outstandingBalance: input.outstandingBalance
        ? new Prisma.Decimal(input.outstandingBalance)
        : null,
      statementDay: input.statementDay,
      dueDay: input.dueDay,
      interestRate: input.interestRate ? new Prisma.Decimal(input.interestRate) : null,
      annualFee: input.annualFee ? new Prisma.Decimal(input.annualFee) : null,
      status: input.status ?? 'ACTIVE',
    },
  });
}

export async function updateCard(
  userId: string,
  cardId: string,
  input: UpdateCardInput,
) {
  const existing = await prisma.creditCard.findFirst({ where: { id: cardId, userId } });
  if (!existing) throw new NotFoundError(`CreditCard ${cardId} not found`);

  return prisma.creditCard.update({
    where: { id: cardId },
    data: {
      ...(input.issuerBank !== undefined && { issuerBank: input.issuerBank }),
      ...(input.cardName !== undefined && { cardName: input.cardName }),
      ...(input.last4 !== undefined && { last4: input.last4 }),
      ...(input.network !== undefined && { network: input.network }),
      ...(input.creditLimit !== undefined && {
        creditLimit: new Prisma.Decimal(input.creditLimit),
      }),
      ...(input.outstandingBalance !== undefined && {
        outstandingBalance: input.outstandingBalance
          ? new Prisma.Decimal(input.outstandingBalance)
          : null,
      }),
      ...(input.statementDay !== undefined && { statementDay: input.statementDay }),
      ...(input.dueDay !== undefined && { dueDay: input.dueDay }),
      ...(input.interestRate !== undefined && {
        interestRate: input.interestRate ? new Prisma.Decimal(input.interestRate) : null,
      }),
      ...(input.annualFee !== undefined && {
        annualFee: input.annualFee ? new Prisma.Decimal(input.annualFee) : null,
      }),
      ...(input.status !== undefined && { status: input.status }),
    },
  });
}

export async function deleteCard(userId: string, cardId: string) {
  const existing = await prisma.creditCard.findFirst({ where: { id: cardId, userId } });
  if (!existing) throw new NotFoundError(`CreditCard ${cardId} not found`);
  await prisma.creditCard.delete({ where: { id: cardId } });
}

// ── Statement management ─────────────────────────────────────────────────────

export async function addStatement(
  userId: string,
  cardId: string,
  input: AddStatementInput,
) {
  const card = await prisma.creditCard.findFirst({ where: { id: cardId, userId } });
  if (!card) throw new NotFoundError(`CreditCard ${cardId} not found`);

  const statement = await prisma.creditCardStatement.create({
    data: {
      cardId,
      forMonth: input.forMonth,
      statementAmount: new Prisma.Decimal(input.statementAmount),
      minimumDue: input.minimumDue ? new Prisma.Decimal(input.minimumDue) : null,
      dueDate: toDate(input.dueDate),
      paidAmount: input.paidAmount ? new Prisma.Decimal(input.paidAmount) : null,
      paidOn: input.paidOn ? toDate(input.paidOn) : null,
      status: input.status,
      canonicalEventId: input.canonicalEventId ?? null,
    },
  });

  // Update card's outstanding balance to reflect the statement amount if no manual value set
  if (!card.outstandingBalance && input.status !== 'PAID') {
    await prisma.creditCard.update({
      where: { id: cardId },
      data: { outstandingBalance: new Prisma.Decimal(input.statementAmount) },
    });
  }

  return statement;
}

export async function markStatementPaid(
  userId: string,
  statementId: string,
  input: MarkStatementPaidInput,
) {
  const statement = await prisma.creditCardStatement.findFirst({
    where: { id: statementId },
    include: { card: { select: { userId: true } } },
  });
  if (!statement || statement.card.userId !== userId) {
    throw new NotFoundError(`CreditCardStatement ${statementId} not found`);
  }

  const paidAmt = new Prisma.Decimal(input.paidAmount);
  const statementAmt = statement.statementAmount;

  // Determine status if not provided
  let status = input.status;
  if (!status) {
    if (paidAmt.gte(statementAmt)) {
      status = 'PAID';
    } else if (paidAmt.gt(new Prisma.Decimal(0))) {
      status = 'PARTIAL';
    } else {
      status = 'PENDING';
    }
  }

  return prisma.creditCardStatement.update({
    where: { id: statementId },
    data: {
      paidAmount: paidAmt,
      paidOn: toDate(input.paidOn),
      status,
    },
  });
}

export async function deleteStatement(userId: string, statementId: string) {
  const statement = await prisma.creditCardStatement.findFirst({
    where: { id: statementId },
    include: { card: { select: { userId: true } } },
  });
  if (!statement || statement.card.userId !== userId) {
    throw new NotFoundError(`CreditCardStatement ${statementId} not found`);
  }
  await prisma.creditCardStatement.delete({ where: { id: statementId } });
}

// ── Computed summary ─────────────────────────────────────────────────────────

export function computeCardSummary(
  card: {
    creditLimit: Prisma.Decimal;
    outstandingBalance: Prisma.Decimal | null;
    statements: Array<{
      status: string;
      dueDate: Date;
      statementAmount: Prisma.Decimal;
      paidAmount: Prisma.Decimal | null;
      minimumDue: Prisma.Decimal | null;
    }>;
  },
): CardSummary {
  const ZERO = new Decimal(0);

  const totalLimit = new Decimal(card.creditLimit.toString());
  const outstanding = card.outstandingBalance
    ? new Decimal(card.outstandingBalance.toString())
    : ZERO;

  const utilizationPct = totalLimit.greaterThan(0)
    ? outstanding.dividedBy(totalLimit).times(100).toDecimalPlaces(2).toNumber()
    : 0;

  const overdueStatements = card.statements.filter((s) => s.status === 'OVERDUE').length;

  // Next upcoming statement (PENDING or PARTIAL, not yet past due today)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const upcoming = card.statements
    .filter((s) => (s.status === 'PENDING' || s.status === 'PARTIAL') && s.dueDate >= today)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  const nextStatement = upcoming[0] ?? null;

  let nextDueDate: string | null = null;
  let nextDueAmount: string | null = null;

  if (nextStatement) {
    nextDueDate = dateToIso(nextStatement.dueDate);
    // Show minimum due if partially paid, else full statement amount
    const paid = nextStatement.paidAmount ? new Decimal(nextStatement.paidAmount.toString()) : ZERO;
    const remaining = new Decimal(nextStatement.statementAmount.toString()).minus(paid);
    nextDueAmount = serializeMoney(Decimal.max(ZERO, remaining));
  }

  return {
    totalLimit: serializeMoney(totalLimit),
    outstanding: serializeMoney(outstanding),
    utilizationPct,
    overdueStatements,
    nextDueDate,
    nextDueAmount,
  };
}

export async function getCardSummary(userId: string, cardId: string): Promise<CardSummary> {
  const card = await getCard(userId, cardId);
  return computeCardSummary(card);
}

// ── Alert scanner ────────────────────────────────────────────────────────────

/**
 * For every ACTIVE credit card, scan statements with PENDING/PARTIAL status
 * and create Alert rows for due dates within threshold windows.
 * Also creates OVERDUE alerts for past-due statements.
 */
export async function generateCreditCardAlerts(userId?: string): Promise<number> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayStr = dateToIso(today);

  const maxLookAhead = new Date(today);
  maxLookAhead.setDate(maxLookAhead.getDate() + 30);

  const statements = await prisma.creditCardStatement.findMany({
    where: {
      card: {
        ...(userId ? { userId } : {}),
        status: 'ACTIVE',
      },
      status: { in: ['PENDING', 'PARTIAL'] },
    },
    include: {
      card: { select: { id: true, userId: true, issuerBank: true, cardName: true, last4: true } },
    },
    orderBy: { dueDate: 'asc' },
  });

  let created = 0;

  for (const stmt of statements) {
    const dueDate = stmt.dueDate;
    const daysLeft = Math.ceil(
      (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    const isOverdue = daysLeft < 0;

    if (!isOverdue && !(ALERT_THRESHOLDS as readonly number[]).includes(daysLeft)) continue;
    if (!isOverdue && dueDate > maxLookAhead) continue;

    const daysLabel = Math.abs(daysLeft);
    const metaKey = `credit_card_due:${stmt.id}:${isOverdue ? 'overdue' : `${daysLeft}d`}`;

    const existing = await prisma.alert.findFirst({
      where: {
        userId: stmt.card.userId,
        type: 'CREDIT_CARD_DUE',
        metadata: { path: ['key'], equals: metaKey },
      },
    });
    if (existing) continue;

    const cardLabel = `${stmt.card.issuerBank} ${stmt.card.cardName} ••••${stmt.card.last4}`;
    const amtDisplay = `₹${parseFloat(stmt.statementAmount.toString()).toLocaleString('en-IN')}`;

    const title = isOverdue
      ? `${cardLabel} payment overdue by ${daysLabel} day${daysLabel !== 1 ? 's' : ''}`
      : `${cardLabel} payment due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;

    const description = `${stmt.forMonth} statement of ${amtDisplay} ${isOverdue ? 'was due on' : 'due on'} ${dateToIso(dueDate)}`;

    await prisma.alert.create({
      data: {
        userId: stmt.card.userId,
        type: 'CREDIT_CARD_DUE',
        title,
        description,
        triggerDate: new Date(),
        metadata: {
          key: metaKey,
          cardId: stmt.card.id,
          statementId: stmt.id,
          forMonth: stmt.forMonth,
          dueDate: dateToIso(dueDate),
          statementAmount: stmt.statementAmount.toString(),
          daysLeft,
          isOverdue,
        },
      },
    });

    // If overdue, also flip the statement status
    if (isOverdue && stmt.status === 'PENDING') {
      try {
        await prisma.creditCardStatement.update({
          where: { id: stmt.id },
          data: { status: 'OVERDUE' },
        });
      } catch (err) {
        logger.warn(
          { statementId: stmt.id, err: err instanceof Error ? err.message : String(err) },
          '[credit-cards] failed to flip statement to OVERDUE — non-fatal',
        );
      }
    }

    created++;
  }

  return created;
}
