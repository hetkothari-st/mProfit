import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import {
  getCurrentUserId,
  isSystemContext,
  isInTransaction,
  runWithTransactionFlag,
} from './requestContext.js';

const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
  basePrisma: PrismaClient | undefined;
};

/**
 * Models whose rows carry (directly or transitively) a userId. For these we
 * wrap each top-level query in a transaction and issue
 *   SELECT set_config('app.current_user_id', $ctx.userId, true)
 * so the Postgres RLS policy from migration 20260421140000_phase_4_5_rls
 * has a session variable to match against. Reference tables (StockMaster,
 * MFNav, FXRate, …) are excluded — they're shared market data.
 */
export const USER_SCOPED_MODELS: ReadonlySet<string> = new Set([
  'Portfolio',
  'Transaction',
  'Holding',
  'HoldingProjection',
  'CapitalGain',
  'CashFlow',
  'ImportJob',
  'Alert',
  'Account',
  'Voucher',
  'VoucherEntry',
  'CanonicalEvent',
  'MonitoredSender',
  'LearnedTemplate',
  'IngestionFailure',
  'Vehicle',
  'Challan',
  'RentalProperty',
  'Tenancy',
  'RentReceipt',
  'PropertyExpense',
  'InsurancePolicy',
  'PremiumPayment',
  'InsuranceClaim',
  'AuditLog',
  'LlmSpend',
  'MFCentralSyncJob',
  'MFCasMailbackJob',
  // Family / HOF hierarchical feature. Family rows are visible only to
  // members of that family; FamilyMember rows to self + OWNERs in the
  // same family; FamilyInvitation rows to the inviter (invitee resolves
  // via the emailed token on a public endpoint, not through RLS).
  'Family',
  'FamilyMember',
  'FamilyInvitation',
  // AI Assistant — conversation history + daily usage counter.
  'AiConversation',
  'AiUsage',
  // Sec 55(2)(ac) grandfathering — user-entered FMV overrides. SystemFmvSeed
  // is deliberately excluded: it's shared reference data, not user-scoped.
  'FmvOverride',
  // Net-worth history — one row per user per day.
  'NetWorthSnapshot',
  // Advisor engine (/advisor). Each of these also has an RLS policy in
  // 20260902120000_advisor_engine — the two halves must stay paired, or the
  // policy matches nothing because app.current_user_id is never set.
  'RiskProfileAssessment',
  'ModelPortfolio',
  'ModelPortfolioVersion',
  'AdvisorApprovedProduct',
  'AdvisorRun',
  'AdvisorRecommendation',
  // Provident fund auto-fetch. 20260506120000_pf_autofetch_foundation puts
  // ENABLE + FORCE ROW LEVEL SECURITY on all three of these tables, so every
  // read and write — including `runAsSystem` setup and the pfFetchWorker —
  // needs `app.current_user_id` / `app.bypass_rls` set. Without the entries
  // below the hook skips them, no session variable is issued, and Postgres
  // rejects inserts with 42501 ("new row violates row-level security policy")
  // and returns zero rows on reads. EpfMemberId has no `userId` of its own;
  // its policy joins back through ProvidentFundAccount.
  'ProvidentFundAccount',
  'EpfMemberId',
  'PfFetchSession',
  // Financial goals and bank accounts. Both carry ENABLE + FORCE ROW LEVEL
  // SECURITY (20260421140000_phase_4_5_rls) but were never listed here, so no
  // session variable was ever issued for them: under the NOBYPASSRLS runtime
  // role every Goal/BankAccount read returned zero rows and every write failed
  // with 42501, exactly the failure documented for the PF tables above.
  // Surfaced by the family aggregates, which read both across members.
  'Goal',
  'BankAccount',
  // The remaining RLS-protected tables. Same defect as Goal/BankAccount above:
  // a policy on the table, no entry here, therefore no set_config, therefore
  // zero rows read and 42501 on write under the NOBYPASSRLS runtime role.
  //
  // Six of these are written inside a caller's $transaction — LrsRemittance,
  // OwnedProperty, PortfolioGroup, PortfolioGroupMember, RentReminder,
  // TcsCredit. Registering them was unsafe until runInTransaction landed,
  // because the hook re-dispatched each write onto its own connection and it
  // escaped the caller's rollback. Those call sites now use runInTransaction,
  // so the writes stay inside the caller's transaction and this is safe.
  // See test/invariants/transaction-atomicity.test.ts.
  'AaConsent',
  'BankBalanceSnapshot',
  'BrokerCredential',
  'DerivativePosition',
  'Document',
  'ExpiryCloseJob',
  'ExtensionPairing',
  'ForexBalance',
  'LrsRemittance',
  'MarginSnapshot',
  'OwnedProperty',
  'PendingFamilyInvite',
  'PortfolioGroup',
  'PortfolioGroupMember',
  'PortfolioInsight',
  'PortfolioSetting',
  'RentReminder',
  'TcsCredit',
  'UserNotificationConfig',
]);

