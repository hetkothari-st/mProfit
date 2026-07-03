import type { Request, Response } from 'express';
import { Decimal, sumDecimal } from '@portfolioos/shared';
import { ok, noContent } from '../lib/response.js';
import { BadRequestError } from '../lib/errors.js';
import {
  listGrandfatheringRows,
  listUserFmvOverrides,
  upsertUserFmv,
  deleteUserFmv,
  type FmvRecord,
  type GrandfatheringRow,
} from '../services/fmvOverride.service.js';
import { schedule112ACsv } from '../services/tax.service.js';

function getFy(req: Request): string | undefined {
  const fy = (req.query.fy as string | undefined)?.trim();
  return fy || undefined;
}

function getIsinParam(req: Request): string {
  const isin = req.params.isin;
  if (!isin) throw new BadRequestError('isin route param required');
  return isin;
}

function fmvRecordToJson(r: FmvRecord) {
  return {
    isin: r.isin,
    scripName: r.scripName,
    fmvPerUnit: r.fmvPerUnit.toString(),
    source: r.source,
  };
}

function grandfatheringRowToJson(r: GrandfatheringRow) {
  return {
    isin: r.isin,
    assetName: r.assetName,
    buyDate: r.buyDate,
    sellDate: r.sellDate,
    quantity: r.quantity.toString(),
    buyAmount: r.buyAmount.toString(),
    sellAmount: r.sellAmount.toString(),
    gainLoss: r.gainLoss.toString(),
    fmvPerUnit: r.fmvPerUnit?.toString() ?? null,
    fmvSource: r.fmvSource,
    fmvTotalBasis: r.fmvTotalBasis?.toString() ?? null,
    adjustedCostBasis: r.adjustedCostBasis?.toString() ?? null,
    correctedGain: r.correctedGain?.toString() ?? null,
    correctedTaxableGain: r.correctedTaxableGain?.toString() ?? null,
    gainDifference: r.gainDifference?.toString() ?? null,
    needsUserInput: r.needsUserInput,
    financialYear: r.financialYear,
  };
}

export async function getTaxGrandfathering(req: Request, res: Response) {
  const rows = await listGrandfatheringRows(req.user!.id, getFy(req));
  const totalUncorrectedGain = sumDecimal(rows.map((r) => r.gainLoss));
  const totalCorrectedGain = sumDecimal(rows.map((r) => r.correctedGain ?? r.gainLoss));
  const totalTaxSaving = sumDecimal(rows.map((r) => r.gainDifference ?? new Decimal(0)));
  ok(res, {
    rows: rows.map(grandfatheringRowToJson),
    summary: {
      totalCorrectedGain: totalCorrectedGain.toString(),
      totalUncorrectedGain: totalUncorrectedGain.toString(),
      totalTaxSaving: totalTaxSaving.toString(),
    },
    count: rows.length,
  });
}

export async function getFmvOverrides(req: Request, res: Response) {
  const records = await listUserFmvOverrides(req.user!.id);
  ok(res, { records: records.map(fmvRecordToJson), count: records.length });
}

export async function putFmvOverride(req: Request, res: Response) {
  const userId = req.user!.id;
  const isin = getIsinParam(req);
  const { fmvPerUnit, scripName } = req.body as { fmvPerUnit?: unknown; scripName?: unknown };
  if (typeof fmvPerUnit !== 'string') {
    throw new BadRequestError('fmvPerUnit (string) is required');
  }
  if (scripName !== undefined && typeof scripName !== 'string') {
    throw new BadRequestError('scripName must be a string');
  }
  // upsertUserFmv already invalidates the per-user FMV cache and triggers the
  // background FIFO recompute internally.
  const saved = await upsertUserFmv(userId, isin, fmvPerUnit, scripName);
  ok(res, fmvRecordToJson(saved));
}

export async function deleteFmvOverride(req: Request, res: Response) {
  const userId = req.user!.id;
  const isin = getIsinParam(req);
  // deleteUserFmv already invalidates the cache and triggers the background
  // FIFO recompute internally.
  await deleteUserFmv(userId, isin);
  noContent(res);
}

export async function downloadGrandfatheringCsv(req: Request, res: Response) {
  const fy = getFy(req);
  if (!fy) throw new BadRequestError('fy query param required (e.g. 2024-25)');
  const csv = await schedule112ACsv(req.user!.id, fy);
  const filename = `schedule-112a-grandfathering-${fy}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}
