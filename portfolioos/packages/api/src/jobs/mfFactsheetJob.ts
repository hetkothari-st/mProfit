/**
 * The half of the factsheet pipeline that was never built.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 *
 * Ten AMC adapters exist under `adapters/mfFactsheet`, each tested against the
 * files the AMCs actually publish. Nothing called them. `resolveFactsheetAdapter`
 * was imported by no job, no script, nothing outside its own directory and its
 * tests, and the only code that had ever written `MfPortfolioSnapshot` was a
 * load test writing synthetic rows.
 *
 * The consequence was not a warning anywhere. It was three permanently empty
 * tables — `MfSchemeTer`, `MfSchemeAum`, `MfPortfolioHolding` — and therefore:
 *
 *   - COST scored `null` for every scheme, at weight 0. Expense ratio, the one
 *     input with the strongest published link to future relative return,
 *     contributed nothing to any rating.
 *   - PORTFOLIO scored `null` for every scheme, at weight 0. Concentration,
 *     sector mix, market-cap split, turnover, active share: all absent.
 *   - A fund page rendered "Not available" down its whole right-hand side, with
 *     `no_portfolio_snapshot` as the reason — which reads as a data gap the
 *     next run might fill, rather than a pipeline stage that does not exist.
 *
 * A rating computed on four of six pillars is not wrong, but it is not what the
 * methodology describes, and nothing in the output said so.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT DOES NOT DO
 * ---------------------------------------------------------------------------
 *
 * The registry covers ten AMCs — the largest by AUM, ~85% of retail money, but
 * only about a third of the schemes in a full AMFI list. Everything else
 * resolves to `AMC_NOT_SUPPORTED`, which is recorded as a skip, not a failure:
 * a fund from an uncovered AMC has no factsheet stage, and the honest thing is
 * for its COST and PORTFOLIO pillars to stay unscored rather than to guess.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { runAsSystem } from '../lib/requestContext.js';
import {
  resolveFactsheetAdapter,
  REGISTERED_AMC_CODES,
} from '../adapters/mfFactsheet/registry.js';
import type {
  FactsheetFetchContext,
  MfFactsheetAdapter,
  PortfolioRaw,
  SchemeFactsRaw,
} from '../adapters/mfFactsheet/types.js';
import { writeIngestionFailure } from '../services/ingestionFailures.service.js';
import {
  setIciciPortfolioUrlResolver,
  setIciciFactsheetTextResolver,
} from '../adapters/mfFactsheet/icici.v1.js';
import { createIciciPortfolioResolver, resetFactsheetZipCache } from './mfFactsheetZip.js';
import {
  createIciciFactsheetTextResolver,
  resetFactsheetPdfCache,
} from './mfFactsheetPdf.js';

export const MF_FACTSHEET_ADAPTER_ID = 'mf.factsheet';

/** Per-request ceiling. An AMC that hangs must not hold the whole run open. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Serial per AMC, with a pause between requests.
 *
 * These are public investor-relations documents on ordinary web servers, not an
 * API with a published rate limit. The polite default matters more than the
 * throughput: a monthly job that fetches a few hundred documents has all night,
 * and an AMC that starts 403-ing because we hammered it costs far more than the
 * hour saved.
 */
const DELAY_MS = 600;

let running = false;

export interface MfFactsheetJobResult {
  schemesConsidered: number;
  amcNotSupported: number;
  factsAttempted: number;
  factsWritten: number;
  portfoliosAttempted: number;
  portfoliosWritten: number;
  holdingsWritten: number;
  terRowsWritten: number;
  aumRowsWritten: number;
  managerRowsWritten: number;
  failures: number;
  durationMs: number;
}

function emptyResult(): MfFactsheetJobResult {
  return {
    schemesConsidered: 0,
    amcNotSupported: 0,
    factsAttempted: 0,
    factsWritten: 0,
    portfoliosAttempted: 0,
    portfoliosWritten: 0,
    holdingsWritten: 0,
    terRowsWritten: 0,
    aumRowsWritten: 0,
    managerRowsWritten: 0,
    failures: 0,
    durationMs: 0,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * SEBI gives AMCs ten days from month end to publish the monthly portfolio
 * disclosure, and they use them. Asking for last month's file on the 8th is not
 * a near miss — it is a guaranteed 404 or, worse, a 302 to an HTML error page
 * that then fails as "not a workbook", which reads like a parser bug.
 *
 * Measured against sbimf.com on 2026-09-08: the July file returns 200, the
 * August file 302. So the newest disclosure that reliably exists is the month
 * end at least `PUBLICATION_LAG_DAYS` in the past.
 */
const PUBLICATION_LAG_DAYS = 12;

export function defaultDisclosureMonth(now: Date): Date {
  const thisMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const ageDays = (now.getTime() - thisMonthEnd.getTime()) / 86_400_000;
  if (ageDays >= PUBLICATION_LAG_DAYS) return thisMonthEnd;
  // Too soon after month end — step back one more month.
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 0));
}

