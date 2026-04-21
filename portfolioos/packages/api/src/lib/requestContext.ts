import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request ambient context. The auth middleware calls `userContext.run`
 * around `next()`; downstream Prisma queries read the current userId from
 * this store and issue `SELECT set_config('app.current_user_id', $1, true)`
 * before each user-scoped query so Postgres RLS policies (§3.6, §5.1 task 11)
 * can enforce tenant isolation.
 *
 * AsyncLocalStorage survives across async/await and promise chains, so the
 * context established in middleware remains visible inside Prisma callbacks
 * without threading userId through every service signature.
 */
export interface RequestContext {
  /** Authenticated user id, or the sentinel `__system__` for break-glass jobs. */
  userId: string;
  /** When true, Prisma sets `app.bypass_rls = on` instead of `app.current_user_id`. */
  isSystem?: boolean;
}

export const userContext = new AsyncLocalStorage<RequestContext>();

export function getCurrentUserId(): string | null {
  const store = userContext.getStore();
  if (!store || store.isSystem) return null;
  return store.userId;
}

export function isSystemContext(): boolean {
  return userContext.getStore()?.isSystem === true;
}

/**
 * Bull-job and startup-sync paths need to explicitly opt in to a user
 * context before touching user-scoped tables. Wrap those entry points in
 * `runAsUser(userId, async () => { ... })`.
 */
export function runAsUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return userContext.run({ userId }, fn);
}

/**
 * Break-glass: explicitly bypass RLS for cross-tenant system work (price
 * refresh, scheduler scans). Only call from code paths that legitimately
 * need to see every user's rows — never from HTTP request handlers.
 */
export function runAsSystem<T>(fn: () => Promise<T>): Promise<T> {
  return userContext.run({ userId: '__system__', isSystem: true }, fn);
}

/**
 * Set ambient context for the remainder of the current async scope without a
 * callback boundary. Useful in test `beforeEach`/`beforeAll` hooks where
 * wrapping every assertion in a callback would be invasive. Do NOT use this
 * in request-scoped code — prefer `userContext.run` so context cannot leak
 * between requests on a shared event loop.
 */
export function enterUserContext(userId: string): void {
  userContext.enterWith({ userId });
}

export function enterSystemContext(): void {
  userContext.enterWith({ userId: '__system__', isSystem: true });
}
