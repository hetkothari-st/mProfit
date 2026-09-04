import type { Request, Response } from 'express';
import { ok } from '../lib/response.js';
import { BadRequestError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
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
  availableTaxFys,
} from '../services/tax.service.js';
import { buildSchedule43Report } from '../services/reports/schedule43.report.js';
import { streamCapitalGainsTaxReport } from '../services/reportBuilder/statement/capitalGainsTaxReport.js';
import {
  resolveReportSubjects,
  requireSingleSubject,
} from '../services/reports/reportSubjects.js';
import { runAsUser } from '../lib/requestContext.js';

/**
 * Whose tax position this request is about.
 *
 * Everything on this page is filing-shaped — one assessee's gains, one
 * assessee's Schedule 112A — so a household version is refused rather than
 * merged: a combined return is not a valid filing for anybody. Naming a
 * single member is supported, and the on-screen figures follow the same
 * selection as the download, so the table and the file can never disagree.
 */
async function taxSubject(req: Request): Promise<string> {
  const resolved = await resolveReportSubjects(req);
  return requireSingleSubject(resolved, 'A tax report').userId;
}

/** Run a tax read as the member it is about, so RLS returns their rows. */
async function asSubject<T>(req: Request, fn: (userId: string) => Promise<T>): Promise<T> {
  const userId = await taxSubject(req);
  return runAsUser(userId, () => fn(userId));
}

function getFy(req: Request, required = false): string | undefined {
  const fy = (req.query.fy as string | undefined)?.trim();
  if (required && !fy) throw new BadRequestError('fy query param required (e.g. 2024-25)');
  return fy || undefined;
}

export async function getTaxSummary(req: Request, res: Response) {
  const fy = getFy(req, true)!;
  const data = await asSubject(req, (userId) => buildTaxSummary(userId, fy));
  ok(res, data);
}

export async function getAvailableFys(req: Request, res: Response) {
  const fys = await availableTaxFys(req.user!.id);
  ok(res, { fys });
}

export async function getUserStcg(req: Request, res: Response) {
  const data = await asSubject(req, (userId) => userStcgReport(userId, getFy(req)));
  ok(res, data);
}

export async function getUserLtcg(req: Request, res: Response) {
  const data = await asSubject(req, (userId) => userLtcgReport(userId, getFy(req)));
  ok(res, data);
}

export async function getUserIntraday(req: Request, res: Response) {
  const data = await asSubject(req, (userId) => userIntradayReport(userId, getFy(req)));
  ok(res, data);
}

export async function getUserSchedule112A(req: Request, res: Response) {
  const data = await asSubject(req, (userId) => userSchedule112AReport(userId, getFy(req)));
  ok(res, data);
}

export async function getUserSchedule112(req: Request, res: Response) {
  const data = await asSubject(req, (userId) => userSchedule112Report(userId, getFy(req)));
  ok(res, data);
}

export async function getUserIncome(req: Request, res: Response) {
  const data = await asSubject(req, (userId) => userIncomeReport(userId, getFy(req)));
  ok(res, data);
}

export async function getUserSchedule43(req: Request, res: Response) {
  const fy = getFy(req, true)!;
  const data = await asSubject(req, (userId) => buildSchedule43Report(userId, fy));
  ok(res, data);
}

export async function getTaxHarvest(req: Request, res: Response) {
  const data = await asSubject(req, (userId) => taxHarvestReport(userId, getFy(req)));
  ok(res, data);
}

export async function downloadSchedule112ACsv(req: Request, res: Response) {
  const fy = getFy(req, true)!;
  // schedule112ACsv now populates the FMV column (Sec 55(2)(ac) grandfathering)
  // internally via fmvOverride.service.ts — no separate enrichment needed here.
  const csv = await asSubject(req, (userId) => schedule112ACsv(userId, fy));
  const filename = `schedule-112a-${fy}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

export async function downloadCapitalGainsTaxReport(req: Request, res: Response) {
  const fy = getFy(req, true)!;
  const userId = await taxSubject(req);

  const portfolioIds = req.query.portfolioIds
    ? String(req.query.portfolioIds).split(',').filter(Boolean)
    : [];

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, pan: true },
  });

  await runAsUser(userId, () =>
    streamCapitalGainsTaxReport(res, {
      userId,
      portfolioIds,
      fy,
      userName: user?.name ?? undefined,
      pan: user?.pan ?? undefined,
    }),
  );
}