/**
 * The production fetch context. Adapters take this injected precisely so they
 * stay testable without a network — see `FactsheetFetchContext`.
 */
export function createFetchContext(signal?: AbortSignal): FactsheetFetchContext {
  async function get(url: string, init?: { signal?: AbortSignal }): Promise<Response> {
    // `file://` is how the zip resolver hands an extracted workbook back: the
    // adapter contract is a URL to a single already-extracted xlsx, and Node's
    // fetch does not implement the file scheme.
    if (url.startsWith('file://')) {
      const bytes = await readFile(fileURLToPath(url));
      return new Response(new Uint8Array(bytes));
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    const outer = init?.signal ?? signal;
    const onAbort = () => ctrl.abort();
    outer?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: {
          // Several AMC CDNs return 403 to a default Node agent string. This
          // identifies the caller honestly rather than impersonating a browser.
          'User-Agent': 'PortfolioOS/1.0 (mutual-fund factsheet ingestion)',
          Accept: '*/*',
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      }
      return res;
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
    }
  }

  return {
    abortSignal: signal,
    async fetchText(url, init) {
      return (await get(url, init)).text();
    },
    async fetchBinary(url, init) {
      const buf = await (await get(url, init)).arrayBuffer();
      return new Uint8Array(buf);
    },
  };
}

/** `SchemeFactsRaw` → `MfSchemeTer` + `MfSchemeAum` + `MfSchemeManager`. */
async function persistFacts(
  facts: SchemeFactsRaw,
  result: MfFactsheetJobResult,
): Promise<void> {
  const fetchedAt = new Date();

  if (facts.terPct !== null) {
    // TER is a history keyed on when it took effect, not on when we read it —
    // an upsert on (schemeCode, effectiveFrom) so re-running is a no-op.
    await prisma.mfSchemeTer.upsert({
      where: {
        schemeCode_effectiveFrom: {
          schemeCode: facts.schemeCode,
          effectiveFrom: facts.terEffectiveFrom ?? facts.asOf,
        },
      },
      create: {
        schemeCode: facts.schemeCode,
        effectiveFrom: facts.terEffectiveFrom ?? facts.asOf,
        terPct: facts.terPct as unknown as Prisma.Decimal,
        sourceHash: facts.sourceHash,
        fetchedAt,
      },
      update: {
        terPct: facts.terPct as unknown as Prisma.Decimal,
        sourceHash: facts.sourceHash,
        fetchedAt,
      },
    });
    result.terRowsWritten += 1;
  }

  if (facts.aum !== null) {
    await prisma.mfSchemeAum.upsert({
      where: {
        schemeCode_asOf: {
          schemeCode: facts.schemeCode,
          asOf: facts.aumAsOf ?? facts.asOf,
        },
      },
      create: {
        schemeCode: facts.schemeCode,
        asOf: facts.aumAsOf ?? facts.asOf,
        aum: facts.aum as unknown as Prisma.Decimal,
        sourceHash: facts.sourceHash,
        fetchedAt,
      },
      update: {
        aum: facts.aum as unknown as Prisma.Decimal,
        sourceHash: facts.sourceHash,
        fetchedAt,
      },
    });
    result.aumRowsWritten += 1;
  }

  // Managers have no natural unique key in the schema (a scheme can have two
  // co-managers with the same fromDate), so replace the scheme's set rather
  // than accumulate duplicates on every monthly run.
  // `MfSchemeManager.fromDate` is required, but a factsheet often names a
  // manager without a "managing since" date. Storing the disclosure date in its
  // place would manufacture a tenure of zero and quietly corrupt the
  // manager-tenure metric, so those rows are skipped instead.
  const datedManagers = facts.managers.filter(
    (m): m is typeof m & { fromDate: Date } => m.fromDate !== null,
  );
  if (datedManagers.length > 0) {
    await prisma.mfSchemeManager.deleteMany({ where: { schemeCode: facts.schemeCode } });
    await prisma.mfSchemeManager.createMany({
      data: datedManagers.map((m) => ({
        schemeCode: facts.schemeCode,
        managerName: m.managerName,
        role: m.role,
        fromDate: m.fromDate,
        sourceHash: facts.sourceHash,
        fetchedAt,
      })),
    });
    result.managerRowsWritten += datedManagers.length;
  }
}

