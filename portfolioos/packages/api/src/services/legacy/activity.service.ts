import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { runAsSystem } from '../../lib/requestContext.js';

export const ACTIVITY_THROTTLE_MS = 60 * 60 * 1000;

/**
 * Record real owner activity for Legacy Transfer. One conditional UPDATE, so
 * it's cheap enough to call on every authenticated request: the WHERE clause
 * makes it a no-op inside the throttle window. Only the owner's own session
 * may call this — never system jobs, never an X-Act-As manager.
 */
export async function touchActivity(userId: string, now: Date = new Date()): Promise<boolean> {
  const cutoff = new Date(now.getTime() - ACTIVITY_THROTTLE_MS);
  const res = await runAsSystem(() =>
    prisma.user.updateMany({
      where: { id: userId, OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: cutoff } }] },
      data: { lastActiveAt: now },
    }),
  );
  return res.count === 1;
}

/** Fire-and-forget wrapper for request paths: a failed write must not fail the request. */
export function touchActivitySoon(userId: string): void {
  touchActivity(userId).catch((err: unknown) => {
    // Request path: the request itself must succeed; a missed touch is retried on the next request.
    logger.error({ err: err instanceof Error ? err.message : String(err), userId }, '[legacy] touchActivity failed');
  });
}
