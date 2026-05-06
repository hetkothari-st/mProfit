/**
 * pf.controller.ts
 *
 * Handlers for /api/epfppf/* endpoints.
 * Covers: account CRUD, session lifecycle, SSE event stream,
 * CAPTCHA/OTP response relay, manual PDF upload, browser extension pairing.
 */

import type { Request, Response, NextFunction } from 'express';
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
import { findPfAdapter } from '../adapters/pf/chain.js';
import {
  initPairing,
  completePairing,
  authenticateExtension,
  listPairings,
  revokePairingById,
  revokePairingByBearer,
  PairingError,
} from '../services/extensionPairing.service.js';
import { snoozeNudge } from '../services/pfNudges.service.js';
import { enterUserContext } from '../lib/requestContext.js';
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

const SnoozeNudgeSchema = z.object({
  days: z.number().int().min(1).max(365).default(30),
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

export async function snoozeNudgeHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const { id } = req.params as { id: string };
  const parsed = SnoozeNudgeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return error(res, 400, parsed.error.issues.map((i) => i.message).join('; '), 'VALIDATION_ERROR');
  }
  await snoozeNudge({ userId, accountId: id, days: parsed.data.days });
  ok(res, { snoozed: true });
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

// ===========================================================================
// EXTENSION PAIRING ENDPOINTS (Plan C)
// ===========================================================================

// ---------------------------------------------------------------------------
// Middleware: authenticate extension bearer token
// ---------------------------------------------------------------------------

/**
 * Express middleware that reads `Authorization: Bearer <token>`, looks up the
 * ExtensionPairing row via SHA-256(token), and attaches the userId to req.user.
 *
 * Note: populates req.user with a minimal shape {id, email: '', role, plan}
 * sufficient for the pf endpoints. Also calls enterUserContext so Prisma RLS
 * middleware receives the correct userId.
 */
export async function authenticateExtensionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.header('Authorization') ?? req.header('authorization');
    if (!header || !header.startsWith('Bearer ')) {
      error(res, 401, 'Missing or invalid Authorization header', 'UNAUTHORIZED');
      return;
    }
    const bearer = header.slice('Bearer '.length).trim();
    const pairing = await authenticateExtension(bearer);
    // Satisfy req.user type — extension bearer only needs userId
    req.user = {
      id: pairing.userId,
      email: '',
      role: 'INVESTOR',
      plan: 'FREE',
    };
    enterUserContext(pairing.userId);
    next();
  } catch (err) {
    if (err instanceof PairingError) {
      error(res, 401, err.message, err.code);
    } else {
      next(err);
    }
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * POST /epfppf/extension/pair-init  (requires normal JWT auth)
 * Generates an 8-char pairing code with 5-min TTL.
 */
export async function extensionPairInitHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { id, code, expiresAt } = await initPairing(userId);
  ok(res, { id, code, expiresAt: expiresAt.toISOString() });
}

/**
 * POST /epfppf/extension/pair-complete  (NO auth — extension-initiated)
 * Exchanges pairing code for a long-lived bearer token.
 */
export async function extensionPairCompleteHandler(req: Request, res: Response): Promise<void> {
  const schema = z.object({ code: z.string().min(1).max(12) });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    error(res, 400, 'code is required', 'VALIDATION_ERROR');
    return;
  }
  try {
    const { bearer, userId } = await completePairing(parsed.data.code.toUpperCase());
    ok(res, { bearer, userId });
  } catch (err) {
    if (err instanceof PairingError) {
      const statusMap: Record<string, number> = {
        INVALID_CODE: 404,
        EXPIRED: 410,
        ALREADY_PAIRED: 409,
        REVOKED: 403,
      };
      error(res, statusMap[err.code] ?? 400, err.message, err.code);
    } else {
      throw err;
    }
  }
}

/**
 * GET /epfppf/extension/me  (extension bearer auth)
 * Returns basic info for the paired user.
 */
export async function extensionMeHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  ok(res, { userId, paired: true });
}

/**
 * GET /epfppf/extension/pairings  (normal JWT auth)
 * Lists all pairings for the authenticated user (for the web UI).
 */
export async function extensionListPairingsHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const pairings = await listPairings(userId);
  // Strip bearerHash from API response — never expose the hash externally
  const safe = pairings.map(({ bearerHash: _bh, ...rest }) => rest);
  ok(res, safe);
}

/**
 * POST /epfppf/extension/raw-payload  (extension bearer auth)
 * Accepts a RawScrapePayload from the extension, runs the parse pipeline,
 * upserts CanonicalEvents, recomputes holdings, returns { sessionId, eventsCreated }.
 *
 * Note: Since the extension already scraped the data, we run the parse
 * synchronously in the HTTP request (no Bull queue needed). The adapter is
 * resolved by (institution, type) looked up from the account.
 */