/** `PortfolioRaw` → `MfPortfolioSnapshot` + its `MfPortfolioHolding` rows. */
async function persistPortfolio(
  portfolio: PortfolioRaw,
  result: MfFactsheetJobResult,
): Promise<void> {
  const fetchedAt = new Date();

  // One transaction per snapshot: holdings without their snapshot, or a
  // snapshot whose holdings half-wrote, would both read as a real disclosure.
  await prisma.$transaction(async (tx) => {
    const snapshot = await tx.mfPortfolioSnapshot.upsert({
      where: {
        schemeCode_asOf: { schemeCode: portfolio.schemeCode, asOf: portfolio.asOf },
      },
      create: {
        schemeCode: portfolio.schemeCode,
        asOf: portfolio.asOf,
        totalHoldings: portfolio.totalHoldings,
        cashPct: portfolio.cashPct as unknown as Prisma.Decimal,
        sourceHash: portfolio.sourceHash,
        fetchedAt,
      },
      update: {
        totalHoldings: portfolio.totalHoldings,
        cashPct: portfolio.cashPct as unknown as Prisma.Decimal,
        sourceHash: portfolio.sourceHash,
        fetchedAt,
      },
    });

    // Replace rather than merge: a re-parse of the same disclosure must not
    // leave last version's rows behind alongside this one's.
    await tx.mfPortfolioHolding.deleteMany({ where: { snapshotId: snapshot.id } });
    await tx.mfPortfolioHolding.createMany({
      data: portfolio.holdings.map((h) => ({
        snapshotId: snapshot.id,
        kind: h.kind,
        isin: h.isin,
        securityName: h.securityName,
        weightPct: h.weightPct as unknown as Prisma.Decimal,
        quantity: (h.quantity ?? null) as unknown as Prisma.Decimal | null,
        marketValue: (h.marketValue ?? null) as unknown as Prisma.Decimal | null,
        sector: h.sector,
        marketCapBucket: h.marketCapBucket,
        issuer: h.issuer,
        creditRating: h.creditRating,
        maturityDate: h.maturityDate ?? null,
        ytmPct: (h.ytmPct ?? null) as unknown as Prisma.Decimal | null,
      })),
    });

    result.holdingsWritten += portfolio.holdings.length;
  });

  result.portfoliosWritten += 1;
}

/**
 * Failures are attributed to the ops ADMIN, matching `mfMetricsJob`. With no
 * admin present the failure is logged and dropped rather than fabricating a
 * user — a DLQ row nobody can see is worse than a log line somebody can.
 */
let opsUserIdCache: string | null | undefined;

async function resolveOpsUserId(): Promise<string | null> {
  if (opsUserIdCache !== undefined) return opsUserIdCache;
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  opsUserIdCache = admin?.id ?? null;
  return opsUserIdCache;
}

/** Exported for tests, which create an admin after this module is first loaded. */
export function resetOpsUserCache(): void {
  opsUserIdCache = undefined;
}

async function dlq(
  schemeCode: string,
  adapter: MfFactsheetAdapter | null,
  stage: 'facts' | 'portfolio',
  reason: string,
  detail?: unknown,
): Promise<void> {
  const userId = await resolveOpsUserId();
  if (userId === null) {
    logger.error(
      { schemeCode, stage, reason },
      '[cron] mf factsheet failure not written to DLQ — no ADMIN user to attribute it to',
    );
    return;
  }
  await writeIngestionFailure({
    userId,
    sourceAdapter: `${MF_FACTSHEET_ADAPTER_ID}.${adapter?.amcCode ?? 'unknown'}.${stage}`,
    adapterVersion: adapter?.version ?? '0',
    sourceRef: `MfSchemeMeta:${schemeCode}`,
    error: detail instanceof Error ? detail : `${reason}${detail === undefined ? '' : `: ${String(detail)}`}`,
    rawPayload: { schemeCode, stage, reason },
  });
}

