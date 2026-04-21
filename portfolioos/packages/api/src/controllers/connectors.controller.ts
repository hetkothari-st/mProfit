import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ok } from '../lib/response.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import {
  buildKiteLoginUrl,
  exchangeKiteRequestToken,
  saveKiteSession,
  syncKiteAccount,
  disconnectKite,
} from '../connectors/zerodha.connector.js';

export async function listBrokerAccounts(req: Request, res: Response) {
  const userId = req.user!.id;
  const accounts = await prisma.brokerAccount.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      provider: true,
      label: true,
      publicUserId: true,
      status: true,
      lastSyncAt: true,
      lastError: true,
      portfolioId: true,
      createdAt: true,
    },
  });
  ok(res, accounts);
}

export async function kiteLoginUrl(_req: Request, res: Response) {
  ok(res, { url: buildKiteLoginUrl() });
}

const KiteCallbackSchema = z.object({
  requestToken: z.string().min(1),
  portfolioId: z.string().cuid().optional().nullable(),
});

export async function kiteCallback(req: Request, res: Response) {
  const userId = req.user!.id;
  const body = KiteCallbackSchema.parse(req.body);
  const session = await exchangeKiteRequestToken(body.requestToken);
  const accountId = await saveKiteSession(userId, body.portfolioId ?? null, session);
  ok(res, { accountId, userName: session.user_name });
}

export async function syncBrokerAccount(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = req.params.id;
  if (!id) throw new BadRequestError('id required');
  const acc = await prisma.brokerAccount.findFirst({ where: { id, userId } });
  if (!acc) throw new NotFoundError('Broker account not found');

  if (acc.provider === 'ZERODHA_KITE') {
    const result = await syncKiteAccount(id);
    ok(res, result);
    return;
  }
  throw new BadRequestError(`Sync not implemented for provider ${acc.provider}`);
}

export async function deleteBrokerAccount(req: Request, res: Response) {
  const userId = req.user!.id;
  const id = req.params.id;
  if (!id) throw new BadRequestError('id required');
  const acc = await prisma.brokerAccount.findFirst({ where: { id, userId } });
  if (!acc) throw new NotFoundError('Broker account not found');
  if (acc.provider === 'ZERODHA_KITE') await disconnectKite(id);
  await prisma.brokerAccount.delete({ where: { id } });
  ok(res, { ok: true });
}
