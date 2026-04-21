import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import type { Parser, ParserContext, ParserResult, ParsedTransaction } from './types.js';
import type { AssetClass, Exchange, TransactionType } from '@prisma/client';
import { logger } from '../../../lib/logger.js';

function normKey(k: string): string {
  return k.toLowerCase().trim().replace(/[\s_-]+/g, '');
}

const ALIASES: Record<string, string[]> = {
  symbol: ['symbol', 'tradingsymbol', 'scrip', 'ticker', 'nsecode', 'code'],
  isin: ['isin', 'isincode', 'isinnumber'],
  exchange: ['exchange', 'exch'],
  schemecode: ['schemecode', 'amfischemecode', 'scheme'],
  schemename: ['schemename', 'fundname'],
  amcname: ['amcname', 'amc', 'fundhouse'],
  assetname: ['assetname', 'name', 'companyname', 'instrumentname'],
  tradedate: ['tradedate', 'date', 'transactiondate', 'txndate'],
  quantity: ['quantity', 'qty', 'units'],
  price: ['price', 'rate', 'nav', 'unitprice', 'buyprice', 'sellprice'],
  brokerage: ['brokerage', 'commission'],
  stt: ['stt', 'securitiestransactiontax'],
  stampduty: ['stampduty', 'stamp'],
  exchangecharges: ['exchangecharges', 'exchfee', 'exchangefee', 'transactioncharges'],
  gst: ['gst', 'tax'],
  sebicharges: ['sebicharges', 'sebi'],
  othercharges: ['othercharges', 'other'],
  assetclass: ['assetclass', 'class', 'type', 'category', 'instrumenttype'],
  transactiontype: ['transactiontype', 'txntype', 'buysell', 'side', 'action'],
  broker: ['broker', 'brokername'],
  orderno: ['orderno', 'ordernumber', 'orderid'],
  tradeno: ['tradeno', 'tradenumber', 'tradeid'],
};

function pick(row: Record<string, string>, key: keyof typeof ALIASES): string | undefined {
  const keys = ALIASES[key] ?? [];
  for (const k of keys) {
    for (const [rk, rv] of Object.entries(row)) {
      if (normKey(rk) === k && rv?.trim()) return rv.trim();
    }
  }
  return undefined;
}

function asNumber(v: string | undefined, def = 0): number {
  if (!v) return def;
  const cleaned = v.replace(/[₹,\s]/g, '').replace(/\(([^)]+)\)/, '-$1');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : def;
}

function parseDate(s: string | undefined): string | null {
  if (!s) return null;
  const str = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const ddmmyyyy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]!.padStart(2, '0')}-${ddmmyyyy[1]!.padStart(2, '0')}`;
  const ddmmmyyyy = str.match(/^(\d{1,2})[-/]([A-Za-z]{3})[-/](\d{4})$/);
  if (ddmmmyyyy) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const mo = months[ddmmmyyyy[2]!.toLowerCase()];
    if (mo) return `${ddmmmyyyy[3]}-${mo}-${ddmmmyyyy[1]!.padStart(2, '0')}`;
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

function inferAssetClass(row: Record<string, string>): AssetClass {
  const explicit = pick(row, 'assetclass');
  if (explicit) {
    const u = explicit.toUpperCase().replace(/\s+/g, '_');
    if (['EQUITY', 'FUTURES', 'OPTIONS', 'MUTUAL_FUND', 'ETF', 'BOND', 'FIXED_DEPOSIT', 'GOLD_BOND', 'GOLD_ETF', 'REIT', 'INVIT', 'CRYPTOCURRENCY', 'CASH', 'OTHER'].includes(u)) {
      return u as AssetClass;
    }
  }
  if (pick(row, 'schemecode') || pick(row, 'schemename')) return 'MUTUAL_FUND';
  if (pick(row, 'symbol')) return 'EQUITY';
  return 'OTHER';
}

function inferTransactionType(row: Record<string, string>): TransactionType {
  const raw = (pick(row, 'transactiontype') ?? '').toUpperCase().replace(/\s+/g, '_');
  const map: Record<string, TransactionType> = {
    B: 'BUY',
    BUY: 'BUY',
    PURCHASE: 'BUY',
    S: 'SELL',
    SELL: 'SELL',
    SALE: 'SELL',
    REDEMPTION: 'REDEMPTION',
    SWITCHIN: 'SWITCH_IN',
    SWITCH_IN: 'SWITCH_IN',
    SWITCHOUT: 'SWITCH_OUT',
    SWITCH_OUT: 'SWITCH_OUT',
    SIP: 'SIP',
    BONUS: 'BONUS',
    SPLIT: 'SPLIT',
    DIVIDEND: 'DIVIDEND_PAYOUT',
    DIVIDEND_REINVEST: 'DIVIDEND_REINVEST',
    RIGHTS: 'RIGHTS_ISSUE',
    RIGHTS_ISSUE: 'RIGHTS_ISSUE',
    MATURITY: 'MATURITY',
  };
  return map[raw] ?? 'BUY';
}

export const genericCsvParser: Parser = {
  name: 'generic-csv',

  async canHandle(ctx: ParserContext, sample) {
    const lower = ctx.fileName.toLowerCase();
    return lower.endsWith('.csv') || lower.endsWith('.tsv');
  },

  async parse(ctx): Promise<ParserResult> {
    const buf = await readFile(ctx.filePath);
    const text = buf.toString('utf8');
    const sep = ctx.fileName.toLowerCase().endsWith('.tsv') ? '\t' : ',';

    let rows: Record<string, string>[] = [];
    try {
      rows = parse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        delimiter: sep,
      }) as Record<string, string>[];
    } catch (err) {
      logger.warn({ err }, '[genericCsv] parse failed');
      return {
        transactions: [],
        warnings: [`CSV parse failed: ${(err as Error).message}`],
      };
    }

    const txs: ParsedTransaction[] = [];
    const warnings: string[] = [];

    for (const [i, row] of rows.entries()) {
      const tradeDate = parseDate(pick(row, 'tradedate'));
      const quantity = asNumber(pick(row, 'quantity'));
      const price = asNumber(pick(row, 'price'));

      if (!tradeDate || quantity <= 0 || price < 0) {
        warnings.push(`Row ${i + 2}: skipped (missing/invalid date or quantity)`);
        continue;
      }

      txs.push({
        assetClass: inferAssetClass(row),
        transactionType: inferTransactionType(row),
        symbol: pick(row, 'symbol'),
        isin: pick(row, 'isin'),
        exchange: pick(row, 'exchange')?.toUpperCase() as Exchange | undefined,
        stockName: pick(row, 'assetname'),
        schemeCode: pick(row, 'schemecode'),
        schemeName: pick(row, 'schemename'),
        amcName: pick(row, 'amcname'),
        assetName: pick(row, 'assetname'),
        tradeDate,
        quantity,
        price,
        brokerage: asNumber(pick(row, 'brokerage')),
        stt: asNumber(pick(row, 'stt')),
        stampDuty: asNumber(pick(row, 'stampduty')),
        exchangeCharges: asNumber(pick(row, 'exchangecharges')),
        gst: asNumber(pick(row, 'gst')),
        sebiCharges: asNumber(pick(row, 'sebicharges')),
        otherCharges: asNumber(pick(row, 'othercharges')),
        broker: pick(row, 'broker'),
        orderNo: pick(row, 'orderno'),
        tradeNo: pick(row, 'tradeno'),
      });
    }

    return { transactions: txs, warnings };
  },
};
