/**
 * AI Assistant HTTP surface — mounted at /api/assistant.
 *
 * POST /chat      — SSE streaming Claude response.
 * GET  /history   — last 20 messages.
 * DELETE /history — clear conversation.
 * GET  /suggested — 4 contextually-relevant question suggestions.
 * GET  /quota     — remaining daily quota (drives the input UI).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler } from '../middleware/validate.js';
import { noContent, ok } from '../lib/response.js';
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
  clearConversation,
  getConversationHistory,
  listRecentMessages,
  saveMessage,
} from '../ai/conversationStore.js';
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
// No router-level plan gate: /quota, /suggested and /history must stay
// reachable for FREE users so the panel can render the full interactive
// experience (teaser prompts, a real "send" that appears to generate a
// response) before revealing it's locked. Only /chat — the endpoint that
// actually costs money — is gated, via checkQuota's tier_locked branch
// below (dailyLimitFor('FREE') = 0 in rateLimit.ts). The frontend never
// calls /chat for a locked user in the first place (see useAIAssistant's
// sendMessage), but this is the defense-in-depth backstop.

function callerId(req: Request): string {
  if (!req.user) throw new UnauthorizedError();
  return req.user.id;
}

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
});

aiAssistantRouter.get(
  '/quota',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await checkQuota(callerId(req)));
  }),
);

aiAssistantRouter.get(
  '/history',
  asyncHandler(async (req: Request, res: Response) => {
    ok(res, await listRecentMessages(callerId(req)));
  }),
);

aiAssistantRouter.delete(
  '/history',
  asyncHandler(async (req: Request, res: Response) => {
    await clearConversation(callerId(req));
    noContent(res);
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
    const { message } = parsed.data;

    const quota = await checkQuota(userId);
    if (!quota.allowed) {
      const status = quota.reason === 'tier_locked' ? 403 : 429;
      res.status(status).json({
        success: false,
        error: quota.reason,
        message:
          quota.reason === 'tier_locked'
            ? 'The AI Assistant requires a paid plan. Upgrade to unlock.'
            : `You've hit the daily limit of ${quota.limit} questions. Resets tomorrow.`,
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
    const history: HistoryMessage[] = await getConversationHistory(userId, 10);

    await saveMessage({
      userId,
      role: 'user',
      content: message,
      queryIntent: classified.intent,
      familyId,
    });

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
            role: 'assistant',
            content: cleanText,
            queryIntent: classified.intent,
            contextSnapshot: context as unknown as Record<string, unknown>,
            cardData: card as unknown as Record<string, unknown> | null,
            familyId,
          });
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
