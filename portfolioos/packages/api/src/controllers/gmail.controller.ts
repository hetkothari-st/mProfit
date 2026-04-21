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