const basePrisma =
  globalForPrisma.basePrisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['warn', 'error'],
    // Prisma's defaults for an interactive `$transaction` are maxWait 2s /
    // timeout 5s. That is incoherent with the RLS hook below, which re-issues
    // every user-scoped query inside its *own* transaction with maxWait 15s:
    // a caller-level `prisma.$transaction(async tx => { tx.transaction.create(…) })`
    // could sit for up to 15s waiting on a pool slot for the inner call while
    // the outer transaction expired at 5s, surfacing as
    // "Transaction not found. Transaction ID is invalid, refers to an old
    // closed transaction". Give outer transactions at least the headroom the
    // inner ones are allowed to consume.
    transactionOptions: { maxWait: 15_000, timeout: 30_000 },
  });

if (env.NODE_ENV !== 'production') globalForPrisma.basePrisma = basePrisma;

/**
 * Extended client with an $allOperations hook that injects the session
 * variable before each user-scoped query. When no ambient user context is
 * set (unauthenticated endpoints, boot-time jobs) the hook is a no-op and
 * the policy's USING clause drops all rows — so forgetting to set context
 * fails closed rather than leaking data.
 *
 * Each wrapped call opens a short interactive transaction so `set_config`
 * with `is_local = true` scopes to this query only and cannot leak across
 * pool checkouts. The cost is one extra round-trip per user-scoped query;
 * acceptable for the defense-in-depth guarantee.
 */
const extended = basePrisma.$extends({
  query: {
    $allOperations: async ({ model, operation, args, query }) => {
      if (!model || !USER_SCOPED_MODELS.has(model)) {
        return query(args);
      }
      // Already inside runInTransaction: `set_config` has been issued on THAT
      // transaction and, being transaction-local, applies to this query too.
      // Opening another transaction here would put the write on a different
      // connection, where the caller's rollback cannot reach it — which is
      // exactly how caller-level $transaction blocks silently stopped being
      // atomic for user-scoped models.
      if (isInTransaction()) {
        return query(args);
      }
      const userId = getCurrentUserId();
      const system = isSystemContext();
      if (!userId && !system) {
        // No ambient context → fall through to Prisma. RLS policies will
        // see `app.current_user_id` unset, evaluate `NULL = <row.userId>`
        // to NULL, and return zero rows. Write paths get "no rows returned"
        // / constraint errors. This is the fail-closed guarantee.
        return query(args);
      }
      // Neon serverless can stall briefly on cold pool checkouts. Default
      // `$transaction` waits 2s for a slot and 5s for tx execution — too
      // tight for Neon free-tier under concurrent page loads. Bump both.
      return await basePrisma.$transaction(
        async (tx) => {
          if (system) {
            await tx.$executeRaw(
              Prisma.sql`SELECT set_config('app.bypass_rls', 'on', true)`,
            );
          } else {
            await tx.$executeRaw(
              Prisma.sql`SELECT set_config('app.current_user_id', ${userId}, true)`,
            );
          }
          // Re-dispatch the operation onto the transaction client. Prisma's
          // delegate interfaces are structurally identical on `tx`, but not
          // typed generically — cast to `any` locally for the reflective
          // invocation.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const delegate = (tx as any)[modelToDelegate(model)];
          return delegate[operation](args);
        },
        { maxWait: 15_000, timeout: 30_000 },
      );
    },
  },
});

export type ExtendedPrismaClient = typeof extended;

export const prisma: ExtendedPrismaClient =
  globalForPrisma.prisma ?? extended;

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Prisma delegate names are camelCase (e.g. `capitalGain`) while model names
 * used by $allOperations are PascalCase (`CapitalGain`). Convert.
 */
function modelToDelegate(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/**
 * Run `fn` inside ONE transaction that carries the RLS session variable.
 *
 * Use this instead of `prisma.$transaction` anywhere the body touches a
 * user-scoped model. `prisma.$transaction` alone is not atomic for those
 * models: the $allOperations hook re-dispatches each operation onto its own
 * transaction on another connection, so the writes survive a rollback of the
 * outer block. Proven in test/invariants/transaction-atomicity.test.ts.
 *
 * Here the session variable is set once, up front, on the transaction the
 * callback actually uses; the hook then sees `inTransaction` and runs each
 * query inline on that same transaction. One connection, one transaction,
 * real atomicity, and RLS still enforced.
 */
export async function runInTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  opts: { maxWait?: number; timeout?: number } = {},
): Promise<T> {
  const userId = getCurrentUserId();
  const system = isSystemContext();

  return basePrisma.$transaction(
    async (tx) => {
      if (system) {
        await tx.$executeRaw(Prisma.sql`SELECT set_config('app.bypass_rls', 'on', true)`);
      } else if (userId) {
        await tx.$executeRaw(
          Prisma.sql`SELECT set_config('app.current_user_id', ${userId}, true)`,
        );
      }
      // No ambient context: deliberately set nothing. RLS then filters
      // everything out, which is the same fail-closed behaviour the hook has.
      return runWithTransactionFlag(() => fn(tx));
    },
    { maxWait: opts.maxWait ?? 15_000, timeout: opts.timeout ?? 30_000 },
  );
}
