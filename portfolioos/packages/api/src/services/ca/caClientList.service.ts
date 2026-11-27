import type { ClientFilingStatus } from '@prisma/client';
import type { Request } from 'express';
import { prisma, runInTransaction } from '../../lib/prisma.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { recordCaAudit } from './caAudit.service.js';

/**
 * The CA's client list, built for a practice of hundreds: who the client is
 * (name, email, masked PAN), what the grant lets the CA do, and where their
 * income-tax return stands for the year in season, with its due date.
 *
 * Read under the caller's own context: the Client and ClientFiling policies
 * already limit rows to grants the caller holds. Fields are listed one by
 * one — the raw Client row carries invitation tokens and encrypted PAN, none
 * of which belongs in a list.
 */

export const FILING_STATUSES = [
  'NOT_STARTED',
  'DOCS_PENDING',
  'IN_PROGRESS',
  'READY_FOR_REVIEW',
  'FILED',
  'VERIFIED',
] as const satisfies readonly ClientFilingStatus[];

export const FILING_STATUS_LABEL: Record<ClientFilingStatus, string> = {
  NOT_STARTED: 'Not started',
  DOCS_PENDING: 'Documents pending',
  IN_PROGRESS: 'In progress',
  READY_FOR_REVIEW: 'Ready for review',
  FILED: 'Filed',
  VERIFIED: 'Verified',
};

const ITR_FORMS = ['ITR-1', 'ITR-2', 'ITR-3', 'ITR-4'] as const;
const FY_PATTERN = /^(\d{4})-(\d{2})$/;

function parseFy(fy: string): number {
  const m = FY_PATTERN.exec(fy);
  if (!m || (Number.parseInt(m[1]!, 10) + 1) % 100 !== Number.parseInt(m[2]!, 10)) {
    throw new BadRequestError('Financial year must look like 2025-26.');
  }
  return Number.parseInt(m[1]!, 10);
}

/**
 * The statutory due date for an individual's return for financial year `fy`:
 * 31 July after the year ends, 31 October when a tax audit applies. CBDT
 * extensions are announced year by year and are not modelled here.
 */
export function itrDueDate(fy: string, auditApplicable: boolean): string {
  const endYear = parseFy(fy) + 1;
  return `${endYear}-${auditApplicable ? '10-31' : '07-31'}`;
}

