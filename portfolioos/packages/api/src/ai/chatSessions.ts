/**
 * AI Assistant — chat sessions (ChatGPT-style: many threads per user,
 * switchable, deletable). A session is just a grouping of AiConversation
 * rows; the actual message CRUD stays in conversationStore.ts.
 */

import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/errors.js';

const DEFAULT_TITLE = 'New chat';
const TITLE_MAX_LEN = 60;

export interface ChatSessionSummary {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
}

export async function listSessions(userId: string): Promise<ChatSessionSummary[]> {
  const rows = await prisma.aiChatSession.findMany({
    where: { userId },
    orderBy: { lastMessageAt: 'desc' },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    createdAt: r.createdAt.toISOString(),
    lastMessageAt: r.lastMessageAt.toISOString(),
  }));
}

export async function createSession(
  userId: string,
  familyId: string | null,
): Promise<ChatSessionSummary> {
  const r = await prisma.aiChatSession.create({
    data: { userId, familyId, title: DEFAULT_TITLE },
  });
  return {
    id: r.id,
    title: r.title,
    createdAt: r.createdAt.toISOString(),
    lastMessageAt: r.lastMessageAt.toISOString(),
  };
}

/** Throws NotFoundError if the session doesn't exist or belongs to another user — same 404 either way so session IDs can't be enumerated. */
export async function assertSessionOwnership(userId: string, sessionId: string): Promise<void> {
  const session = await prisma.aiChatSession.findUnique({ where: { id: sessionId } });
  if (!session || session.userId !== userId) throw new NotFoundError('Chat session not found');
}

export async function deleteSession(userId: string, sessionId: string): Promise<void> {
  await assertSessionOwnership(userId, sessionId);
  await prisma.aiChatSession.delete({ where: { id: sessionId } });
}

export async function renameSession(
  userId: string,
  sessionId: string,
  title: string,
): Promise<ChatSessionSummary> {
  await assertSessionOwnership(userId, sessionId);
  const trimmed = truncateTitle(title) || DEFAULT_TITLE;
  const r = await prisma.aiChatSession.update({
    where: { id: sessionId },
    data: { title: trimmed },
  });
  return {
    id: r.id,
    title: r.title,
    createdAt: r.createdAt.toISOString(),
    lastMessageAt: r.lastMessageAt.toISOString(),
  };
}

/**
 * Bumps lastMessageAt (for sort order) and, the first time a session
 * gets a real user message, sets its title from that message instead of
 * the "New chat" placeholder — mirrors ChatGPT's behavior without a
 * second LLM call just to name the thread.
 */
export async function touchSession(sessionId: string, firstUserMessage?: string): Promise<void> {
  const session = await prisma.aiChatSession.findUnique({
    where: { id: sessionId },
    select: { title: true },
  });
  const shouldSetTitle = firstUserMessage && session?.title === DEFAULT_TITLE;
  await prisma.aiChatSession.update({
    where: { id: sessionId },
    data: {
      lastMessageAt: new Date(),
      ...(shouldSetTitle
        ? { title: truncateTitle(firstUserMessage) }
        : {}),
    },
  });
}

function truncateTitle(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= TITLE_MAX_LEN) return trimmed;
  return trimmed.slice(0, TITLE_MAX_LEN - 1).trimEnd() + '…';
}
