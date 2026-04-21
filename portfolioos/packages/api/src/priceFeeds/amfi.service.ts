import { request } from 'undici';
import { Decimal } from 'decimal.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import type { MFCategory } from '@prisma/client';

export interface AmfiNavRow {
  schemeCode: string;
  isin: string | null;
  isinReinvest: string | null;
  schemeName: string;
  nav: string;
  date: string;
  amcName: string;
  category: MFCategory;
  subCategory: string | null;
}

function inferCategory(bucketHeader: string): { category: MFCategory; subCategory: string | null } {
  const h = bucketHeader.toUpperCase();
  if (h.includes('ELSS')) return { category: 'ELSS', subCategory: bucketHeader };
  if (h.includes('LIQUID')) return { category: 'LIQUID', subCategory: bucketHeader };
  if (h.includes('INDEX')) return { category: 'INDEX_FUND', subCategory: bucketHeader };
  if (h.includes('ETF') || h.includes('EXCHANGE TRADED')) return { category: 'ETF', subCategory: bucketHeader };
  if (h.includes('FIXED MATURITY') || h.includes(' FMP')) return { category: 'FMP', subCategory: bucketHeader };
  if (h.includes('DEBT') || h.includes('INCOME') || h.includes('GILT') || h.includes('BOND'))
    return { category: 'DEBT', subCategory: bucketHeader };
  if (h.includes('HYBRID') || h.includes('BALANCED') || h.includes('ARBITRAGE'))
    return { category: 'HYBRID', subCategory: bucketHeader };
  if (h.includes('SOLUTION ORIENTED') || h.includes('RETIREMENT') || h.includes('CHILDREN'))
    return { category: 'SOLUTION_ORIENTED', subCategory: bucketHeader };
  if (h.includes('EQUITY') || h.includes('GROWTH')) return { category: 'EQUITY', subCategory: bucketHeader };
  return { category: 'OTHER', subCategory: bucketHeader };
}

function parseDate(dateStr: string): Date | null {
  const m = dateStr.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const mo = months[m[2]];
  if (mo === undefined) return null;
  return new Date(Date.UTC(Number(m[3]), mo, Number(m[1])));
}

export async function fetchAmfiNavText(): Promise<string> {
  const res = await request(env.AMFI_NAV_URL, {
    method: 'GET',
    maxRedirections: 5,
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; PortfolioOS/0.3)',
      accept: 'text/plain,*/*',
    },
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`AMFI fetch failed: ${res.statusCode}`);
  }
  return await res.body.text();
}

export function parseAmfiNavText(text: string): AmfiNavRow[] {
  const rows: AmfiNavRow[] = [];
  const lines = text.split(/\r?\n/);
  let currentAmc = '';
  let currentBucket = '';

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('Scheme Code')) continue;

    if (!line.includes(';')) {
      if (line.toLowerCase().startsWith('open ended') || line.toLowerCase().startsWith('close ended') || line.toLowerCase().startsWith('interval fund')) {
        currentBucket = line;
      } else if (line.toLowerCase().includes('mutual fund')) {
        currentAmc = line;
      }
      continue;
    }

    const parts = line.split(';');
    if (parts.length < 6) continue;
    const [schemeCode, isin, isinReinvest, schemeName, navStr, dateStr] = parts;
    if (!schemeCode || !/^\d+$/.test(schemeCode.trim())) continue;
    const nav = navStr?.trim();
    if (!nav || nav === 'N.A.' || isNaN(Number(nav))) continue;

    const { category, subCategory } = inferCategory(currentBucket || '');
    rows.push({
      schemeCode: schemeCode.trim(),
      isin: isin?.trim() || null,
      isinReinvest: isinReinvest?.trim() || null,
      schemeName: schemeName.trim(),
      nav: nav,
      date: dateStr.trim(),
      amcName: currentAmc || 'Unknown',
      category,
      subCategory,
    });
  }
  return rows;
}

export interface AmfiLoadResult {
  fetchedRows: number;
  mastersCreated: number;
  mastersUpdated: number;
  navsUpserted: number;
}

const NAV_CHUNK = 500;

export async function loadAmfiNavToDb(): Promise<AmfiLoadResult> {
  logger.info('Fetching AMFI NAV file…');
  const text = await fetchAmfiNavText();
  const rows = parseAmfiNavText(text);
  logger.info({ rowCount: rows.length }, 'AMFI NAV parsed');

  // De-duplicate master rows by schemeCode (keep last occurrence)
  const masterByCode = new Map<string, AmfiNavRow>();
  for (const r of rows) masterByCode.set(r.schemeCode, r);

  // 1. Bulk insert new masters (skipDuplicates → existing schemeCodes left alone)
  const mastersCreated = await prisma.mutualFundMaster.createMany({
    data: Array.from(masterByCode.values()).map((r) => ({
      schemeCode: r.schemeCode,
      schemeName: r.schemeName,
      amcName: r.amcName,
      category: r.category,
      subCategory: r.subCategory,
      isin: r.isin,
    })),
    skipDuplicates: true,
  });

  // 2. Resolve schemeCode → id map (in chunks to avoid huge IN clauses)
  const allCodes = Array.from(masterByCode.keys());
  const idByCode = new Map<string, string>();
  for (let i = 0; i < allCodes.length; i += 2000) {
    const batch = allCodes.slice(i, i + 2000);
    const found = await prisma.mutualFundMaster.findMany({
      where: { schemeCode: { in: batch } },
      select: { id: true, schemeCode: true },
    });
    for (const m of found) idByCode.set(m.schemeCode, m.id);
  }

  // 3. Bulk upsert NAVs via raw INSERT...ON CONFLICT
  let navsUpserted = 0;
  const navRows: { fundId: string; date: Date; nav: string }[] = [];
  for (const r of rows) {
    const parsedDate = parseDate(r.date);
    const fundId = idByCode.get(r.schemeCode);
    if (!parsedDate || !fundId) continue;
    navRows.push({ fundId, date: parsedDate, nav: r.nav });
  }

  for (let i = 0; i < navRows.length; i += NAV_CHUNK) {
    const chunk = navRows.slice(i, i + NAV_CHUNK);
    const values = Prisma.join(
      chunk.map(
        (n) =>
          Prisma.sql`(${Prisma.raw(`'${randomId()}'`)}, ${n.fundId}, ${n.date}::date, ${new Decimal(n.nav).toString()}::numeric)`,
      ),
    );
    await prisma.$executeRaw`
      INSERT INTO "MFNav" (id, "fundId", date, nav)
      VALUES ${values}
      ON CONFLICT ("fundId", date) DO UPDATE SET nav = EXCLUDED.nav
    `;
    navsUpserted += chunk.length;
  }

  const result = {
    fetchedRows: rows.length,
    mastersCreated: mastersCreated.count,
    mastersUpdated: 0,
    navsUpserted,
  };
  logger.info(result, 'AMFI NAV load complete');
  return result;
}

function randomId(): string {
  // cuid-like short id, collision-safe enough for batch inserts (24 chars base36)
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}

export async function getLatestNavForFund(fundId: string): Promise<Decimal | null> {
  const latest = await prisma.mFNav.findFirst({
    where: { fundId },
    orderBy: { date: 'desc' },
  });
  return latest ? new Decimal(latest.nav.toString()) : null;
}
