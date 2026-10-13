/**
 * The will's estate list, built from every source the app knows.
 *
 * Differences from getDashboardNetWorth, on purpose: bank accounts and owned
 * property are included (the dashboard leaves them out); PF-backed holdings are
 * reported once, by the PF adapter; rental properties linked from an owned
 * property are skipped (no double count); inactive rentals are skipped; a
 * property without a current value falls back to its purchase price;
 * zero-balance cards, fully repaid loans given and overdraft accounts are
 * skipped; CASH holdings are EXCLUDED (not counted) when an active bank account
 * has a balance, because a statement import mirrors the account as CASH. Holdings,
 * vehicles, rental, loans given, loans and cards otherwise match the dashboard
 * (test/will/estateAdapters.db.test.ts).
 */
import { logger } from '../../../lib/logger.js';
import { ESTATE_TRUNCATED, type EstateAdapter, type EstateCandidate, type EstateContext } from './types.js';
import { bankAccountsAdapter, holdingsAdapter, pfAccountsAdapter } from './adapters/financial.js';
import { ownedPropertyAdapter, rentalPropertyAdapter, vehiclesAdapter } from './adapters/property.js';
import { insuranceAdapter } from './adapters/protection.js';
import { creditCardsAdapter, loansAdapter, loansGivenAdapter } from './adapters/credit.js';

export const DEFAULT_ESTATE_ADAPTERS: readonly EstateAdapter[] = [
  bankAccountsAdapter,
  holdingsAdapter,
  pfAccountsAdapter,
  ownedPropertyAdapter,
  rentalPropertyAdapter,
  vehiclesAdapter,
  insuranceAdapter,
  loansGivenAdapter,
  loansAdapter,
  creditCardsAdapter,
];

/** Leaves room under the payload's 500-item cap for manual items. */
export const MAX_ESTATE_CANDIDATES = 400;

export interface EstateCollection {
  candidates: EstateCandidate[];
  /** Ids of adapters that threw, plus 'truncated' when the list was cut. Surfaced to the user, never swallowed. */
  failed: string[];
}

export async function collectEstate(
  ctx: EstateContext,
  adapters: readonly EstateAdapter[] = DEFAULT_ESTATE_ADAPTERS,
): Promise<EstateCollection> {
  const results = await Promise.allSettled(adapters.map((a) => Promise.resolve().then(() => a.collect(ctx))));
  const candidates: EstateCandidate[] = [];
  const failed: string[] = [];
  results.forEach((r, i) => {
    const adapter = adapters[i]!;
    if (r.status === 'fulfilled') {
      candidates.push(...r.value);
    } else {
      failed.push(adapter.id);
      // Error name only: messages can carry row data.
      logger.warn(
        { adapter: adapter.id, adapterVersion: adapter.version, errName: r.reason instanceof Error ? r.reason.name : 'unknown' },
        'will.estate.adapter_failed',
      );
    }
  });
  if (candidates.length > MAX_ESTATE_CANDIDATES) {
    logger.warn({ count: candidates.length }, 'will.estate.truncated');
    candidates.length = MAX_ESTATE_CANDIDATES;
    failed.push(ESTATE_TRUNCATED);
  }
  return { candidates, failed };
}
