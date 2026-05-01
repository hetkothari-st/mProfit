/**
 * NSE F&O EOD bhavcopy fetcher.
 *
 * URL pattern (post-2023):
 *   https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_<DDMMYYYY>_F_0000.csv.zip
 *
 * Columns of interest (UDiFF format):
 *   TckrSymb, FinInstrmTp (FUTSTK/FUTIDX/OPTSTK/OPTIDX), XpryDt (DD-MM-YYYY),
 *   StrkPric, OptnTp (CE/PE), OpnPric, HghPric, LwPric, ClsPric, SttlmPric,
 *   OpnIntrst, TtlTradgVol
 *
 * Populates `FoContractPrice`, upserting on (instrumentId, tradeDate). Fails
 * gracefully when bhavcopy is not yet published (pre-4:30pm IST or holidays).
 */

import { request } from 'undici';
import * as zlib from 'node:zlib';
import { Decimal } from 'decimal.js';
import type { FoInstrumentType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { ensureFoInstrument, buildFutTradingSymbol, buildOptionTradingSymbol } from './nseFoMaster.service.js';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function fmtDdMmYyyy(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}${mm}${yyyy}`;
}

function bhavcopyUrl(d: Date): string {
  return `https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${fmtDdMmYyyy(d)}_F_0000.csv.zip`;
}

async function fetchZipText(url: string): Promise<string | null> {
  const res = await request(url, {
    method: 'GET',
    headers: { 'user-agent': BROWSER_UA, accept: 'application/zip,*/*' },
    bodyTimeout: 60_000,
    headersTimeout: 20_000,
  });
  if (res.statusCode !== 200) {
    await res.body.dump();
    return null;
  }
  const buf = Buffer.from(await res.body.arrayBuffer());
  // Single-file ZIP — strip the local file header and inflate the entry.
  return await unzipFirstEntry(buf);
}

async function unzipFirstEntry(buf: Buffer): Promise<string> {
  // Minimal ZIP reader: find the local file header signature 0x04034b50.
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('not a ZIP');
  const compMethod = buf.readUInt16LE(8);
  const compSize = buf.readUInt32LE(18);
  const fnLen = buf.readUInt16LE(26);
  const exLen = buf.readUInt16LE(28);
  const dataStart = 30 + fnLen + exLen;
  const compressed = buf.subarray(dataStart, dataStart + compSize);
  if (compMethod === 0) return compressed.toString('utf8');
  if (compMethod === 8) return new Promise((resolve, reject) => {
    zlib.inflateRaw(compressed, (err, out) => (err ? reject(err) : resolve(out.toString('utf8'))));
  });
  throw new Error(`unsupported zip compression method ${compMethod}`);
}

interface BhavRow {
  symbol: string;
  instrumentType: FoInstrumentType;
  strikePrice: string | null;
  expiryDate: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  settlement: string;
  oi: string;
  volume: string;
}

function parseBhavCsv(csv: string): BhavRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0]!.split(',').map((h) => h.trim());
  const idx = (name: string): number => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  const ix = {
    sym: idx('TckrSymb'),
    type: idx('FinInstrmTp'),
    expiry: idx('XpryDt'),
    strike: idx('StrkPric'),
    optType: idx('OptnTp'),
    open: idx('OpnPric'),
    high: idx('HghPric'),
    low: idx('LwPric'),
    close: idx('ClsPric'),
    settle: idx('SttlmPric'),
    oi: idx('OpnIntrst'),
    vol: idx('TtlTradgVol'),
  };
  const rows: BhavRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i]!.split(',');
    const sym = cols[ix.sym]?.trim();
    const type = cols[ix.type]?.trim();
    if (!sym || !type) continue;
    const isOption = type.startsWith('OPT');
    const isFuture = type.startsWith('FUT');
    if (!isOption && !isFuture) continue;
    const optType = cols[ix.optType]?.trim();
    const strike = cols[ix.strike]?.trim();
    const expiryRaw = cols[ix.expiry]?.trim();
    if (!expiryRaw) continue;
    // Format may be DD-MM-YYYY or YYYY-MM-DD
    let expiryDate: Date;
    if (/^\d{2}-\d{2}-\d{4}$/.test(expiryRaw)) {
      const [d, m, y] = expiryRaw.split('-');
      expiryDate = new Date(`${y}-${m}-${d}T00:00:00.000Z`);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(expiryRaw)) {
      expiryDate = new Date(`${expiryRaw}T00:00:00.000Z`);
    } else continue;

    const instrumentType: FoInstrumentType = isFuture
      ? 'FUTURES'
      : optType === 'PE'
        ? 'PUT'
        : 'CALL';

    rows.push({
      symbol: sym.toUpperCase(),
      instrumentType,
      strikePrice: isFuture ? null : (strike && strike !== '0' ? strike : '0'),
      expiryDate,
      open: cols[ix.open] ?? '0',
      high: cols[ix.high] ?? '0',
      low: cols[ix.low] ?? '0',
      close: cols[ix.close] ?? '0',
      settlement: cols[ix.settle] ?? cols[ix.close] ?? '0',
      oi: cols[ix.oi] ?? '0',
      volume: cols[ix.vol] ?? '0',
    });
  }
  return rows;
}

export async function loadNseFoBhavcopy(date?: Date): Promise<{
  date: string;
  rowsParsed: number;
  upserted: number;
  skipped: number;
}> {
  const target = date ?? mostRecentWeekday();
  const url = bhavcopyUrl(target);
  logger.info({ url }, '[nseFoBhavcopy] fetching');
  const csv = await fetchZipText(url);
  if (!csv) {
    logger.warn({ url }, '[nseFoBhavcopy] not available — likely market not closed yet');
    return {
      date: target.toISOString().slice(0, 10),
      rowsParsed: 0,
      upserted: 0,
      skipped: 0,
    };
  }

  const rows = parseBhavCsv(csv);
  let upserted = 0;
  let skipped = 0;

  for (const r of rows) {
    try {
      // Resolve instrument; create minimal row if master hasn't seen it.
      // Lot size = 1 placeholder when unknown; weekly master sync corrects.
      const tradingSymbol =
        r.instrumentType === 'FUTURES'
          ? buildFutTradingSymbol(r.symbol, r.expiryDate)
          : buildOptionTradingSymbol(
              r.symbol,
              r.expiryDate,
              r.instrumentType === 'CALL' ? 'CE' : 'PE',
              r.strikePrice ?? 0,
            );

      let inst = await prisma.foInstrument.findUnique({ where: { tradingSymbol } });
      if (!inst) {
        inst = await ensureFoInstrument({
          underlying: r.symbol,
          instrumentType: r.instrumentType,
          strikePrice: r.strikePrice,
          expiryDate: r.expiryDate,
          lotSize: 1,
        });
      }

      await prisma.foContractPrice.upsert({
        where: { instrumentId_tradeDate: { instrumentId: inst.id, tradeDate: target } },
        create: {
          instrumentId: inst.id,
          tradeDate: target,
          openPrice: r.open,
          highPrice: r.high,
          lowPrice: r.low,
          closePrice: r.close,
          settlementPrice: r.settlement,
          openInterest: r.oi,
          volume: r.volume,
        },
        update: {
          openPrice: r.open,
          highPrice: r.high,
          lowPrice: r.low,
          closePrice: r.close,
          settlementPrice: r.settlement,
          openInterest: r.oi,
          volume: r.volume,
        },
      });
      upserted += 1;
    } catch (err) {
      logger.warn({ err, sym: r.symbol }, '[nseFoBhavcopy] row upsert failed');
      skipped += 1;
    }
  }

  return {
    date: target.toISOString().slice(0, 10),
    rowsParsed: rows.length,
    upserted,
    skipped,
  };
}

function mostRecentWeekday(): Date {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
  // If weekend, roll back to Friday.
  const dow = d.getUTCDay();
  if (dow === 0) d.setUTCDate(d.getUTCDate() - 2);
  else if (dow === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

const _money = (s: string): Decimal => new Decimal(s); // referenced by tests
export { _money };
