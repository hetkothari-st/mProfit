import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok, noContent } from '../lib/response.js';
import { writeAuditLog } from '../lib/audit.js';
import {
  FILING_STATUSES,
  clientOverviewCsv,
  currentFilingYear,
  listClientOverview,
  setClientFiling,
} from '../services/ca/caClientList.service.js';

const overviewQuery = z.object({
  fy: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  q: z.string().max(100).optional(),
  status: z.enum(FILING_STATUSES).optional(),
  sort: z.enum(['due', 'name', 'status']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** GET /api/ca/clients/overview — the client list with each return's status and due date. */
export async function clientOverviewHandler(req: Request, res: Response): Promise<void> {
  const query = overviewQuery.parse(req.query);
  ok(res, await listClientOverview(req.user!.id, query));
}

const filingBody = z.object({
  status: z.enum(FILING_STATUSES).optional(),
  itrForm: z.enum(['ITR-1', 'ITR-2', 'ITR-3', 'ITR-4']).nullable().optional(),
  auditApplicable: z.boolean().optional(),
  filedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/** PUT /api/ca/clients/:clientId/filings/:fy — record where this client's return stands. */
export async function setClientFilingHandler(req: Request, res: Response): Promise<void> {
  const fy = z.string().regex(/^\d{4}-\d{2}$/).parse(req.params.fy);
  await setClientFiling(req.user!.id, String(req.params.clientId), fy, filingBody.parse(req.body), req);
  noContent(res);
}

/** GET /api/ca/clients/overview.csv — the whole list, PAN masked. Recorded as a data export. */
export async function clientOverviewCsvHandler(req: Request, res: Response): Promise<void> {
  const fy = z.string().regex(/^\d{4}-\d{2}$/).optional().parse(req.query.fy) ?? currentFilingYear();
  const csv = await clientOverviewCsv(req.user!.id, fy);
  await writeAuditLog({
    userId: req.user!.id,
    action: 'data_export',
    resource: 'CaClientList',
    metadata: { financialYear: fy, rows: csv.split('\n').length - 2 },
    req,
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="clients-fy-${fy}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(csv);
}
