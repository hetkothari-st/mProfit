import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ok } from '../lib/response.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import {
  buildGmailAuthUrl,
  exchangeGmailCode,
  syncGmailAccount,
  disconnectGmailAccount,
  isGmailConfigured,
} from '../connectors/gmail.connector.js';
import { discoverFinancialSenders } from '../ingestion/gmail/discovery.js';

export async function getGmailConfig(_req: Request, res: Response) {
  ok(res, { configured: isGmailConfigured() });
}

export async function getGmailAuthUrl(req: Request, res: Response) {
  const userId = req.user!.id;
  const url = buildGmailAuthUrl(userId);
  ok(res, { url });
}

const CallbackSchema = z.object({ code: z.string().min(1) });

export async function postGmailCallback(req: Request, res: Response) {
  const userId = req.user!.id;
  const { code } = CallbackSchema.parse(req.body);
  const r = await exchangeGmailCode(userId, code);
  ok(res, r);
}

export async function postGmailSync(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = req.params.id;
  if (!id) throw new BadRequestError('id required');
  const acc = await prisma.mailboxAccount.findFirst({
    where: { id, userId, provider: 'GMAIL_OAUTH' },
  });
  if (!acc) throw new NotFoundError('Gmail account not found');
  const r = await syncGmailAccount(id);
  ok(res, r);
}

const DiscoverQuerySchema = z.object({
  lookbackDays: z.coerce.number().int().min(1).max(3650).optional(),
  maxMessages: z.coerce.number().int().min(1).max(5000).optional(),
});

/**
 * §6.6 discovery endpoint. Scans the connected inbox for financial
 * senders and returns them scored/sorted with any seed-directory
 * match already attached. The heavy lifting (listing messages,
 * keyword scoring, seed lookup) lives in `discoverFinancialSenders`;
 * this controller just authenticates + fans the query options in.
 */
export async function getGmailDiscover(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = req.params.id;
  if (!id) throw new BadRequestError('id required');
  const acc = await prisma.mailboxAccount.findFirst({
    where: { id, userId, provider: 'GMAIL_OAUTH' },
  });
  if (!acc) throw new NotFoundError('Gmail account not found');
  const opts = DiscoverQuerySchema.parse(req.query);
  const senders = await discoverFinancialSenders(id, opts);
  ok(res, senders);
}

export async function deleteGmailAccount(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = req.params.id;
  if (!id) throw new BadRequestError('id required');
  const acc = await prisma.mailboxAccount.findFirst({
    where: { id, userId, provider: 'GMAIL_OAUTH' },
  });
  if (!acc) throw new NotFoundError('Gmail account not found');
  await disconnectGmailAccount(id);
  ok(res, { ok: true });
}
