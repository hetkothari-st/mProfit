import { request } from 'undici';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import type { Exchange } from '@prisma/client';

const NSE_EQUITY_LIST_URL = 'https://archives.nseindia.com/content/equities/EQUITY_L.csv';
const NSE_ETF_LIST_URL = 'https://archives.nseindia.com/content/equities/eq_etfseclist.csv';

export interface NseEquityRow {
  symbol: string;
  name: string;
  series: string;
  dateOfListing: string;
  isin: string;
  faceValue: string;
  marketLot: string;
  paidUpValue: string;
}

const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  accept: 'text/csv,application/octet-stream,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  referer: 'https://www.nseindia.com/',
};

async function fetchCsv(url: string): Promise<string> {
  const res = await request(url, { method: 'GET', headers: BROWSER_HEADERS, maxRedirections: 5 });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`NSE fetch failed ${url}: ${res.statusCode}`);
  }
  return await res.body.text();
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseNseEquityCsv(text: string): NseEquityRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]!).map((h) => h.toUpperCase().trim());
  const idx = (name: string) => header.findIndex((h) => h.replace(/\s+/g, '') === name.replace(/\s+/g, ''));
  const iSymbol = idx('SYMBOL');
  const iName = idx('NAMEOFCOMPANY');
  const iSeries = idx('SERIES');
  const iListing = idx('DATEOFLISTING');
  const iIsin = idx('ISINNUMBER');
  const iFace = idx('FACEVALUE');
  const iLot = idx('MARKETLOT');
  const iPaid = idx('PAIDUPVALUE');

  const rows: NseEquityRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!);
    if (cells.length < 4) continue;
    const sym = cells[iSymbol] ?? '';
    if (!sym) continue;
    rows.push({
      symbol: sym,
      name: cells[iName] ?? sym,
      series: cells[iSeries] ?? 'EQ',
      dateOfListing: cells[iListing] ?? '',
      isin: cells[iIsin] ?? '',
      faceValue: cells[iFace] ?? '',
      marketLot: cells[iLot] ?? '',
      paidUpValue: cells[iPaid] ?? '',
    });
  }
  return rows;
}

export interface NseUniverseLoadResult {
  fetchedRows: number;
  created: number;
  updated: number;
  skipped: number;
}

export async function loadNseEquityUniverse(): Promise<NseUniverseLoadResult> {
  logger.info('[NSE] fetching full NSE equity list');
  const text = await fetchCsv(NSE_EQUITY_LIST_URL);
  const rows = parseNseEquityCsv(text);
  logger.info({ rowCount: rows.length }, '[NSE] parsed equity CSV');

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.symbol || !['EQ', 'BE', 'BZ', 'SM', 'ST'].includes(row.series)) {
      skipped++;
      continue;
    }
    const existing = await prisma.stockMaster.findUnique({ where: { symbol: row.symbol } });
    if (existing) {
      await prisma.stockMaster.update({
        where: { id: existing.id },
        data: {
          name: row.name || existing.name,
          isin: row.isin || existing.isin,
          exchange: 'NSE' as Exchange,
          isActive: true,
        },
      });
      updated++;
    } else {
      try {
        await prisma.stockMaster.create({
          data: {
            symbol: row.symbol,
            name: row.name || row.symbol,
            exchange: 'NSE' as Exchange,
            isin: row.isin || null,
            isActive: true,
          },
        });
        created++;
      } catch (err) {
        logger.warn({ err, symbol: row.symbol }, '[NSE] create failed — likely duplicate ISIN');
        skipped++;
      }
    }
  }

  logger.info({ created, updated, skipped }, '[NSE] equity universe load complete');
  return { fetchedRows: rows.length, created, updated, skipped };
}

export async function loadNseEtfUniverse(): Promise<NseUniverseLoadResult> {
  logger.info('[NSE] fetching NSE ETF list');
  let text: string;
  try {
    text = await fetchCsv(NSE_ETF_LIST_URL);
  } catch (err) {
    logger.warn({ err }, '[NSE] ETF list fetch failed');
    return { fetchedRows: 0, created: 0, updated: 0, skipped: 0 };
  }
  const rows = parseNseEquityCsv(text);
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.symbol) {
      skipped++;
      continue;
    }
    const existing = await prisma.stockMaster.findUnique({ where: { symbol: row.symbol } });
    if (existing) {
      await prisma.stockMaster.update({
        where: { id: existing.id },
        data: {
          name: row.name || existing.name,
          isin: row.isin || existing.isin,
          industry: 'ETF',
          isActive: true,
        },
      });
      updated++;
    } else {
      try {
        await prisma.stockMaster.create({
          data: {
            symbol: row.symbol,
            name: row.name || row.symbol,
            exchange: 'NSE' as Exchange,
            isin: row.isin || null,
            industry: 'ETF',
            isActive: true,
          },
        });
        created++;
      } catch (err) {
        skipped++;
      }
    }
  }
  logger.info({ created, updated, skipped }, '[NSE] ETF list load complete');
  return { fetchedRows: rows.length, created, updated, skipped };
}