export interface RunMfFactsheetOptions {
  /** Explicit scheme list; otherwise every ACTIVE scheme of a supported AMC. */
  schemeCodes?: string[];
  /** Disclosure month to request. Defaults to the latest completed month end. */
  asOf?: Date;
  /** Cap the run — useful for a first pass against live AMC sites. */
  limit?: number;
  abortSignal?: AbortSignal;
}

export async function runMfFactsheetJob(
  options: RunMfFactsheetOptions = {},
): Promise<MfFactsheetJobResult> {
  const t0 = Date.now();
  const result = emptyResult();

  const asOf = options.asOf ?? defaultDisclosureMonth(new Date());

  return runAsSystem(async () => {
    const schemes = await prisma.mfSchemeMeta.findMany({
      where: {
        status: 'ACTIVE',
        ...(options.schemeCodes ? { schemeCode: { in: options.schemeCodes } } : {}),
        ...(options.schemeCodes ? {} : { amcCode: { in: [...REGISTERED_AMC_CODES] } }),
      },
      select: { schemeCode: true, amcCode: true },
      orderBy: { schemeCode: 'asc' },
      ...(options.limit ? { take: options.limit } : {}),
    });

    result.schemesConsidered = schemes.length;
    const ctx = createFetchContext(options.abortSignal);

    // Install the unzip step ICICI's adapter asks for. Scoped to the run and
    // removed in the `finally` below: a module-level resolver left installed
    // would leak a stale fetch context (and its abort signal) into the next
    // caller, including tests.
    setIciciPortfolioUrlResolver(createIciciPortfolioResolver(ctx));
    setIciciFactsheetTextResolver(createIciciFactsheetTextResolver(ctx, asOf));
    try {

    for (const scheme of schemes) {
      if (options.abortSignal?.aborted) break;

      const resolution = resolveFactsheetAdapter(scheme.amcCode);
      if (!resolution.supported) {
        result.amcNotSupported += 1;
        continue;
      }
      const adapter = resolution.adapter;

      // ── Scheme facts: TER, AUM, managers ────────────────────────────────
      result.factsAttempted += 1;
      try {
        const facts = await adapter.fetchSchemeFacts(scheme.schemeCode, ctx);
        if (facts.ok) {
          await persistFacts(facts.data, result);
          result.factsWritten += 1;
        } else {
          result.failures += 1;
          await dlq(scheme.schemeCode, adapter, 'facts', facts.reason, facts.detail);
        }
      } catch (err) {
        result.failures += 1;
        await dlq(scheme.schemeCode, adapter, 'facts', 'FETCH_THREW', err);
      }

      await sleep(DELAY_MS);
      if (options.abortSignal?.aborted) break;

      // ── Portfolio disclosure: holdings, cash, concentration ─────────────
      result.portfoliosAttempted += 1;
      try {
        const portfolio = await adapter.fetchPortfolio(scheme.schemeCode, asOf, ctx);
        if (portfolio.ok) {
          await persistPortfolio(portfolio.data, result);
        } else {
          result.failures += 1;
          await dlq(scheme.schemeCode, adapter, 'portfolio', portfolio.reason, portfolio.detail);
        }
      } catch (err) {
        result.failures += 1;
        await dlq(scheme.schemeCode, adapter, 'portfolio', 'FETCH_THREW', err);
      }

      await sleep(DELAY_MS);
    }

      result.durationMs = Date.now() - t0;
      logger.info({ ...result, asOf: asOf.toISOString() }, '[cron] mf factsheet job done');
      return result;
    } finally {
      setIciciPortfolioUrlResolver(null);
      setIciciFactsheetTextResolver(null);
      resetFactsheetZipCache();
      resetFactsheetPdfCache();
    }
  });
}

export function startMfFactsheetJob(): void {
  if (process.env.ENABLE_MF_FACTSHEET_CRON === 'false') {
    logger.info('[cron] mf factsheet job disabled via ENABLE_MF_FACTSHEET_CRON=false');
    return;
  }
  // Deliberately not scheduled yet — see BLOCKED note in the PR. Running a few
  // hundred live fetches against ten AMC sites needs a look at what actually
  // comes back before it runs unattended on a timer.
  logger.info('[cron] mf factsheet job registered but not scheduled (manual runs only)');
}
