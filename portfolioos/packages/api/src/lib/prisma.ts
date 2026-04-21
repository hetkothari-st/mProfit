import { Prisma, PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { getCurrentUserId, isSystemContext } from './requestContext.js';

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
const USER_SCOPED_MODELS: ReadonlySet<string> = new Set([
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
]);

const basePrisma =
  globalForPrisma.basePrisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['warn', 'error'],
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
      const userId = getCurrentUserId();
      const system = isSystemContext();
      if (!userId && !system) {
        // No ambient context → fall through to Prisma. RLS policies will
        // see `app.current_user_id` unset, evaluate `NULL = <row.userId>`
        // to NULL, and return zero rows. Write paths get "no rows returned"
        // / constraint errors. This is the fail-closed guarantee.
        return query(args);
      }
      return await basePrisma.$transaction(async (tx) => {
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
      });
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
