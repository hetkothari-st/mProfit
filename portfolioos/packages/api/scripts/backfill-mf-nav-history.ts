/**
 * Driver for the MF NAV history backfill — `07-IMPLEMENTATION-PLAN.md`
 * Task 1.4, `01-DATA-FOUNDATION.md §2`.
 *
 * Run:
 *   pnpm --filter @portfolioos/api exec tsx scripts/backfill-mf-nav-history.ts
 *
 * Options (env):
 *   NAVBF_SCHEME_CODES    comma-separated scheme codes; overrides all selection
 *   NAVBF_LIMIT           cap the number of schemes (default 150)
 *   NAVBF_SUBCATEGORIES   comma-separated `sebiSubCategory` values to include
 *   NAVBF_PLAN            DIRECT | REGULAR   (default DIRECT)
 *   NAVBF_OPTION          GROWTH | IDCW_PAYOUT | IDCW_REINVEST (default GROWTH)
 *   NAVBF_PER_SUBCATEGORY how many schemes to take from each sub-category
 *   NAVBF_CONCURRENCY     in-flight requests, clamped to 4 (default 3)
 *   NAVBF_DELAY_MS        delay before each request (default 250)
 *   NAVBF_FORCE=1         re-fetch even for schemes that already have NAV rows
 *   NAVBF_MAX_RUN_MS      wall-clock ceiling
 *   NAVBF_OPS_USER_ID     owner of IngestionFailure rows
 *   NAVBF_SKIP_ADJUST=1   skip the adjustedNav step (see below — rarely right)
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SCRIPT AND NOT JUST THE JOB
 * ---------------------------------------------------------------------------
 *
 * Two things the cron cannot do for you.
 *
 * **1. It chains step 2.** `runMfNavHistoryBackfill` writes `MFNav.nav`. Every
 * metric in the analytics layer reads `MFNav.adjustedNav`, which is written by
 * a different job. A backfill that stops after step 1 leaves a database that
 * looks full of NAV history and still reports `INSUFFICIENT_DATA` for every
 * scheme — the single easiest way to waste a day on this pipeline. So this
 * script runs `runMfNavAdjustment` over exactly the funds it just touched,
 * unless you opt out.
 *
 * **2. It builds a REPRESENTATIVE universe.** `LIMIT 150 ORDER BY schemeCode`
 * does not give you 150 useful schemes; scheme codes are issued in blocks per
 * AMC, so the first 150 are essentially one AMC's debt funds. A metrics layer
 * validated on that is validated on nothing — peer universes need multiple
 * schemes per sub-category to produce a percentile at all. `selectUniverse`
 * below stratifies across sub-categories instead, taking the growth/direct
 * option of each (peer universes are GROWTH-only per `03 §1`, so an IDCW row
 * is wasted history for scoring purposes).
 *
 * Re-runnable by construction: the job skips any scheme that already has NAV
 * rows, so a second run makes no HTTP requests at all for what it already has.
 */

