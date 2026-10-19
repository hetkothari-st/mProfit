import { Decimal } from 'decimal.js';
import type {
  LoanRateRowWire, LoanRatesWire, RateBasis, RateLoanType, RateOrigin, RepoRateWire,
} from '@everypaisa/shared';
import { prisma } from '../../../lib/prisma.js';
import { isSourceStale } from './sanity.js';
import { ensureLoanRateSources } from './sourceList.js';
import { effectiveRates, isoDate, pctString, rateKey } from './store.js';

/**
 * GET /api/loan-rates (spec s5.6): every lender's effective rate for one loan type, lowest first, plus the
 * RBI repo rate. SUSPECT readings never appear; a source with no effective rate is simply absent.
 */
export async function listLoanRates(loanType: RateLoanType, now: Date = new Date()): Promise<LoanRatesWire> {
  await ensureLoanRateSources();
  const sources = await prisma.loanRateSource.findMany({ where: { loanType } });
  const effective = await effectiveRates(sources.map((s) => s.id));
  const rows: LoanRateRowWire[] = [];
  for (const source of sources) {
    const rate = effective.get(rateKey(source.id, null));
    if (!rate) continue;
    const auto = rate.origin === 'AUTO';
    rows.push({
      sourceId: source.id,
      lender: source.lender,
      loanType,
      basis: rate.basis as RateBasis,
      minRatePct: pctString(rate.minRatePct),
      maxRatePct: rate.maxRatePct === null ? null : pctString(rate.maxRatePct),
      effectiveDate: isoDate(rate.effectiveDate),
      // AUTO: when the page last confirmed it. MANUAL: when the admin entered it (plan ruling 11).
      asOf: (auto ? (source.lastSuccessAt ?? rate.fetchedAt) : rate.fetchedAt).toISOString(),
      stale: auto && isSourceStale(source, now),
      sourceUrl: source.url,
      origin: rate.origin as RateOrigin,
    });
  }
  rows.sort((a, b) => new Decimal(a.minRatePct).comparedTo(b.minRatePct) || a.lender.localeCompare(b.lender));
  return { loanType, rows, repo: await repoSummary() };
}

/**
 * Latest RBI repo rate and, once there are two, the signed size and date of the last change. Two rows with
 * the same rate (possible after an override is cleared) are not a change: lastChange is null.
 */
export async function repoSummary(): Promise<RepoRateWire | null> {
  const [current, previous] = await prisma.benchmarkRate.findMany({
    where: { kind: 'REPO', lender: null, tenor: null },
    orderBy: [{ effectiveDate: 'desc' }, { fetchedAt: 'desc' }],
    take: 2,
  });
  if (!current) return null;
  const date = isoDate(current.effectiveDate)!;
  return {
    ratePct: pctString(current.ratePct),
    effectiveDate: date,
    lastChange:
      previous && !previous.ratePct.equals(current.ratePct)
        ? { deltaPct: pctString(current.ratePct.minus(previous.ratePct)), date }
        : null,
  };
}