/** The financial year whose return is in season on `now` (IST): the year that ended last March. */
export function currentFilingYear(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y - 1 : y - 2;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

const DAY_MS = 86_400_000;

function daysUntil(isoDate: string, now: Date): number {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  const today = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  return Math.round((Date.parse(`${isoDate}T00:00:00Z`) - today) / DAY_MS);
}

export interface ClientOverviewRow {
  clientId: string;
  name: string;
  email: string | null;
  /** "XXXXXX234F" — never the full PAN. Null when none is on record. */
  panMasked: string | null;
  access: 'VIEW' | 'PARTIAL' | 'FULL';
  accessUntil: string | null;
  filing: {
    financialYear: string;
    status: ClientFilingStatus;
    itrForm: string | null;
    auditApplicable: boolean;
    filedOn: string | null;
    dueDate: string;
    /** Negative once past due. Null once filed. */
    daysLeft: number | null;
  };
}

export interface ClientOverview {
  fy: string;
  rows: ClientOverviewRow[];
  total: number;
  page: number;
  limit: number;
  /** Return status counts across every active client, before search or filter. */
  counts: Record<ClientFilingStatus, number>;
}

export interface ClientOverviewQuery {
  fy?: string;
  q?: string;
  status?: ClientFilingStatus;
  sort?: 'due' | 'name' | 'status';
  page?: number;
  limit?: number;
}

const MAX_LIMIT = 200;

async function overviewRows(callerId: string, fy: string, now: Date): Promise<ClientOverviewRow[]> {
  const clients = await prisma.client.findMany({
    where: { advisorId: callerId, status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      email: true,
      panLast4: true,
      initiatedBy: true,
      accessUntil: true,
      canEditBooks: true,
      canEditTransactions: true,
      canEditImports: true,
      canEditFmv: true,
      clientUser: { select: { name: true, email: true, panLast4: true } },
      filings: { where: { financialYear: fy } },
    },
  });

  return clients.map((c) => {
    const shown =
      c.initiatedBy === 'CLIENT' && c.clientUser
        ? { name: c.clientUser.name || c.clientUser.email, email: c.clientUser.email }
        : { name: c.name, email: c.email };
    const last4 = c.clientUser?.panLast4 ?? c.panLast4;
    const flags = [c.canEditBooks, c.canEditTransactions, c.canEditImports, c.canEditFmv];
    const f = c.filings[0];
    const status = f?.status ?? 'NOT_STARTED';
    const auditApplicable = f?.auditApplicable ?? false;
    const dueDate = itrDueDate(fy, auditApplicable);
    const done = status === 'FILED' || status === 'VERIFIED';
    return {
      clientId: c.id,
      name: shown.name,
      email: shown.email,
      panMasked: last4 ? `XXXXXX${last4}` : null,
      access: flags.every(Boolean) ? 'FULL' : flags.some(Boolean) ? 'PARTIAL' : 'VIEW',
      accessUntil: c.accessUntil ? c.accessUntil.toISOString().slice(0, 10) : null,
      filing: {
        financialYear: fy,
        status,
        itrForm: f?.itrForm ?? null,
        auditApplicable,
        filedOn: f?.filedOn ? f.filedOn.toISOString().slice(0, 10) : null,
        dueDate,
        daysLeft: done ? null : daysUntil(dueDate, now),
      },
    };
  });
}

const STATUS_ORDER = new Map<ClientFilingStatus, number>(FILING_STATUSES.map((s, i) => [s, i]));

const byName = (a: ClientOverviewRow, b: ClientOverviewRow) => a.name.localeCompare(b.name, 'en-IN');

function sortRows(rows: ClientOverviewRow[], sort: 'due' | 'name' | 'status'): ClientOverviewRow[] {
  return [...rows].sort((a, b) => {
    if (sort === 'name') return byName(a, b);
    if (sort === 'status') {
      return STATUS_ORDER.get(a.filing.status)! - STATUS_ORDER.get(b.filing.status)! || byName(a, b);
    }
    // Due: what still needs filing first, soonest (or most overdue) first.
    const ad = a.filing.daysLeft ?? Number.POSITIVE_INFINITY;
    const bd = b.filing.daysLeft ?? Number.POSITIVE_INFINITY;
    return ad - bd || byName(a, b);
  });
}

export async function listClientOverview(
  callerId: string,
  query: ClientOverviewQuery = {},
  now: Date = new Date(),
): Promise<ClientOverview> {
  const fy = query.fy ?? currentFilingYear(now);
  parseFy(fy);
  const limit = Math.min(Math.max(1, query.limit ?? 50), MAX_LIMIT);
  const page = Math.max(1, query.page ?? 1);

  const all = await overviewRows(callerId, fy, now);
  const counts = Object.fromEntries(FILING_STATUSES.map((s) => [s, 0])) as Record<ClientFilingStatus, number>;
  for (const r of all) counts[r.filing.status] += 1;

  const needle = (query.q ?? '').trim().toLowerCase();
  let rows = all.filter(
    (r) =>
      (!query.status || r.filing.status === query.status) &&
      (!needle ||
        r.name.toLowerCase().includes(needle) ||
        (r.email ?? '').toLowerCase().includes(needle) ||
        (r.panMasked ?? '').toLowerCase().includes(needle)),
  );

  rows = sortRows(rows, query.sort ?? 'due');

  return { fy, rows: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, limit, counts };
}

export interface FilingPatch {
  status?: ClientFilingStatus;
  itrForm?: string | null;
  auditApplicable?: boolean;
  /** YYYY-MM-DD; null clears it. */
  filedOn?: string | null;
}

/** The CA on an active grant records where this client's return stands for `fy`. */
export async function setClientFiling(
  callerId: string,
  clientId: string,
  fy: string,
  patch: FilingPatch,
  req?: Request,
): Promise<void> {
  parseFy(fy);
  if (patch.status !== undefined && !(FILING_STATUSES as readonly string[]).includes(patch.status)) {
    throw new BadRequestError('Unknown return status.');
  }
  if (patch.itrForm != null && !(ITR_FORMS as readonly string[]).includes(patch.itrForm)) {
    throw new BadRequestError('ITR form must be ITR-1, ITR-2, ITR-3 or ITR-4.');
  }
  if (patch.filedOn != null && !/^\d{4}-\d{2}-\d{2}$/.test(patch.filedOn)) {
    throw new BadRequestError('Filed on must be a date (YYYY-MM-DD).');
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, advisorId: true, userId: true, status: true },
  });
  if (!client) throw new NotFoundError('Client not found.');
  if (client.advisorId !== callerId) throw new ForbiddenError('That client is not yours.');
  if (client.status !== 'ACTIVE') throw new BadRequestError('This engagement is not active.');

  const data = {
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    ...(patch.itrForm !== undefined ? { itrForm: patch.itrForm } : {}),
    ...(patch.auditApplicable !== undefined ? { auditApplicable: patch.auditApplicable } : {}),
    ...(patch.filedOn !== undefined ? { filedOn: patch.filedOn ? new Date(`${patch.filedOn}T00:00:00Z`) : null } : {}),
  };

  await runInTransaction(async (tx) => {
    const before = await tx.clientFiling.findUnique({
      where: { clientId_financialYear: { clientId, financialYear: fy } },
    });
    const row = await tx.clientFiling.upsert({
      where: { clientId_financialYear: { clientId, financialYear: fy } },
      create: { clientId, financialYear: fy, ...data },
      update: data,
    });
    if (patch.status !== undefined && before?.status !== row.status) {
      await recordCaAudit(
        tx,
        { actorUserId: callerId, subjectUserId: client.userId ?? callerId, clientId, req },
        {
          action: 'FILING_STATUS_CHANGED',
          resourceType: 'ClientFiling',
          resourceId: row.id,
          summary: `Your CA marked your FY ${fy} income-tax return as ${FILING_STATUS_LABEL[row.status].toLowerCase()}.`,
          before: before ? FILING_STATUS_LABEL[before.status] : FILING_STATUS_LABEL.NOT_STARTED,
        },
      );
    }
  });
}

const ACCESS_LABEL = { VIEW: 'View only', PARTIAL: 'Some changes', FULL: 'Keep the books' } as const;

function csvCell(v: string | null): string {
  const s = v ?? '';
  // Quote anything with a comma, quote or newline; neutralise a leading
  // formula character so a spreadsheet never runs a name as a formula.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The whole list for `fy` as CSV, PAN masked. Ordered by due date. */
export async function clientOverviewCsv(callerId: string, fy: string, now: Date = new Date()): Promise<string> {
  parseFy(fy);
  const all = sortRows(await overviewRows(callerId, fy, now), 'due');
  const header = 'Client,Email,PAN,Access,Return status,ITR form,Due date,Filed on';
  const lines = all.map((r) =>
    [
      r.name,
      r.email,
      r.panMasked,
      ACCESS_LABEL[r.access],
      FILING_STATUS_LABEL[r.filing.status],
      r.filing.itrForm,
      r.filing.dueDate,
      r.filing.filedOn,
    ]
      .map(csvCell)
      .join(','),
  );
  return [header, ...lines].join('\n') + '\n';
}
