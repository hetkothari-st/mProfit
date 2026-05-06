/**
 * pf.controller.ts
 *
 * Handlers for /api/epfppf/* endpoints.
 * Covers: account CRUD, session lifecycle, SSE event stream,
 * CAPTCHA/OTP response relay, manual PDF upload.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { prisma } from '../lib/prisma.js';
import { ok, created, error } from '../lib/response.js';
import { logger } from '../lib/logger.js';
import { sseHub } from '../lib/sseHub.js';
import {
  listPfAccounts,
  createPfAccount,
  getPfAccountById,
  forgetPfCredentials,
} from '../services/pfAccounts.service.js';
import {
  encryptCredentialBlob,
  decryptIdentifier,
} from '../services/pfCredentials.service.js';
import { startSession } from '../services/pfFetchSessions.service.js';
import { buildCanonicalEvents } from '../services/pfCanonicalize.service.js';
import { recomputeForAsset } from '../services/holdingsProjection.js';
import { tokenizePassbookPdf } from '../adapters/pf/shared/pdfPassbookParser.js';
import { parseEpfoPassbook } from '../adapters/pf/epf/epfo.v1.parse.js';
import { pfFetchQueue } from '../jobs/pfFetchWorker.js';
import type { CanonicalEventType } from '@prisma/client';

// ---------------------------------------------------------------------------
// Multer — in-memory, 10 MB cap
// ---------------------------------------------------------------------------

export const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 },
  storage: multer.memoryStorage(),
});

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const CreateAccountSchema = z.object({
  type: z.enum(['EPF', 'PPF']),
  institution: z.enum([
    'EPFO',
    'SBI',
    'INDIA_POST',
    'HDFC',
    'ICICI',
    'AXIS',
    'PNB',
    'BOB',
  ]),
  identifier: z.string().min(4).max(40),
  holderName: z.string().min(1).max(100),
  branchCode: z.string().max(20).optional(),
  portfolioId: z.string().optional(),
});

const StartSessionSchema = z.object({
  accountId: z.string(),
  saveCredentials: z.boolean().default(false),
  credentials: z
    .object({
      username: z.string().min(1),
      password: z.string().min(1),
      mpin: z.string().optional(),
    })
    .optional(),
});

const PromptResponseSchema = z.object({
  promptId: z.string(),
  value: z.string().min(1).max(64),
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function listAccountsHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const accounts = await listPfAccounts(userId);
  ok(res, accounts);
}

export async function createAccountHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const parsed = CreateAccountSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return error(res, 400, parsed.error.issues.map((i) => i.message).join('; '), 'VALIDATION_ERROR');
  }
  const account = await createPfAccount({ userId, ...parsed.data });
  created(res, account);
}

export async function startSessionHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const parsed = StartSessionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return error(res, 400, parsed.error.issues.map((i) => i.message).join('; '), 'VALIDATION_ERROR');
  }
  const { accountId, saveCredentials, credentials } = parsed.data;

  const account = await getPfAccountById(userId, accountId);
  if (!account) {
    return error(res, 404, 'PF account not found', 'NOT_FOUND');
  }

  // Persist encrypted credentials if requested
  if (saveCredentials && credentials) {
    try {
      const blob = await encryptCredentialBlob(credentials);
      await prisma.providentFundAccount.update({
        where: { id: account.id },
        data: { storedCredentials: { blob } },
      });
    } catch (encErr) {
      logger.warn({ accountId, err: encErr }, '[pf] failed to persist credentials');
    }
  }

  const session = await startSession({
    userId,
    accountId: account.id,
    source: 'SERVER_HEADLESS',
  });

  // Enqueue the headless fetch job
  await pfFetchQueue.add('fetch', {
    sessionId: session.id,
    accountId: account.id,
    userId,
    // Only pass credentials inline if user chose NOT to save them
    credentialOverride: !saveCredentials ? credentials : undefined,
  });

  ok(res, { sessionId: session.id });
}

export async function sseEventsHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const { sessionId } = req.params as { sessionId: string };

  // Verify ownership
  const session = await prisma.pfFetchSession.findFirst({
    where: { id: sessionId, userId },
  });
  if (!session) {
    return error(res, 404, 'Session not found', 'NOT_FOUND');
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  const unsubscribe = sseHub.subscribe(sessionId, (e) => {
    res.write(`event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`);
    // Flush if available (compression middleware may buffer)
    if (typeof (res as unknown as { flush?: () => void }).flush === 'function') {
      (res as unknown as { flush: () => void }).flush();
    }
  });

  req.on('close', () => {
    unsubscribe();
    res.end();
  });
}

export async function captchaRespondHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const { sessionId } = req.params as { sessionId: string };

  const session = await prisma.pfFetchSession.findFirst({
    where: { id: sessionId, userId },
  });
  if (!session) {
    return error(res, 404, 'Session not found', 'NOT_FOUND');
  }

  const parsed = PromptResponseSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return error(res, 400, 'Invalid body', 'VALIDATION_ERROR');
  }

  const { promptId, value } = parsed.data;
  const responded = sseHub.respond(sessionId, promptId, value);
  ok(res, { accepted: responded });
}

export async function otpRespondHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const { sessionId } = req.params as { sessionId: string };

  const session = await prisma.pfFetchSession.findFirst({
    where: { id: sessionId, userId },
  });
  if (!session) {
    return error(res, 404, 'Session not found', 'NOT_FOUND');
  }

  const parsed = PromptResponseSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return error(res, 400, 'Invalid body', 'VALIDATION_ERROR');
  }

  const { promptId, value } = parsed.data;
  const responded = sseHub.respond(sessionId, promptId, value);
  ok(res, { accepted: responded });
}

export async function forgetCredentialsHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const { id } = req.params as { id: string };

  await forgetPfCredentials(userId, id);
  ok(res, { forgotten: true });
}

export async function uploadManualPassbookHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const { id } = req.params as { id: string };

  const account = await getPfAccountById(userId, id);
  if (!account) {
    return error(res, 404, 'PF account not found', 'NOT_FOUND');
  }

  if (!req.file) {
    return error(res, 400, 'No file uploaded', 'NO_FILE');
  }

  let tokens;
  try {
    tokens = await tokenizePassbookPdf(req.file.buffer);
  } catch (pdfErr) {
    const msg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
    return error(res, 422, `PDF parse failed: ${msg}`, 'PARSE_FAIL');
  }

  const memberIdHint =
    typeof req.body?.memberId === 'string' ? req.body.memberId : account.identifierLast4;

  const result = parseEpfoPassbook({ userId, memberId: memberIdHint, tokens });
  if (!result.ok) {
    return error(res, 422, result.error, 'PARSE_FAIL');
  }

  let identifierPlain: string;
  try {
    identifierPlain = await decryptIdentifier(account.identifierCipher.toString('base64'));
  } catch (decErr) {
    logger.warn({ accountId: id, err: decErr }, '[pf] identifier decrypt failed on manual upload');
    identifierPlain = account.identifierLast4; // fallback to last4
  }

  const built = buildCanonicalEvents({
    userId,
    account: {
      id: account.id,
      institution: account.institution,
      type: account.type,
      identifierPlain,
    },
    adapterId: 'pf.epfo.manual.v1',
    adapterVersion: '1.0.0',
    events: result.events,
  });

  let inserted = 0;
  await prisma.$transaction(async (tx) => {
    for (const e of built) {
      try {
        await tx.canonicalEvent.upsert({
          where: {
            userId_sourceHash: { userId: e.userId, sourceHash: e.sourceHash },
          },
          create: { ...e, eventType: e.eventType as CanonicalEventType, status: 'CONFIRMED' },
          update: {},
        });
        inserted++;
      } catch {
        // P2002 unique constraint = duplicate → skip
      }
    }
  });

  if (account.portfolioId && account.assetKey) {
    try {
      await recomputeForAsset(account.portfolioId, account.assetKey);
    } catch (recomputeErr) {
      logger.warn(
        { portfolioId: account.portfolioId, assetKey: account.assetKey, err: recomputeErr },
        '[pf] holding recompute failed — non-fatal',
      );
    }
  }

  await prisma.providentFundAccount.update({
    where: { id: account.id },
    data: { lastRefreshedAt: new Date(), lastFetchSource: 'MANUAL_PDF' },
  });

  ok(res, { inserted });
}
