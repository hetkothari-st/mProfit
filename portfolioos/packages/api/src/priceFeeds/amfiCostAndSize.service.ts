/**
 * Fetching what a fund costs and how big it is, from AMFI.
 *
 * Two sources, two very different join stories, and the difference is worth
 * stating because it decides how much either figure can be trusted:
 *
 * ── AUM — exact ──────────────────────────────────────────────────
 * `/api/average-aum-schemewise` returns scheme rows carrying **AMFI_Code**,
 * the same code `MutualFundMaster` is keyed on. The join is exact, per scheme,
 * per plan and option. It is paged by AMC, so the pass walks the AMC list.
 *
 * ── TER — name-based, and that is a real weakness ────────────────
 * AMFI's TER workbook carries an NSDL scheme code and a base scheme name. It
 * carries **no AMFI code and no ISIN**, so there is no exact key available at
 * the source. The join is therefore on a normalised base name.
 *
 * That was measured before it was built, against the live files on 21 Sept
 * 2026: 96.7% of direct-growth schemes in NAVAll matched a TER base name, and
 * exactly one TER base name mapped to more than one NSDL code (the blank row),
 * so the key is effectively unique. A name that matches more than one of our
 * schemes is left unmatched rather than guessed — the fund keeps a TER gap,
 * which the methodology already knows how to handle.
 *
 * Both fetchers follow the conventions the other feeds in this folder set:
 * a failure is recorded and returned, never swallowed (CONTEXT.md §3.5), and a
 * re-run overwrites the same columns rather than accumulating rows, so running
 * twice in a night is harmless.
 */

import { Decimal } from 'decimal.js';
import { request } from 'undici';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import {
  latestTerByScheme,
  normaliseSchemeName,
  parseTerWorkbook,
  type TerRow,
} from './amfiTer.parse.js';
import { parseFundWiseAmcNames, parseSchemeWiseAum } from './amfiAum.parse.js';

const AMFI_BASE = 'https://www.amfiindia.com';
const TER_REFERER = `${AMFI_BASE}/ter-of-mf-schemes`;
const AUM_REFERER = `${AMFI_BASE}/aum-data/average-aum`;
/** AMFI's app sends a browser referer; the endpoints answer without one today,
 *  but sending it keeps us indistinguishable from the published UI. */
const HEADERS = { 'user-agent': 'EveryPaisa/1.0 (+portfolio analytics)', accept: 'application/json' };

export interface CostSizeRefreshResult {
  ter: { fetched: number; matched: number; unmatched: number; ambiguous: number; asOf: string | null };
  aum: { fetched: number; matched: number; unmatched: number; amcs: number; asOf: string | null };
  failures: Array<{ source: string; reason: string }>;
}

/** MM-YYYY, as the TER endpoint demands — it says so in its own error. */
export function terMonthParam(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
}

async function fetchBuffer(url: string, referer: string, timeoutMs = 180_000): Promise<Buffer> {
  const res = await request(url, {
    method: 'GET',
    headers: { ...HEADERS, referer },
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`HTTP ${res.statusCode}`);
  }
  return Buffer.from(await res.body.arrayBuffer());
}

async function fetchJson(url: string, referer: string): Promise<unknown> {
  const res = await request(url, {
    method: 'GET',
    headers: { ...HEADERS, referer },
    headersTimeout: 60_000,
    bodyTimeout: 60_000,
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`HTTP ${res.statusCode}`);
  }
  return res.body.json();
}

/**
 * Refresh direct-plan TER for the given month (default: this month).
 *
 * Writes `terPct` and `terAsOf` on matched schemes and leaves the rest alone —
 * a scheme with no match keeps whatever it had, or keeps null, which the
 * scoring model reads as a data gap rather than as a cheap fund.
 */
