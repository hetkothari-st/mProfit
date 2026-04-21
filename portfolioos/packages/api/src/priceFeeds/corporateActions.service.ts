import { request } from 'undici';
import { Decimal } from 'decimal.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import type { CorporateActionType } from '@prisma/client';

const NSE_CA_URL = 'https://archives.nseindia.com/content/equities/corporate_actions.csv';

const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  accept: 'text/csv,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  referer: 'https://www.nseindia.com/companies-listing/corporate-filings-actions',
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === ',' && !q) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export interface CorpActionRow {
  symbol: string;
  series: string;
  company: string;
  subject: string;
  exDate: Date;
  recordDate: Date | null;
  type: CorporateActionType;
  ratio: Decimal | null;
  amount: Decimal | null;
  raw: string;
}

function parseDdMmmYyyy(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const months: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const mo = months[m[2]!];
  if (mo === undefined) return null;
  return new Date(Date.UTC(Number(m[3]), mo, Number(m[1])));
}

function classify(subject: string): {
  type: CorporateActionType;
  ratio: Decimal | null;
  amount: Decimal | null;
} {
  const s = subject.toLowerCase();
  if (s.includes('dividend')) {
    const m = subject.match(/rs\.?\s*(\d+(?:\.\d+)?)/i) ?? subject.match(/inr\s*(\d+(?:\.\d+)?)/i) ?? subject.match(/\b(\d+(?:\.\d+)?)\s*%/i);
    const amount = m ? new Decimal(m[1]!) : null;
    return { type: 'DIVIDEND', ratio: null, amount };
  }
  if (s.includes('bonus')) {
    const m = subject.match(/(\d+)\s*[:/]\s*(\d+)/);
    const ratio = m ? new Decimal(m[1]!).div(new Decimal(m[2]!)) : null;
    return { type: 'BONUS', ratio, amount: null };
  }
  if (s.includes('split') || s.includes('sub division') || s.includes('stock split')) {
    const m = subject.match(/(?:rs\.?\s*)?(\d+(?:\.\d+)?)\s*to\s*(?:rs\.?\s*)?(\d+(?:\.\d+)?)/i);
    if (m) return { type: 'SPLIT', ratio: new Decimal(m[1]!).div(new Decimal(m[2]!)), amount: null };
    const n = subject.match(/(\d+)\s*[:/]\s*(\d+)/);
    return {
      type: 'SPLIT',
      ratio: n ? new Decimal(n[1]!).div(new Decimal(n[2]!)) : null,
      amount: null,
    };
  }
  if (s.includes('rights')) {
    const m = subject.match(/(\d+)\s*[:/]\s*(\d+)/);
    return {
      type: 'RIGHTS',
      ratio: m ? new Decimal(m[1]!).div(new Decimal(m[2]!)) : null,
      amount: null,
    };
  }
  if (s.includes('buyback') || s.includes('buy back')) return { type: 'BUYBACK', ratio: null, amount: null };
  if (s.includes('merger') || s.includes('amalgamation')) return { type: 'MERGER', ratio: null, amount: null };
  if (s.includes('demerger') || s.includes('de-merger')) return { type: 'DEMERGER', ratio: null, amount: null };
  return { type: 'DIVIDEND', ratio: null, amount: null };
}

export function parseCorpActionsCsv(text: string): CorpActionRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]!).map((h) => h.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  const idx = (k: string) => header.findIndex((h) => h === k.replace(/[^A-Z0-9]/g, ''));

  const iSymbol = idx('SYMBOL');
  const iSeries = idx('SERIES');
  const iCompany = idx('COMPANY') !== -1 ? idx('COMPANY') : idx('COMPANYNAME');
  const iSubject = idx('PURPOSE') !== -1 ? idx('PURPOSE') : idx('SUBJECT');
  const iExDate = idx('EXDATE');
  const iRecord = idx('RECORDDATE');

  const rows: CorpActionRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]!);
    const symbol = (c[iSymbol] ?? '').trim();
    const subject = (c[iSubject] ?? '').trim();
    const exDate = parseDdMmmYyyy(c[iExDate] ?? '');
    if (!symbol || !subject || !exDate) continue;
    const cls = classify(subject);
    rows.push({
      symbol,
      series: c[iSeries] ?? 'EQ',
      company: c[iCompany] ?? '',
      subject,
      exDate,
      recordDate: parseDdMmmYyyy(c[iRecord] ?? ''),
      type: cls.type,
      ratio: cls.ratio,
      amount: cls.amount,
      raw: subject,
    });
  }
  return rows;
}

export interface CorpActionLoadResult {
  fetched: number;
  inserted: number;
  skipped: number;
}

export async function loadNseCorporateActions(): Promise<CorpActionLoadResult> {
  logger.info('[CA] fetching NSE corporate actions CSV');
  let text: string;
  try {
    const res = await request(NSE_CA_URL, { method: 'GET', headers: BROWSER_HEADERS, maxRedirections: 5 });
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`NSE CA fetch failed: ${res.statusCode}`);
    }
    text = await res.body.text();
  } catch (err) {
    logger.warn({ err }, '[CA] fetch failed');
    return { fetched: 0, inserted: 0, skipped: 0 };
  }

  const rows = parseCorpActionsCsv(text);
  logger.info({ rowCount: rows.length }, '[CA] parsed corporate actions');

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const stock = await prisma.stockMaster.findUnique({ where: { symbol: row.symbol } });
    if (!stock) {
      skipped++;
      continue;
    }
    const existing = await prisma.corporateAction.findFirst({
      where: {
        stockId: stock.id,
        type: row.type,
        exDate: row.exDate,
      },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.corporateAction.create({
      data: {
        stockId: stock.id,
        type: row.type,
        exDate: row.exDate,
        ratio: row.ratio,
        amount: row.amount,
        details: {
          subject: row.subject,
          recordDate: row.recordDate?.toISOString() ?? null,
          company: row.company,
          series: row.series,
        },
      },
    });
    inserted++;
  }

  logger.info({ inserted, skipped }, '[CA] load complete');
  return { fetched: rows.length, inserted, skipped };
}
