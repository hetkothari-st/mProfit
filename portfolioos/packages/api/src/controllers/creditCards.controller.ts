import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  CARD_NETWORKS,
  CARD_STATUSES,
  STATEMENT_STATUSES,
  listCards,
  getCard,
  createCard,
  updateCard,
  deleteCard,
  addStatement,
  markStatementPaid,
  deleteStatement,
  getCardSummary,
} from '../services/creditCards.service.js';
import { ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const isoMonth = z.string().regex(/^\d{4}-\d{2}$/, 'Expected YYYY-MM');
const moneyString = z.string().regex(/^\d+(\.\d+)?$/, 'Expected positive decimal string');

// ── Zod schemas ──────────────────────────────────────────────────────────────

const createCardSchema = z.object({
  issuerBank: z.string().min(1).max(200),
  cardName: z.string().min(1).max(200),
  last4: z.string().length(4).regex(/^\d{4}$/, 'Expected 4 digits'),
  network: z.enum(CARD_NETWORKS).nullable().optional(),
  creditLimit: moneyString,
  outstandingBalance: moneyString.nullable().optional(),
  statementDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31),
  interestRate: moneyString.nullable().optional(),
  annualFee: moneyString.nullable().optional(),
  status: z.enum(CARD_STATUSES).optional(),
});

const updateCardSchema = createCardSchema.partial();

const addStatementSchema = z.object({
  forMonth: isoMonth,
  statementAmount: moneyString,
  minimumDue: moneyString.nullable().optional(),
  dueDate: isoDate,
  paidAmount: moneyString.nullable().optional(),
  paidOn: isoDate.nullable().optional(),
  status: z.enum(STATEMENT_STATUSES),
  canonicalEventId: z.string().nullable().optional(),
});

const markPaidSchema = z.object({
  paidAmount: moneyString,
  paidOn: isoDate,
  status: z.enum(STATEMENT_STATUSES).optional(),
});

// ── Handlers ─────────────────────────────────────────────────────────────────

export async function listCardsHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const cards = await listCards(req.user.id);
  ok(res, cards);
}

export async function getCardHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const card = await getCard(req.user.id, req.params['id']!);
  ok(res, card);
}

export async function createCardHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = createCardSchema.parse(req.body);
  const card = await createCard(req.user.id, body);
  res.status(201);
  ok(res, card);
}

export async function updateCardHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = updateCardSchema.parse(req.body);
  const card = await updateCard(req.user.id, req.params['id']!, body);
  ok(res, card);
}

export async function deleteCardHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteCard(req.user.id, req.params['id']!);
  ok(res, null);
}

export async function getCardSummaryHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const summary = await getCardSummary(req.user.id, req.params['id']!);
  ok(res, summary);
}

export async function addStatementHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = addStatementSchema.parse(req.body);
  const statement = await addStatement(req.user.id, req.params['id']!, body);
  res.status(201);
  ok(res, statement);
}

export async function markStatementPaidHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  const body = markPaidSchema.parse(req.body);
  const statement = await markStatementPaid(req.user.id, req.params['statementId']!, body);
  ok(res, statement);
}

export async function deleteStatementHandler(req: Request, res: Response) {
  if (!req.user) throw new UnauthorizedError();
  await deleteStatement(req.user.id, req.params['statementId']!);
  ok(res, null);
}
