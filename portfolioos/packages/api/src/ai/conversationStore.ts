/**
 * AI Assistant — Prisma-backed conversation store.
 *
 * Keeps the last 50 rows per user. On insert, older rows beyond 50 are
 * deleted so the table never runs unbounded. The 50-row cap is a
 * balance between preserving useful context (Claude sees the last 10)
 * and keeping the row-per-user footprint tiny.
 */

import { prisma } from '../lib/prisma.js';
import type { HistoryMessage } from './claudeClient.js';

const HISTORY_LIMIT_TO_CLAUDE = 10;
const HARD_CAP_PER_USER = 50;

export async function getConversationHistory(
  userId: string,
  limit = HISTORY_LIMIT_TO_CLAUDE,
): Promise<HistoryMessage[]> {
  const rows = await prisma.aiConversation.findMany({
    where: { userId },
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
  role: 'user' | 'assistant';
  content: string;
  queryIntent?: string | null;
  contextSnapshot?: Record<string, unknown> | null;
  cardData?: Record<string, unknown> | null;
  familyId?: string | null;
}

export async function saveMessage(input: SaveMessageInput): Promise<void> {
  await prisma.aiConversation.create({
    data: {
      userId: input.userId,
      role: input.role === 'assistant' ? 'ASSISTANT' : 'USER',
      content: input.content,
      queryIntent: input.queryIntent ?? null,
      ...(input.contextSnapshot
        ? { contextSnapshot: input.contextSnapshot as object }
        : {}),
      ...(input.cardData ? { cardData: input.cardData as object } : {}),
      familyId: input.familyId ?? null,
    },
  });
  // Trim rows beyond HARD_CAP_PER_USER. Single tx keeps the count
  // bounded even under a burst.
  const excess = await prisma.aiConversation.count({ where: { userId: input.userId } });
  if (excess > HARD_CAP_PER_USER) {
    const oldest = await prisma.aiConversation.findMany({
      where: { userId: input.userId },
      orderBy: { createdAt: 'asc' },
      take: excess - HARD_CAP_PER_USER,
      select: { id: true },
    });
    if (oldest.length > 0) {
      await prisma.aiConversation.deleteMany({
        where: { id: { in: oldest.map((r) => r.id) } },
      });
    }
  }
}

export async function clearConversation(userId: string): Promise<void> {
  await prisma.aiConversation.deleteMany({ where: { userId } });
}

export interface ConversationRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  cardData: Record<string, unknown> | null;
  createdAt: string;
}

export async function listRecentMessages(
  userId: string,
  limit = 20,
): Promise<ConversationRow[]> {
  const rows = await prisma.aiConversation.findMany({
    where: { userId },
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
    }));
}
