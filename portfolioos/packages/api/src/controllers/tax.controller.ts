import type { Request, Response } from 'express';
import { ok } from '../lib/response.js';
import { BadRequestError } from '../lib/errors.js';
import {
  buildTaxSummary,
  userStcgReport,
  userLtcgReport,
  userIntradayReport,
  userSchedule112AReport,
  userSchedule112Report,
  userIncomeReport,
  schedule112ACsv,
  taxHarvestReport,
} from '../services/tax.service.js';
import { buildSchedule43Report } from '../services/reports/schedule43.report.js';

function getFy(req: Request, required = false): string | undefined {
  const fy = (req.query.fy as string | undefined)?.trim();
  if (required && !fy) throw new BadRequestError('fy query param required (e.g. 2024-25)');
  return fy || undefined;
}

export async function getTaxSummary(req: Request, res: Response) {
  const fy = getFy(req, true)!;
  const userId = req.user!.id;
  const data = await buildTaxSummary(userId, fy);
  ok(res, data);
}

export async function getUserStcg(req: Request, res: Response) {
  const data = await userStcgReport(req.user!.id, getFy(req));
  ok(res, data);
}

export async function getUserLtcg(req: Request, res: Response) {
  const data = await userLtcgReport(req.user!.id, getFy(req));
  ok(res, data);
}

export async function getUserIntraday(req: Request, res: Response) {
  const data = await userIntradayReport(req.user!.id, getFy(req));
  ok(res, data);
}

export async function getUserSchedule112A(req: Request, res: Response) {
  const data = await userSchedule112AReport(req.user!.id, getFy(req));
  ok(res, data);
}

export async function getUserSchedule112(req: Request, res: Response) {
  const data = await userSchedule112Report(req.user!.id, getFy(req));
  ok(res, data);
}

export async function getUserIncome(req: Request, res: Response) {
  const data = await userIncomeReport(req.user!.id, getFy(req));
  ok(res, data);
}

export async function getUserSchedule43(req: Request, res: Response) {
  const fy = getFy(req, true)!;
  const data = await buildSchedule43Report(req.user!.id, fy);
  ok(res, data);
}

export async function getTaxHarvest(req: Request, res: Response) {
  const data = await taxHarvestReport(req.user!.id, getFy(req));
  ok(res, data);
}

export async function downloadSchedule112ACsv(req: Request, res: Response) {
  const fy = getFy(req, true)!;
  const csv = await schedule112ACsv(req.user!.id, fy);
  const filename = `schedule-112a-${fy}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}
