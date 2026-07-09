/**
 * AI Assistant — Prisma-backed conversation store, scoped per chat
 * session (see chatSessions.ts for session CRUD).
 *
 * Keeps the last 100 rows per session. On insert, older rows beyond
 * that are deleted so no single session's row count runs unbounded —
 * scoped per-session (not per-user) so one long-running chat can't
 * starve a user's other sessions of their own history.
 */

import { prisma } from '../lib/prisma.js';
import type { HistoryMessage } from './claudeClient.js';

const HISTORY_LIMIT_TO_CLAUDE = 10;
const HARD_CAP_PER_SESSION = 100;

export async function getConversationHistory(
  sessionId: string,
  limit = HISTORY_LIMIT_TO_CLAUDE,
): Promise<HistoryMessage[]> {
  const rows = await prisma.aiConversation.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows
    .reverse()
    .map((r) => ({
      role: r.role === 'ASSISTANT' ? 'assistant' : ('user' as 'user' | 'assistant'),
      content: r.content,
    }));
}

export interface SaveMessageInput {
  userId: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  queryIntent?: string | null;
  contextSnapshot?: Record<string, unknown> | null;
  cardData?: Record<string, unknown> | null;
  familyId?: string | null;
  /** True only for the synthetic ASSISTANT row of a FREE-tier one-time preview. */
  locked?: boolean;
}

export async function saveMessage(input: SaveMessageInput): Promise<void> {
  await prisma.aiConversation.create({
    data: {
      userId: input.userId,
      sessionId: input.sessionId,
      role: input.role === 'assistant' ? 'ASSISTANT' : 'USER',
      content: input.content,
      queryIntent: input.queryIntent ?? null,
      ...(input.contextSnapshot
        ? { contextSnapshot: input.contextSnapshot as object }
        : {}),
      ...(input.cardData ? { cardData: input.cardData as object } : {}),
      familyId: input.familyId ?? null,
      locked: input.locked ?? false,
    },
  });
  // Trim rows beyond HARD_CAP_PER_SESSION. Single tx keeps the count
  // bounded even under a burst.
  const excess = await prisma.aiConversation.count({ where: { sessionId: input.sessionId } });
  if (excess > HARD_CAP_PER_SESSION) {
    const oldest = await prisma.aiConversation.findMany({
      where: { sessionId: input.sessionId },
      orderBy: { createdAt: 'asc' },
      take: excess - HARD_CAP_PER_SESSION,
      select: { id: true },
    });
    if (oldest.length > 0) {
      await prisma.aiConversation.deleteMany({
        where: { id: { in: oldest.map((r) => r.id) } },
      });
    }
  }
}

export interface ConversationRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  cardData: Record<string, unknown> | null;
  createdAt: string;
  locked: boolean;
}

export async function listSessionMessages(
  sessionId: string,
  limit = 100,
): Promise<ConversationRow[]> {
  const rows = await prisma.aiConversation.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows
    .reverse()
    .map((r) => ({
      id: r.id,
      role: r.role === 'ASSISTANT' ? 'assistant' : 'user',
      content: r.content,
      cardData: (r.cardData as Record<string, unknown> | null) ?? null,
      createdAt: r.createdAt.toISOString(),
      locked: r.locked,
    }));
}

/**
 * Whether this user has ever received the synthetic locked-preview
 * assistant row, anywhere across any of their sessions. This — not a
 * client localStorage flag — is the authoritative source of "has this
 * FREE user already used their one-time preview": it survives a
 * refresh, a relogin, or switching devices.
 */
export async function hasUsedLockedPreview(userId: string): Promise<boolean> {
  const row = await prisma.aiConversation.findFirst({
    where: { userId, locked: true },
    select: { id: true },
  });
  return row != null;
}
