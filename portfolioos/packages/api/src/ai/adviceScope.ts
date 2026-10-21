/**
 * Who receives personal advice from the assistant. Today everyone ('ALL', the
 * user's decision of 2026-10-19); 'AGREEMENT' is reserved for the later gate
 * that limits advice to clients under a signed advisory agreement. Stored in
 * AppSetting `ai.advice_scope`; anything unreadable means today's behaviour.
 */
import { prisma } from '../lib/prisma.js';

export type AdviceScope = 'ALL' | 'AGREEMENT';

export function resolveAdviceScope(value: unknown): AdviceScope {
  return value === 'AGREEMENT' ? 'AGREEMENT' : 'ALL';
}

export async function getAdviceScope(): Promise<AdviceScope> {
  const row = await prisma.appSetting.findUnique({ where: { key: 'ai.advice_scope' } });
  return resolveAdviceScope(row?.value);
}
