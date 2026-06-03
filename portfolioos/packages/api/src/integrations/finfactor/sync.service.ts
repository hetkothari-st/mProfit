/**
 * Project Finvu mutual fund data into PortfolioOS holdings.
 *
 * Pipeline:
 *   1. Resolve a target portfolio for the user (caller picks; falls back
 *      to a "Finvu Imports" portfolio created on first sync).
 *   2. Fetch /mutual-fund/insights and /mutual-fund/user-account-statement
 *      via the Finfactor client (demo mode short-circuits to fixtures).
 *   3. Upsert each scheme into MutualFundMaster by ISIN.
 *   4. Project each Finvu statement row into a Transaction with a
 *      deterministic sourceHash = sha256("finvu:" + txnId). Re-runs are
 *      idempotent — same Finvu txnIds → 0 new rows.
 *   5. Replay holdings projection for every touched assetKey so the
 *      Mutual Funds page picks up the new numbers immediately.
 *
 * The mapping is best-effort — every Finvu row not parseable as BUY /
 * SELL is logged but skipped; we don't fail the whole import on one
 * weird row.
 */

import crypto from 'node:crypto';
import { Decimal as PrismaDecimal } from '@prisma/client/runtime/library';
import type { MFCategory, TransactionType } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { recomputeForAsset } from '../../services/holdingsProjection.js';
import { fetchMfInsights, fetchMfStatement } from './mf.service.js';

const SOURCE_ADAPTER = 'finvu.aa.v1';
const SOURCE_ADAPTER_VER = '1.0.0';
const DEFAULT_PORTFOLIO_NAME = 'Finvu Imports';

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function asStr(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  if (typeof v === 'number') return String(v);
  return null;
}

function asNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pickDate(v: unknown): Date | null {
  const s = asStr(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mapCategory(raw: unknown): MFCategory {
  const c = asStr(raw)?.toUpperCase();
  switch (c) {
    case 'EQUITY':
      return 'EQUITY';
    case 'DEBT':
      return 'DEBT';
    case 'HYBRID':
      return 'HYBRID';
    case 'LIQUID':
      return 'LIQUID';
    case 'ELSS':
      return 'ELSS';
    case 'INDEX_FUND':
    case 'INDEX':
      return 'INDEX_FUND';
    case 'ETF':
      return 'ETF';
    case 'FMP':
      return 'FMP';
    case 'SOLUTION_ORIENTED':
      return 'SOLUTION_ORIENTED';
    default:
      return 'OTHER';
  }
}

function mapTxnType(type: string | null, subType: string | null): TransactionType | null {
  const t = (type ?? '').toUpperCase();
  const st = (subType ?? '').toUpperCase();
  if (t === 'BUY') {
    if (st.includes('SIP')) return 'SIP';
    return 'BUY';
  }
  if (t === 'SELL') {
    if (st.includes('REDEMP')) return 'REDEMPTION';
    return 'SELL';
  }
  if (t === 'SWITCH_IN' || st === 'SWITCH_IN') return 'SWITCH_IN';
  if (t === 'SWITCH_OUT' || st === 'SWITCH_OUT') return 'SWITCH_OUT';
  if (t === 'DIVIDEND_REINVEST' || st.includes('REINVEST')) return 'DIVIDEND_REINVEST';
  if (t === 'DIVIDEND' || st === 'DIVIDEND') return 'DIVIDEND_PAYOUT';
  if (t === 'BONUS') return 'BONUS';
  if (t === 'SPLIT') return 'SPLIT';
  return null;
}

export interface FinvuSyncResult {
  insightsHoldings: number;
  statementRows: number;
  fundsUpserted: number;
  transactionsCreated: number;
  transactionsSkipped: number;
  portfolioId: string;
  portfolioName: string;
  durationMs: number;
}

export async function ensureFinvuPortfolio(userId: string): Promise<{ id: string; name: string }> {
  const existing = await prisma.portfolio.findFirst({
    where: { userId, name: DEFAULT_PORTFOLIO_NAME },
    select: { id: true, name: true },
  });
  if (existing) return existing;
  const created = await prisma.portfolio.create({
    data: {
      userId,
      name: DEFAULT_PORTFOLIO_NAME,
      type: 'INVESTMENT',
      currency: 'INR',
    },
    select: { id: true, name: true },
  });
  return created;
}

export async function syncFinvuMutualFunds(
  userId: string,
  opts: { uniqueIdentifier: string; portfolioId?: string },
): Promise<FinvuSyncResult> {
  const start = Date.now();
  const portfolio = opts.portfolioId
    ? await prisma.portfolio.findFirst({
        where: { id: opts.portfolioId, userId },
        select: { id: true, name: true },
      })
    : await ensureFinvuPortfolio(userId);
  if (!portfolio) throw new Error('Target portfolio not found / not owned by user');

  const [insights, statement] = await Promise.all([
    fetchMfInsights({ uniqueIdentifier: opts.uniqueIdentifier }),
    fetchMfStatement({ uniqueIdentifier: opts.uniqueIdentifier, txnOrder: 'ASC' }),
  ]);

  const holdings = Array.isArray((insights as Record<string, unknown>)['holdings'])
    ? ((insights as Record<string, unknown>)['holdings'] as Array<Record<string, unknown>>)
    : [];
  const txnRows = Array.isArray(statement) ? (statement as Array<Record<string, unknown>>) : [];

  // ── Step 1: upsert MutualFundMaster per scheme ──────────────────────
  const isinToFundId = new Map<string, string>();
  let fundsUpserted = 0;

  for (const h of holdings) {
    const isin = asStr(h['isin']);
    if (!isin) continue;
    const schemeCode = asStr(h['schemeCode']) ?? asStr(h['amfiCode']) ?? isin;
    const schemeName = asStr(h['fundName']) ?? asStr(h['isinDescription']) ?? isin;
    const amcName = asStr(h['amcName']) ?? asStr(h['amc']) ?? 'Unknown AMC';
    const category = mapCategory(h['category']);
    const subCategory = asStr(h['subcategory']);

    const fund = await prisma.mutualFundMaster.upsert({
      where: { schemeCode },
      create: {
        schemeCode,
        schemeName,
        amcName,
        category,
        subCategory: subCategory ?? null,
        isin,
      },
      update: {
        schemeName,
        amcName,
        category,
        subCategory: subCategory ?? null,
        isin,
      },
    });
    isinToFundId.set(isin, fund.id);
    fundsUpserted += 1;
  }

  // Also catch funds referenced only in the statement (statement is the
  // authoritative source of truth for transactions; insights may not list
  // closed positions but statement still has their historical rows).
  for (const r of txnRows) {
    const isin = asStr(r['isin']);
    if (!isin || isinToFundId.has(isin)) continue;
    const schemeCode = asStr(r['amfiCode']) ?? isin;
    const schemeName = asStr(r['isinDescription']) ?? asStr(r['amc']) ?? isin;
    const amcName = asStr(r['amc']) ?? 'Unknown AMC';
    const fund = await prisma.mutualFundMaster.upsert({
      where: { schemeCode },
      create: { schemeCode, schemeName, amcName, category: 'OTHER', isin },
      update: { schemeName, amcName, isin },
    });
    isinToFundId.set(isin, fund.id);
    fundsUpserted += 1;
  }

  // ── Step 2: project statement rows → Transaction (idempotent) ───────
  const touchedAssetKeys = new Set<string>();
  let created = 0;
  let skipped = 0;

  for (const r of txnRows) {
    const isin = asStr(r['isin']);
    const fundId = isin ? isinToFundId.get(isin) ?? null : null;
    const txnIdRaw = asStr(r['txnId']);
    if (!txnIdRaw) {
      skipped += 1;
      continue;
    }
    const sourceHash = sha256(`finvu:${txnIdRaw}`);

    // Idempotency — if we already projected this Finvu txn, move on.
    const exists = await prisma.transaction.findUnique({ where: { sourceHash } });
    if (exists) {
      skipped += 1;
      continue;
    }

    const txType = mapTxnType(asStr(r['type']), asStr(r['subType']));
    if (!txType) {
      skipped += 1;
      logger.warn(
        { txnId: txnIdRaw, type: r['type'], subType: r['subType'] },
        'Finvu sync: skipping unmappable transaction type',
      );
      continue;
    }
    const tradeDate = pickDate(r['transactionDateTime']) ?? pickDate(r['navDate']);
    if (!tradeDate) {
      skipped += 1;
      continue;
    }
    const quantity = asNum(r['units']);
    const price = asNum(r['nav']);
    const amount = asNum(r['amount']);
    if (quantity == null || price == null || amount == null) {
      skipped += 1;
      continue;
    }

    const assetName = asStr(r['isinDescription']) ?? asStr(r['amc']) ?? null;
    const assetKey = isin ? `isin:${isin}` : `name:${sha256((assetName ?? '').toLowerCase().trim())}`;
    const folioNo = asStr(r['folioNo']);
    const totalTax = asNum(r['totalTax']) ?? 0;
    const stampDuty = asNum(r['stampDuty']) ?? 0;
    const txnCharge = asNum(r['txnCharge']) ?? 0;
    const baseNarration = asStr(r['narration']);
    const narration = folioNo
      ? [baseNarration, `Folio ${folioNo}`].filter(Boolean).join(' · ')
      : baseNarration;

    await prisma.transaction.create({
      data: {
        portfolioId: portfolio.id,
        assetClass: 'MUTUAL_FUND',
        transactionType: txType,
        fundId,
        assetName,
        isin,
        assetKey,
        tradeDate,
        quantity: new PrismaDecimal(quantity),
        price: new PrismaDecimal(price),
        grossAmount: new PrismaDecimal(amount),
        netAmount: new PrismaDecimal(amount),
        stt: new PrismaDecimal(0),
        stampDuty: new PrismaDecimal(stampDuty),
        otherCharges: new PrismaDecimal(totalTax + txnCharge),
        narration,
        broker: asStr(r['brokerCode']),
        sourceAdapter: SOURCE_ADAPTER,
        sourceAdapterVer: SOURCE_ADAPTER_VER,
        sourceHash,
      },
    });
    touchedAssetKeys.add(assetKey);
    created += 1;
  }

  // ── Step 3: replay holdings projection ─────────────────────────────
  for (const assetKey of touchedAssetKeys) {
    try {
      await recomputeForAsset(portfolio.id, assetKey);
    } catch (err) {
      logger.error({ err, assetKey }, 'Finvu sync: holding projection failed');
    }
  }

  return {
    insightsHoldings: holdings.length,
    statementRows: txnRows.length,
    fundsUpserted,
    transactionsCreated: created,
    transactionsSkipped: skipped,
    portfolioId: portfolio.id,
    portfolioName: portfolio.name,
    durationMs: Date.now() - start,
  };
}
