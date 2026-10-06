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
import { consumeOAuthState, issueOAuthState } from '../lib/oauthState.js';

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

export async function kiteLoginUrl(req: Request, res: Response) {
  const state = await issueOAuthState(req.user!.id, 'kite');
  ok(res, { url: buildKiteLoginUrl(state), state });
}

const KiteCallbackSchema = z.object({
  requestToken: z.string().min(1),
  // Required. This flow had no state at all, unlike services/brokerOauth,
  // which has bound its callbacks to a server-issued state since it was
  // written.
  state: z.string().min(1, 'Missing OAuth state'),
  portfolioId: z.string().cuid().optional().nullable(),
});

export async function kiteCallback(req: Request, res: Response) {
  const userId = req.user!.id;
  const body = KiteCallbackSchema.parse(req.body);

  // Bind the request token to a login this user actually started. Otherwise
  // an attacker completes Kite's login with their own account and gets the
  // victim to submit the resulting token, attaching the attacker's Kite
  // session and holdings to the victim's portfolio.
  const stateUserId = await consumeOAuthState(body.state, 'kite');
  if (!stateUserId || stateUserId !== userId) {
    throw new BadRequestError('Invalid or expired OAuth state — start the Kite login again');
  }

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