import { prisma } from '../src/lib/prisma.js';
import { runAsSystem } from '../src/lib/requestContext.js';
import type { Prisma, MfPlanType, MfOptionType } from '@prisma/client';
import { SEBI_SUBCATEGORY_MAP } from '@portfolioos/shared';
import {
  runMfNavHistoryBackfill,
  type MfNavHistoryBackfillResult,
} from '../src/jobs/mfNavHistoryBackfillJob.js';
import { runMfNavAdjustment } from '../src/jobs/mfNavAdjustmentJob.js';

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envList(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Sub-categories the scoring layer runs its ACTIVE_EQUITY model over (`03 §4`). */
const ACTIVE_EQUITY_SUBCATEGORIES: string[] = Object.entries(SEBI_SUBCATEGORY_MAP)
  .filter(([, spec]) => (spec as { modelKey: string }).modelKey === 'ACTIVE_EQUITY')
  .map(([name]) => name);

/**
 * Stratified pick, in two passes.
 *
 * **Why stratify at all.** `LIMIT 150 ORDER BY schemeCode` does not give you
 * 150 useful schemes. AMFI issues scheme codes in per-AMC blocks, so the first
 * 150 are essentially one house's debt funds. A peer universe needs several
 * schemes in the SAME sub-category before it can produce a percentile at all
 * (`03 §1`), so a corpus spread thin over one bucket scores nothing.
 *
 * **Why ACTIVE_EQUITY gets its own pass.** It is the model with the most
 * scoring machinery behind it — alpha, capture ratios, rolling consistency —
 * and therefore the one whose exercise proves the most. A purely proportional
 * stratification would hand it a handful of schemes per bucket, because AMFI's
 * DIRECT/GROWTH universe is dominated by index funds, sectoral funds and FoFs
 * (686 + 248 + 202 of ~1,900 as of this writing). Pass 1 fills the equity
 * quota; pass 2 spreads what is left across everything else.
 *
 * **Why `inceptionDate ASC` inside a bucket.** This data exists to feed
 * 10-year metrics and a backtest that starts in 2016, so the OLDEST schemes
 * are the valuable ones — a fund launched in 2024 contributes nothing to
 * either, however neatly it fills a quota.
 */
async function selectUniverse(): Promise<string[]> {
  const explicit = envList('NAVBF_SCHEME_CODES');
  if (explicit.length > 0) return explicit;

  const limit = envInt('NAVBF_LIMIT', 150);
  const minActiveEquity = envInt('NAVBF_MIN_ACTIVE_EQUITY', 60);
  const planType = (process.env.NAVBF_PLAN ?? 'DIRECT') as MfPlanType;
  const optionType = (process.env.NAVBF_OPTION ?? 'GROWTH') as MfOptionType;
  const requested = envList('NAVBF_SUBCATEGORIES');

  const base: Prisma.MfSchemeMetaWhereInput = {
    status: 'ACTIVE',
    planType,
    optionType,
    // UNMAPPED schemes are excluded from every peer universe (`01 §3`), so
    // their history buys nothing the scoring layer can use.
    sebiSubCategory: { not: 'UNMAPPED' },
  };

  const picked: string[] = [];
  const seen = new Set<string>();

  const take = async (sub: string, n: number): Promise<void> => {
    if (n <= 0) return;
    const rows = await prisma.mfSchemeMeta.findMany({
      where: { ...base, sebiSubCategory: sub },
      select: { schemeCode: true },
      orderBy: { inceptionDate: 'asc' },
      take: n,
    });
    for (const r of rows) {
      if (seen.has(r.schemeCode)) continue;
      seen.add(r.schemeCode);
      picked.push(r.schemeCode);
    }
  };

  // --- pass 1: the ACTIVE_EQUITY quota, spread evenly across its buckets ----
  // Even depth per bucket rather than bucket-by-bucket, so the quota is not
  // consumed by whichever equity sub-category happens to be listed first. The
  // `depth` loop deepens every bucket by one before revisiting any — `take`
  // always reads the oldest `depth` schemes and `seen` discards what it
  // already has, so each round adds at most one new scheme per bucket.
  if (requested.length === 0 && minActiveEquity > 0) {
    const maxDepth = Math.ceil(minActiveEquity / Math.max(1, ACTIVE_EQUITY_SUBCATEGORIES.length)) + 2;
    for (let depth = 1; depth <= maxDepth && picked.length < minActiveEquity; depth += 1) {
      for (const sub of ACTIVE_EQUITY_SUBCATEGORIES) {
        if (picked.length >= minActiveEquity) break;
        await take(sub, depth);
      }
    }
  }
  const activeEquityPicked = picked.length;

  // --- pass 2: spread the remainder across every sub-category --------------
  const subCategories =
    requested.length > 0
      ? requested
      : (
          await prisma.mfSchemeMeta.groupBy({
            by: ['sebiSubCategory'],
            where: base,
            _count: { _all: true },
            orderBy: { _count: { schemeCode: 'desc' } },
          })
        ).map((g) => g.sebiSubCategory);

  const remaining = limit - picked.length;
  const perSub = envInt(
    'NAVBF_PER_SUBCATEGORY',
    Math.max(1, Math.ceil(remaining / Math.max(1, subCategories.length))),
  );

  for (const sub of subCategories) {
    if (picked.length >= limit) break;
    await take(sub, Math.min(perSub, limit - picked.length));
  }

  // --- pass 3: top up ------------------------------------------------------
  // Passes 1 and 2 overlap on the equity buckets, so the even `perSub` depth
  // lands short of `limit` (141 of 150 on the current AMFI universe). Deepen
  // every bucket until the limit is met or nothing new comes back — asking for
  // 150 schemes and silently getting 141 is the kind of quiet shortfall that
  // makes a later "why is this sub-category unscored?" hard to trace.
  for (let depth = perSub + 1; picked.length < limit; depth += perSub) {
    const before = picked.length;
    for (const sub of subCategories) {
      if (picked.length >= limit) break;
      await take(sub, depth);
    }
    if (picked.length === before) break; // universe exhausted
  }

  console.log(
    `[universe] ACTIVE_EQUITY: ${activeEquityPicked} (quota ${minActiveEquity}), ` +
      `total ${Math.min(picked.length, limit)} across ${subCategories.length} sub-categories`,
  );
  return picked.slice(0, limit);
}

function fmt(d: Date | null): string {
  return d === null ? '—' : d.toISOString().slice(0, 10);
}

function printResult(r: MfNavHistoryBackfillResult): void {
  console.log('');
  console.log('--- NAV history backfill -------------------------------------');
  console.log(`  selected           ${r.selected}`);
  console.log(`  skipped (had NAVs) ${r.skipped}`);
  console.log(`  ingested           ${r.ingested}`);
  console.log(`  masters created    ${r.mastersCreated}`);
  console.log(`  NAV points seen    ${r.navPointsSeen}`);
  console.log(`  NAV rows inserted  ${r.navRowsInserted}`);
  console.log(`  date span          ${fmt(r.earliestDate)} .. ${fmt(r.latestDate)}`);
  console.log(`  not in MFAPI       ${r.notFound}`);
  console.log(`  failed             ${r.failed}`);
  console.log(`  DLQ rows written   ${r.dlqWritten}`);
  console.log(`  budget exhausted   ${r.budgetExhausted}`);
  console.log(`  duration           ${(r.durationMs / 1000).toFixed(1)}s`);
  const pf = Object.entries(r.pointFailuresByReason).sort(([a], [b]) => a.localeCompare(b));
  console.log(`  point rejects      ${pf.length === 0 ? 'none' : ''}`);
  for (const [reason, n] of pf) console.log(`    ${reason.padEnd(22)} ${n}`);
  const sf = Object.entries(r.schemeFailuresByReason).sort(([a], [b]) => a.localeCompare(b));
  console.log(`  scheme failures    ${sf.length === 0 ? 'none' : ''}`);
  for (const [reason, n] of sf) console.log(`    ${reason.padEnd(22)} ${n}`);
}

async function main(): Promise<void> {
  const schemeCodes = await runAsSystem(selectUniverse);
  if (schemeCodes.length === 0) {
    console.error(
      'No schemes selected. Is MfSchemeMeta populated? Run scripts/backfill-mf-scheme-meta.ts first.',
    );
    process.exitCode = 1;
    return;
  }
  console.log(`[universe] ${schemeCodes.length} schemes selected`);

  const opsUserId = process.env.NAVBF_OPS_USER_ID;
  const result = await runMfNavHistoryBackfill({
    schemeCodes,
    concurrency: envInt('NAVBF_CONCURRENCY', 3),
    delayMs: envInt('NAVBF_DELAY_MS', 250),
    skipIfNavRowsAtLeast: process.env.NAVBF_FORCE === '1' ? 0 : 1,
    ...(process.env.NAVBF_MAX_RUN_MS ? { maxRunMs: envInt('NAVBF_MAX_RUN_MS', 0) } : {}),
    ...(opsUserId !== undefined ? { opsUserId } : {}),
  });
  printResult(result);

  if (process.env.NAVBF_SKIP_ADJUST === '1') {
    console.log('');
    console.log('[adjust] SKIPPED via NAVBF_SKIP_ADJUST=1.');
    console.log(
      '[adjust] WARNING: MFNav.adjustedNav is still NULL for these rows, and every',
    );
    console.log(
      '[adjust]          metric reads adjustedNav — mfMetricsJob will report',
    );
    console.log('[adjust]          INSUFFICIENT_DATA until the adjustment job runs.');
    return;
  }

  // Step 2 of the chain. Scoped to the funds we just touched — an unscoped run
  // would re-walk every fund in the database, which on a shared development
  // box is other people's data and a much longer run.
  const fundIds = await runAsSystem(async () =>
    (
      await prisma.mutualFundMaster.findMany({
        where: { schemeCode: { in: schemeCodes } },
        select: { id: true },
      })
    ).map((m) => m.id),
  );

  console.log('');
  console.log(`[adjust] computing adjustedNav for ${fundIds.length} funds…`);
  const adj = await runMfNavAdjustment({
    fundIds,
    // The job's own default budget is sized for a nightly incremental pass over
    // funds that already have `adjustedNav`. A backfill hands it years of
    // never-adjusted rows for every fund at once, so it needs a bigger one or
    // it reports `truncated: true` and leaves most rows null — which looks
    // exactly like the ingest having failed.
    maxRunMs: envInt('NAVBF_ADJUST_MAX_RUN_MS', 3_600_000),
    ...(opsUserId !== undefined ? { opsUserId } : {}),
  });
  console.log('--- adjustedNav ----------------------------------------------');
  console.log(JSON.stringify(adj, null, 2));

  await repairInceptionDates(schemeCodes);
}

/**
 * Opt-in repair of `MfSchemeMeta.inceptionDate` (`NAVBF_REPAIR_INCEPTION=1`).
 *
 * WHY THIS IS NEEDED. `mfMetadataJob` seeds `inceptionDate` at INSERT from the
 * earliest `MFNav` row for the scheme, falling back to the NAV date on the
 * AMFI row. It is create-only on purpose — re-deriving it every run would walk
 * the date forward as old NAV rows aged out, quietly shortening every fund's
 * apparent history.
 *
 * But the bootstrap order is unavoidably metadata-then-NAV: you have to know
 * which schemes exist before you can fetch their history. So on a first run
 * there is no NAV to derive from, every scheme is stamped with today's date,
 * and because the column is create-only it stays wrong forever. Measured here:
 * 134 of 148 schemes stamped 2026 for funds with real NAV back to 2013.
 *
 * A wrong-LATE `inceptionDate` is the "safe" direction by the metadata job's
 * own reasoning (it makes the metrics layer find less history than exists and
 * report INSUFFICIENT_DATA, which is visibly missing rather than confidently
 * wrong) — but at ten years too late it silently empties every historical
 * universe that gates on it.
 *
 * So: OPT-IN, off by default, and it only ever moves a date EARLIER, never
 * later. Moving it later is the dangerous direction and is exactly what the
 * create-only rule exists to prevent; this repair cannot do it.
 */
async function repairInceptionDates(schemeCodes: readonly string[]): Promise<void> {
  if (process.env.NAVBF_REPAIR_INCEPTION !== '1') {
    console.log('');
    console.log('[inception] skipped. MfSchemeMeta.inceptionDate is seeded at metadata-insert');
    console.log('[inception] time, so on a first bootstrap it is stamped with today rather than');
    console.log('[inception] the fund launch. Re-run with NAVBF_REPAIR_INCEPTION=1 to correct it');
    console.log('[inception] from the NAV history just ingested (only ever moves dates earlier).');
    return;
  }

  const repaired = await runAsSystem(async () => {
    const masters = await prisma.mutualFundMaster.findMany({
      where: { schemeCode: { in: [...schemeCodes] } },
      select: { id: true, schemeCode: true },
    });
    if (masters.length === 0) return 0;
    const codeByFundId = new Map(masters.map((m) => [m.id, m.schemeCode]));

    // Quarantined rows are excluded by every metric consumer, so they must not
    // be allowed to claim an inception date the usable series does not support.
    const grouped = await prisma.mFNav.groupBy({
      by: ['fundId'],
      where: { fundId: { in: masters.map((m) => m.id) }, isQuarantined: false },
      _min: { date: true },
    });

    const metas = await prisma.mfSchemeMeta.findMany({
      where: { schemeCode: { in: [...schemeCodes] } },
      select: { schemeCode: true, inceptionDate: true },
    });
    const currentByCode = new Map(metas.map((m) => [m.schemeCode, m.inceptionDate]));

    let n = 0;
    for (const g of grouped) {
      const code = codeByFundId.get(g.fundId);
      const earliest = g._min.date;
      const current = code ? currentByCode.get(code) : undefined;
      if (!code || !earliest || !current) continue;
      // Strictly earlier only.
      if (earliest.getTime() >= current.getTime()) continue;
      await prisma.mfSchemeMeta.update({
        where: { schemeCode: code },
        data: { inceptionDate: earliest },
      });
      n += 1;
    }
    return n;
  });

  console.log('');
  console.log(`[inception] repaired ${repaired} scheme(s) to their earliest clean NAV date`);
}

main()
  .catch((err: unknown) => {
    // Never swallowed: a backfill that failed silently is worse than one that
    // did not run, because the next step assumes its output exists.
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
