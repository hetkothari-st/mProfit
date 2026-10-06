/**
 * A per-user counter that moves whenever that user's financial data is
 * written — bumped by the Prisma hook in prisma.ts. Anything cached about a
 * user's finances (the AI adviser's facts) keys itself to this, so a new
 * transaction, loan, bank balance or policy is seen on the very next read
 * instead of after a cache timeout.
 *
 * In-process on purpose: no extra service, and a write on another instance is
 * still caught by the cache's own time limit.
 */

const WRITE_OPERATIONS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

/**
 * User-scoped tables whose writes are bookkeeping, not finances. Several are
 * written on every chat turn (the conversation, usage, spend, the health-score
 * snapshot the facts themselves refresh), so counting them would empty the
 * cache on every message.
 */
const BOOKKEEPING_MODELS = new Set([
  'AiConversation',
  'AiUsage',
  'AiChatSession',
  'LlmSpend',
  'AuditLog',
  'CaAuditLog',
  'HealthScoreSnapshot',
  'NetWorthSnapshot',
  'PortfolioInsight',
  'AdvisorRun',
  'GmailScanJob',
  'MailboxAccount',
  'MFCentralSyncJob',
  'MFCasMailbackJob',
  'PfFetchSession',
  'ExtensionPairing',
  'UserNotificationConfig',
]);

const versions = new Map<string, number>();
let everyone = 0;

/** Whether a write to this (user-scoped) model changes the user's finances. */
export function shouldMarkUserData(model: string, operation: string): boolean {
  return WRITE_OPERATIONS.has(operation) && !BOOKKEEPING_MODELS.has(model);
}

/** Record a change to a user's data; `null` (no known user) means everyone. */
export function markUserDataChanged(userId: string | null): void {
  if (userId === null) {
    everyone += 1;
    return;
  }
  versions.set(userId, (versions.get(userId) ?? 0) + 1);
}

/** A version string for these users' data — changes when any of it does. */
export function userDataVersion(userIds: readonly string[]): string {
  return `${everyone}:${userIds.map((id) => `${id}=${versions.get(id) ?? 0}`).join(',')}`;
}