export async function extensionRawPayloadHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;

  const schema = z.object({
    accountId: z.string().min(1),
    sessionId: z.string().optional(),
    payload: z.record(z.unknown()),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    error(res, 400, parsed.error.issues.map((i) => i.message).join('; '), 'VALIDATION_ERROR');
    return;
  }

  const { accountId, payload } = parsed.data;
  let { sessionId } = parsed.data;

  // Verify account ownership
  const account = await getPfAccountById(userId, accountId);
  if (!account) {
    error(res, 404, 'PF account not found', 'NOT_FOUND');
    return;
  }

  // Create or reuse a PfFetchSession
  if (!sessionId) {
    const session = await startSession({ userId, accountId: account.id, source: 'EXTENSION' });
    sessionId = session.id;
  }

  // Find the adapter for this account
  const adapter = findPfAdapter({ institution: account.institution, type: account.type });
  if (!adapter) {
    error(res, 422, `No adapter for ${account.institution}/${account.type}`, 'NO_ADAPTER');
    return;
  }

  // Parse the raw payload (extension already scraped; we just parse)
  let parseResult;
  try {
    parseResult = await adapter.parse(payload as unknown as Parameters<typeof adapter.parse>[0]);
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    logger.warn({ accountId, err: parseErr }, '[pf-ext] parse error');
    error(res, 422, `Parse failed: ${msg}`, 'PARSE_FAIL');
    return;
  }

  if (!parseResult.ok) {
    error(res, 422, parseResult.error, 'PARSE_FAIL');
    return;
  }

  // Decrypt identifier for canonical event source ref
  let identifierPlain: string;
  try {
    identifierPlain = await decryptIdentifier(account.identifierCipher.toString('base64'));
  } catch {
    identifierPlain = account.identifierLast4;
  }

  const adapterId =
    (payload as { adapterId?: string }).adapterId ?? `pf.${account.institution.toLowerCase()}.ext.v1`;
  const adapterVersion =
    (payload as { adapterVersion?: string }).adapterVersion ?? adapter.version;

  const built = buildCanonicalEvents({
    userId,
    account: {
      id: account.id,
      institution: account.institution,
      type: account.type,
      identifierPlain,
    },
    adapterId,
    adapterVersion,
    events: parseResult.events,
  });

  let eventsCreated = 0;
  await prisma.$transaction(async (tx) => {
    for (const e of built) {
      try {
        await tx.canonicalEvent.upsert({
          where: { userId_sourceHash: { userId: e.userId, sourceHash: e.sourceHash } },
          create: { ...e, eventType: e.eventType as CanonicalEventType, status: 'CONFIRMED' },
          update: {},
        });
        eventsCreated++;
      } catch {
        // P2002 unique — duplicate, skip
      }
    }
  });

  // Recompute holdings (non-fatal)
  if (account.portfolioId && account.assetKey) {
    try {
      await recomputeForAsset(account.portfolioId, account.assetKey);
    } catch (recomputeErr) {
      logger.warn({ portfolioId: account.portfolioId, assetKey: account.assetKey, err: recomputeErr }, '[pf-ext] holding recompute failed — non-fatal');
    }
  }

  // Update account metadata
  await prisma.providentFundAccount.update({
    where: { id: account.id },
    data: { lastRefreshedAt: new Date(), lastFetchSource: 'EXTENSION' },
  });

  // Mark session complete
  await prisma.pfFetchSession.update({
    where: { id: sessionId },
    data: { status: 'COMPLETED', completedAt: new Date(), eventsCreated },
  });

  ok(res, { sessionId, eventsCreated });
}

/**
 * POST /epfppf/extension/revoke  (extension bearer auth)
 * Extension calls this on uninstall / manual disconnect.
 */
export async function extensionRevokeHandler(req: Request, res: Response): Promise<void> {
  const header = req.header('Authorization') ?? req.header('authorization') ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (bearer) {
    await revokePairingByBearer(bearer);
  }
  ok(res, { revoked: true });
}

/**
 * DELETE /epfppf/extension/pairings/:id  (normal JWT auth)
 * User-initiated revoke from web UI.
 */
export async function extensionRevokePairingHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user!.id;
  const { id } = req.params as { id: string };
  try {
    await revokePairingById(userId, id);
    ok(res, { revoked: true });
  } catch (err) {
    if (err instanceof PairingError) {
      error(res, 404, err.message, err.code);
    } else {
      throw err;
    }
  }
}
