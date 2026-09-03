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
  /**
   * True while executing inside `runInTransaction`, which has already issued
   * `set_config` on the caller's transaction.
   *
   * The RLS hook uses this to run the query inline instead of opening a
   * transaction of its own. Without it, a write inside a caller's
   * `$transaction` was re-dispatched onto a SEPARATE connection and therefore
   * escaped the caller's rollback — silently, so multi-row writes that read as
   * atomic were not.
   */
  inTransaction?: boolean;
}

/**
 * Stash the AsyncLocalStorage on globalThis so every module graph that imports
 * this file observes the same instance. The PrismaClient in `lib/prisma.ts` is
 * cached on globalThis too — its `$extends` hook closures over whichever
 * `userContext` was loaded first. Without this shim, vitest's per-file module
 * isolation creates a fresh ALS per test file while the Prisma hook still
 * reads from the first file's ALS, so `runAsUser` in later files silently
 * fails to propagate context into queries.
 */
const globalForUserContext = globalThis as unknown as {
  __portfolioos_userContext?: AsyncLocalStorage<RequestContext>;
};

export const userContext: AsyncLocalStorage<RequestContext> =
  globalForUserContext.__portfolioos_userContext ??
  new AsyncLocalStorage<RequestContext>();

globalForUserContext.__portfolioos_userContext = userContext;

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
 *
 * We internally `await fn()` inside the `.run` callback rather than just
 * returning its promise. With a non-async `fn` (e.g. `() => prisma.x.y(...)`)
 * Prisma returns a deferred PrismaPromise synchronously; `.run` then exits
 * the store before the promise's continuation — and the $allOperations hook
 * — is scheduled, so `getCurrentUserId()` / `isSystemContext()` see nothing.
 * The `await` here keeps the store active across the microtask boundary.
 */
export function runAsUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return userContext.run({ userId }, async () => await fn());
}

/**
 * Break-glass: explicitly bypass RLS for cross-tenant system work (price
 * refresh, scheduler scans). Only call from code paths that legitimately
 * need to see every user's rows — never from HTTP request handlers.
 */
export function runAsSystem<T>(fn: () => Promise<T>): Promise<T> {
  return userContext.run({ userId: '__system__', isSystem: true }, async () => await fn());
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

/** True while inside `runInTransaction` — the session variable is already set. */
export function isInTransaction(): boolean {
  return userContext.getStore()?.inTransaction === true;
}

/**
 * Mark the current context as inside a transaction whose session variable has
 * already been set. Internal to lib/prisma.ts's `runInTransaction`; nothing
 * else should call it, because claiming the variable is set when it is not
 * would make every query inside fail closed.
 */
export function runWithTransactionFlag<T>(fn: () => Promise<T>): Promise<T> {
  const store = userContext.getStore();
  if (!store) return fn();
  return userContext.run({ ...store, inTransaction: true }, async () => await fn());
}
