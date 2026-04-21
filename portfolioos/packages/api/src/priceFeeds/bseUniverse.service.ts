import { request } from 'undici';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import type { Exchange } from '@prisma/client';

const BSE_EQUITY_LIST_URL = 'https://api.bseindia.com/BseIndiaAPI/api/ListOfScripCode/w';

const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  referer: 'https://www.bseindia.com/',
  origin: 'https://www.bseindia.com',
};

interface BseScrip {
  SCRIP_CD: string | number;
  Scrip_Name: string;
  scrip_id: string;
  Status: string;
  ISIN_NUMBER: string;
  GROUP: string;
  INDUSTRY: string;
  INSTRUMENT: string;
}

export async function fetchBseScripList(): Promise<BseScrip[]> {
  try {
    const res = await request(BSE_EQUITY_LIST_URL, { method: 'GET', headers: BROWSER_HEADERS, maxRedirections: 5 });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`BSE scrip list fetch failed: ${res.statusCode}`);
    }
    const body = (await res.body.json()) as BseScrip[];
    return Array.isArray(body) ? body : [];
  } catch (err) {
    logger.warn({ err }, '[BSE] scrip list fetch failed — BSE API requires cookies; skipping');
    return [];
  }
}

export interface BseUniverseLoadResult {
  fetchedRows: number;
  created: number;
  updated: number;
  skipped: number;
}

export async function loadBseEquityUniverse(): Promise<BseUniverseLoadResult> {
  logger.info('[BSE] fetching full BSE scrip master');
  const rows = await fetchBseScripList();
  logger.info({ rowCount: rows.length }, '[BSE] scrip master fetched');

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.scrip_id || row.Status !== 'Active' || row.INSTRUMENT !== 'Equity') {
      skipped++;
      continue;
    }
    const symbol = String(row.scrip_id).trim().toUpperCase();
    if (!symbol) {
      skipped++;
      continue;
    }

    const existing = await prisma.stockMaster.findUnique({ where: { symbol } });
    if (existing) {
      if (existing.exchange === 'BSE') {
        await prisma.stockMaster.update({
          where: { id: existing.id },
          data: {
            name: row.Scrip_Name || existing.name,
            isin: row.ISIN_NUMBER || existing.isin,
            industry: row.INDUSTRY || existing.industry,
            isActive: true,
          },
        });
        updated++;
      } else {
        skipped++;
      }
    } else {
      try {
        await prisma.stockMaster.create({
          data: {
            symbol,
            name: row.Scrip_Name || symbol,
            exchange: 'BSE' as Exchange,
            isin: row.ISIN_NUMBER || null,
            industry: row.INDUSTRY || null,
            isActive: true,
          },
        });
        created++;
      } catch (err) {
        skipped++;
      }
    }
  }

  logger.info({ created, updated, skipped }, '[BSE] equity universe load complete');
  return { fetchedRows: rows.length, created, updated, skipped };
}