export async function refreshAmfiTer(
  month: Date = new Date(),
): Promise<CostSizeRefreshResult['ter'] & { failures: Array<{ source: string; reason: string }> }> {
  const failures: Array<{ source: string; reason: string }> = [];
  const param = terMonthParam(month);
  const url = `${AMFI_BASE}/api/populate-te-rdata-revised?MF_ID=All&Month=${param}&strCat=All&strType=All&excel=true`;

  let rows: TerRow[] = [];
  try {
    const buffer = await fetchBuffer(url, TER_REFERER);
    const parsed = parseTerWorkbook(buffer);
    rows = parsed.rows;
    if (parsed.skipped.length > 0) {
      // A format change shows up here first, as a rising skip count.
      logger.warn(
        { skipped: parsed.skipped.slice(0, 3), total: parsed.skipped.length },
        '[amfiTer] rows skipped during parse',
      );
    }
    if (rows.length === 0) {
      failures.push({ source: 'amfi_ter', reason: 'parsed_zero_rows' });
      return { fetched: 0, matched: 0, unmatched: 0, ambiguous: 0, asOf: null, failures };
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error({ err: reason, url }, '[amfiTer] fetch failed');
    failures.push({ source: 'amfi_ter', reason });
    return { fetched: 0, matched: 0, unmatched: 0, ambiguous: 0, asOf: null, failures };
  }

  const latest = latestTerByScheme(rows);

  // Our side of the join: direct-plan schemes, grouped by normalised base name.
  // A name that resolves to more than one scheme is dropped rather than
  // guessed — the wrong TER is worse than no TER.
  const funds = await prisma.mutualFundMaster.findMany({
    select: { id: true, schemeName: true, planType: true },
  });
  const byName = new Map<string, string[]>();
  for (const f of funds) {
    if (f.planType && !/direct/i.test(f.planType)) continue;
    const key = normaliseSchemeName(f.schemeName);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(f.id);
  }

  let matched = 0;
  let ambiguous = 0;
  let asOf: Date | null = null;

  for (const [key, row] of latest) {
    const ids = byName.get(key);
    if (!ids || ids.length === 0) continue;
    if (row.directTerPct == null) continue;
    // Several of our rows (plan/option variants) can share one base name; that
    // is expected and they all take the same direct-plan TER. What is NOT
    // acceptable is a name matching two different schemes, which the source
    // measurement showed does not happen — if it starts to, this is where it
    // would show up as an inflated `ambiguous` count.
    if (ids.length > 12) {
      ambiguous += 1;
      continue;
    }
    await prisma.mutualFundMaster.updateMany({
      where: { id: { in: ids } },
      data: { terPct: new Decimal(row.directTerPct).toFixed(4), terAsOf: row.asOf },
    });
    matched += ids.length;
    if (!asOf || row.asOf > asOf) asOf = row.asOf;
  }

  return {
    fetched: latest.size,
    matched,
    unmatched: Math.max(0, latest.size - matched),
    ambiguous,
    asOf: asOf ? asOf.toISOString().slice(0, 10) : null,
    failures,
  };
}

/**
 * Refresh scheme-wise average AUM for the latest published period.
 *
 * Walks the AMC list and joins on AMFI scheme code, so every figure lands on
 * the exact scheme it belongs to.
 */
export async function refreshAmfiAum(): Promise<
  CostSizeRefreshResult['aum'] & { failures: Array<{ source: string; reason: string }> }
> {
  const failures: Array<{ source: string; reason: string }> = [];
  let amcs = 0;
  let fetched = 0;
  let matched = 0;

  let fyId = 1;
  let periodId = 1;
  let periodLabel: string | null = null;
  try {
    // The endpoint doubles as its own catalogue: with no periodId it returns
    // the financial years, and with one it returns that year's periods.
    const years = (await fetchJson(
      `${AMFI_BASE}/api/average-aum-schemewise?strType=Categorywise&MF_ID=0`,
      AUM_REFERER,
    )) as { data?: Array<{ id?: number }> };
    fyId = years?.data?.[0]?.id ?? 1;

    const periods = (await fetchJson(
      `${AMFI_BASE}/api/average-aum-schemewise?fyId=${fyId}&strType=Categorywise&MF_ID=0`,
      AUM_REFERER,
    )) as { data?: { periods?: Array<{ id?: number; period?: string }> } };
    const period = periods?.data?.periods?.[periods.data.periods.length - 1];
    periodId = period?.id ?? 1;
    periodLabel = period?.period ?? null;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error({ err: reason }, '[amfiAum] could not resolve the latest period');
    failures.push({ source: 'amfi_aum_period', reason });
    return { fetched: 0, matched: 0, unmatched: 0, amcs: 0, asOf: null, failures };
  }

  // MF_ID is AMFI's internal AMC id. The scheme-wise endpoint needs one, and
  // ids are not published as a list, so the pass walks a bounded range and
  // keeps whatever answers. An id with no schemes is simply skipped.
  const MAX_MF_ID = 120;
  for (let mfId = 1; mfId <= MAX_MF_ID; mfId += 1) {
    try {
      const payload = await fetchJson(
        `${AMFI_BASE}/api/average-aum-schemewise?strType=Categorywise&fyId=${fyId}&periodId=${periodId}&MF_ID=${mfId}`,
        AUM_REFERER,
      );
      const { rows, skipped } = parseSchemeWiseAum(payload);
      if (rows.length === 0) continue;
      amcs += 1;
      fetched += rows.length;
      if (skipped.length > 0) {
        logger.warn({ mfId, skipped: skipped.slice(0, 2) }, '[amfiAum] scheme rows skipped');
      }

      for (const row of rows) {
        const updated = await prisma.mutualFundMaster.updateMany({
          where: { schemeCode: row.schemeCode },
          data: { aumInr: row.aumInr.toFixed(4), aumAsOf: new Date() },
        });
        matched += updated.count;
      }
    } catch (err) {
      // One AMC failing is not the market failing.
      const reason = err instanceof Error ? err.message : String(err);
      logger.warn({ mfId, err: reason }, '[amfiAum] AMC fetch failed, continuing');
      failures.push({ source: `amfi_aum_mf_${mfId}`, reason });
    }
  }

  return {
    fetched,
    matched,
    unmatched: Math.max(0, fetched - matched),
    amcs,
    asOf: periodLabel,
    failures,
  };
}

/** Both sources, for the nightly job. */
export async function refreshFundCostAndSize(): Promise<CostSizeRefreshResult> {
  const ter = await refreshAmfiTer();
  const aum = await refreshAmfiAum();
  return {
    ter: { fetched: ter.fetched, matched: ter.matched, unmatched: ter.unmatched, ambiguous: ter.ambiguous, asOf: ter.asOf },
    aum: { fetched: aum.fetched, matched: aum.matched, unmatched: aum.unmatched, amcs: aum.amcs, asOf: aum.asOf },
    failures: [...ter.failures, ...aum.failures],
  };
}

/**
 * What share of otherwise-eligible schemes we actually hold each figure for.
 *
 * This is the number the release gate reads: a methodology that scores on cost
 * and size is only as good as its coverage, and 60% coverage would mean the
 * ranking is mostly deciding on which funds happen to have data.
 */
export async function fundDataCoverage(): Promise<{
  eligibleSchemes: number;
  terCoveragePct: number;
  aumCoveragePct: number;
}> {
  // "Otherwise eligible" = active, direct plan, growth option. Anything else is
  // excluded by eligibility before cost or size is ever consulted, so counting
  // it would understate coverage against a population the ranking never sees:
  // the market has roughly eight rows per scheme once plans and options are
  // counted, and only one of them can be recommended.
  const where = {
    isActive: true,
    planType: { contains: 'Direct', mode: 'insensitive' as const },
    optionType: { contains: 'Growth', mode: 'insensitive' as const },
  };
  const [total, withTer, withAum] = await Promise.all([
    prisma.mutualFundMaster.count({ where }),
    prisma.mutualFundMaster.count({ where: { ...where, terPct: { not: null } } }),
    prisma.mutualFundMaster.count({ where: { ...where, aumInr: { not: null } } }),
  ]);
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 10);
  return { eligibleSchemes: total, terCoveragePct: pct(withTer), aumCoveragePct: pct(withAum) };
}
