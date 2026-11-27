import { api, unwrap } from './client';
import type { ApiResponse } from '@everypaisa/shared';

export const FILING_STATUSES = [
  'NOT_STARTED',
  'DOCS_PENDING',
  'IN_PROGRESS',
  'READY_FOR_REVIEW',
  'FILED',
  'VERIFIED',
] as const;
export type FilingStatus = (typeof FILING_STATUSES)[number];

export const FILING_STATUS_LABEL: Record<FilingStatus, string> = {
  NOT_STARTED: 'Not started',
  DOCS_PENDING: 'Documents pending',
  IN_PROGRESS: 'In progress',
  READY_FOR_REVIEW: 'Ready for review',
  FILED: 'Filed',
  VERIFIED: 'Verified',
};

export const ITR_FORMS = ['ITR-1', 'ITR-2', 'ITR-3', 'ITR-4'] as const;

export interface ClientOverviewRow {
  clientId: string;
  actingAs?: 'ADVISOR' | 'STAFF';
  name: string;
  email: string | null;
  panMasked: string | null;
  access: 'VIEW' | 'PARTIAL' | 'FULL';
  accessUntil: string | null;
  filing: {
    financialYear: string;
    status: FilingStatus;
    itrForm: string | null;
    auditApplicable: boolean;
    filedOn: string | null;
    dueDate: string;
    daysLeft: number | null;
  };
}

export interface ClientOverview {
  fy: string;
  rows: ClientOverviewRow[];
  total: number;
  page: number;
  limit: number;
  counts: Record<FilingStatus, number>;
}

export interface ClientOverviewParams {
  fy?: string;
  q?: string;
  status?: FilingStatus;
  sort?: 'due' | 'name' | 'status';
  page?: number;
  limit?: number;
}

export interface FilingPatch {
  status?: FilingStatus;
  itrForm?: string | null;
  auditApplicable?: boolean;
  filedOn?: string | null;
}

export const caClientListApi = {
  async overview(params: ClientOverviewParams): Promise<ClientOverview> {
    const { data } = await api.get<ApiResponse<ClientOverview>>('/api/ca/clients/overview', { params });
    return unwrap(data);
  },

  async setFiling(clientId: string, fy: string, patch: FilingPatch): Promise<void> {
    await api.put(`/api/ca/clients/${clientId}/filings/${fy}`, patch);
  },

  async downloadCsv(fy: string): Promise<void> {
    const res = await api.get('/api/ca/clients/overview.csv', { params: { fy }, responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clients-fy-${fy}.csv`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

/** Financial years a CA can pick: the one in season and the four before it. */
export function filingYearOptions(now: Date = new Date()): string[] {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  const y = ist.getUTCFullYear();
  const latest = ist.getUTCMonth() >= 3 ? y - 1 : y - 2;
  return Array.from({ length: 5 }, (_, i) => {
    const start = latest - i;
    return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
  });
}

/** "12 days left", "Due today", "8 days overdue"; empty once filed. */
export function dueLabel(daysLeft: number | null): string {
  if (daysLeft === null) return '';
  if (daysLeft === 0) return 'Due today';
  if (daysLeft > 0) return `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
  const late = -daysLeft;
  return `${late} day${late === 1 ? '' : 's'} overdue`;
}
