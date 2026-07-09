/**
 * AI Assistant HTTP surface — mounted at /api/assistant.
 *
 * GET    /sessions                    — list this user's chat sessions.
 * POST   /sessions                    — create a new (empty) chat session.
 * PATCH  /sessions/:sessionId         — rename a chat session.
 * DELETE /sessions/:sessionId         — delete a chat session + its messages.
 * GET    /sessions/:sessionId/history — messages in one session.
 * POST   /chat                        — SSE streaming Claude response, within a session.
 * GET    /suggested                   — 4 contextually-relevant question suggestions.
 * GET    /quota                       — remaining daily quota (drives the input UI).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { created, noContent, ok } from '../lib/response.js';
import { UnauthorizedError } from '../lib/errors.js';
import { env } from '../config/env.js';
import { classifyQuery } from '../ai/queryClassifier.js';
import { buildContext } from '../ai/contextBuilder.js';
import {
  streamAssistantResponse,
  parseResponseForCard,
  type HistoryMessage,
} from '../ai/claudeClient.js';
import {
  getConversationHistory,
  hasUsedLockedPreview,
  listSessionMessages,
  saveMessage,
} from '../ai/conversationStore.js';
import {
  assertSessionOwnership,
  createSession,
  deleteSession,
  listSessions,
  renameSession,
  touchSession,
} from '../ai/chatSessions.js';
import { checkQuota, incrementUsage } from '../ai/rateLimit.js';
import { computeSuggestedQuestions } from '../ai/suggestedQuestions.js';
import { parseFamilyId } from '../lib/familyHeader.js';

export const aiAssistantRouter = Router();

// Preflight to feature flag. When disabled, the router mounts but every
// endpoint 404s so a solo deploy without ANTHROPIC_API_KEY can silently
// keep the frontend widget hidden.
aiAssistantRouter.use((req, res, next) => {
  if (env.ANTHROPIC_API_KEY && env.ENABLE_LLM_INSIGHTS !== 'false') {
    next();
    return;
  }
  res.status(404).json({ success: false, error: 'ai_assistant_disabled' });
});

aiAssistantRouter.use(authenticate);
// No router-level plan gate: /quota, /suggested, /sessions and session
// history must stay reachable for FREE users so the panel can render
// the full interactive experience (teaser prompts, session list, a real
// "send" that appears to generate a response) before revealing it's
// locked. Only /chat — the endpoint that actually costs money — is
// gated, via checkQuota's tier_locked branch below (dailyLimitFor
// ('FREE') = 0 in rateLimit.ts). The frontend never calls /chat for a
// locked user in the first place (see useAIAssistant's sendMessage),
// but this is the defense-in-depth backstop.

function callerId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  sessionId: z.string().min(1),
});

const renameSchema = z.object({
  title: z.string().min(1).max(200),
});

aiAssistantRouter.get(
  '/quota',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = callerId(req);
    const quota = await checkQuota(userId);
    // Only worth the extra query when it's actually relevant — a paid
    // user's quota response doesn't need it.
    const previewUsed = quota.reason === 'tier_locked' ? await hasUsedLockedPreview(userId) : false;
    ok(res, { ...quota, previewUsed });
  }),
);

aiAssistantRouter.get(
  '/sessions',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await listSessions(callerId(req)));
  }),
);

aiAssistantRouter.post(
  '/sessions',
  asyncHandler(async (req: Request, res: Response) => {
    const session = await createSession(callerId(req), parseFamilyId(req) ?? null);
    created(res, session);
  }),
);

aiAssistantRouter.patch(
  '/sessions/:sessionId',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = renameSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message });
      return;
    }
    const session = await renameSession(
      callerId(req),
      req.params.sessionId as string,
      parsed.data.title,
    );
    ok(res, session);
  }),
);

aiAssistantRouter.delete(
  '/sessions/:sessionId',
  asyncHandler(async (req: Request, res: Response) => {
    await deleteSession(callerId(req), req.params.sessionId as string);
    noContent(res);
  }),
);

aiAssistantRouter.get(
  '/sessions/:sessionId/history',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = callerId(req);
    const sessionId = req.params.sessionId as string;
    await assertSessionOwnership(userId, sessionId);
    ok(res, await listSessionMessages(sessionId));
  }),
);

aiAssistantRouter.get(
  '/suggested',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await computeSuggestedQuestions(callerId(req)));
  }),
);

aiAssistantRouter.post('/chat', async (req: Request, res: Response) => {
  try {
    if (!req.user) throw new UnauthorizedError();
    const userId = req.user.id;
    const familyId = parseFamilyId(req) ?? null;
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.message });
      return;
    }
    const { message, sessionId } = parsed.data;
    await assertSessionOwnership(userId, sessionId);

    const quota = await checkQuota(userId);
    if (!quota.allowed) {
      if (quota.reason === 'tier_locked') {
        // FREE tier gets exactly one real (but unbilled) preview, ever —
        // enforced here server-side via hasUsedLockedPreview, not just the
        // frontend's localStorage flag, so it can't be dodged by clearing
        // storage, using a different browser, or a fresh login. Persist the
        // real user message + a synthetic empty ASSISTANT row marked
        // `locked`, with no Claude call and no usage increment, so on
        // reload the exchange is still there — rendered as a blurred
        // "upgrade to unlock" placeholder from the persisted flag, not a
        // client-only simulation.
        if (await hasUsedLockedPreview(userId)) {
          res.status(403).json({
            success: false,
            error: 'tier_locked',
            message: 'The AI Assistant requires a paid plan. Upgrade to unlock.',
            used: quota.used,
            limit: quota.limit,
            resetsAt: quota.resetsAt,
          });
          return;
        }

        const classified = classifyQuery(message);
        await saveMessage({
          userId,
          sessionId,
          role: 'user',
          content: message,
          queryIntent: classified.intent,
          familyId,
        });
        await touchSession(sessionId, message);
        await saveMessage({
          userId,
          sessionId,
          role: 'assistant',
          content: '',
          queryIntent: classified.intent,
          familyId,
          locked: true,
        });
        await touchSession(sessionId);

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();
        res.write(`data: ${JSON.stringify({ type: 'locked' })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        res.end();
        return;
      }
      res.status(429).json({
        success: false,
        error: quota.reason,
        message: `You've hit the daily limit of ${quota.limit} questions. Resets tomorrow.`,
        used: quota.used,
        limit: quota.limit,
        resetsAt: quota.resetsAt,
      });
      return;
    }

    // Persist the user's turn BEFORE calling Claude so we always have a
    // record even if Claude errors mid-stream.
    const classified = classifyQuery(message);
    const context = await buildContext(userId, familyId, classified);
    const history: HistoryMessage[] = await getConversationHistory(sessionId, 10);

    await saveMessage({
      userId,
      sessionId,
      role: 'user',
      content: message,
      queryIntent: classified.intent,
      familyId,
    });
    // Sets the session's title from this message the first time it has
    // one (still "New chat" otherwise) and bumps sort order.
    await touchSession(sessionId, message);

    // SSE headers.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (payload: Record<string, unknown>): void => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    let fullResponse = '';
    try {
      for await (const chunk of streamAssistantResponse(
        userId,
        message,
        context,
        history,
        async (result) => {
          const { cleanText, card } = parseResponseForCard(result.fullText);
          await saveMessage({
            userId,
            sessionId,
            role: 'assistant',
            content: cleanText,
            queryIntent: classified.intent,
            contextSnapshot: context as unknown as Record<string, unknown>,
            cardData: card as unknown as Record<string, unknown> | null,
            familyId,
          });
          await touchSession(sessionId);
          await incrementUsage(userId);
          if (card) {
            send({ type: 'card', data: card });
          }
        },
      )) {
        fullResponse += chunk;
        send({ type: 'token', content: chunk });
      }
      send({ type: 'done' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'stream_error';
      send({ type: 'error', message });
    } finally {
      res.end();
    }
    void fullResponse;
  } catch (err) {
    if (!res.headersSent) {
      const message = err instanceof Error ? err.message : 'assistant_error';
      res.status(500).json({ success: false, error: message });
    } else {
      res.end();
    }
  }
});
