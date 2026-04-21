import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export type BudgetStatus = 'ok' | 'warn' | 'capped';

export interface BudgetDTO {
  status: BudgetStatus;
  spentInr: string;
  warnInr: string;
  capInr: string;
}

/** §6.6 single discovered Gmail sender — shape returned by /gmail/:id/discover. */
export interface DiscoveredSenderDTO {
  address: string;
  displayName: string | null;
  messageCount: number;
  score: number;
  recentSubjects: string[];
  seedMatch: {
    institutionName: string;
    institutionKind: 'BANK' | 'BROKER' | 'INSURER' | 'REGISTRAR';
    suggestedDisplayLabel: string;
  } | null;
}

export interface DiscoverOptions {
  lookbackDays?: number;
  maxMessages?: number;
}

export const ingestionApi = {
  async budget(): Promise<BudgetDTO> {
    const { data } = await api.get<ApiResponse<BudgetDTO>>('/api/ingestion/budget');
    return unwrap(data);
  },
  async discover(
    mailboxId: string,
    opts: DiscoverOptions = {},
  ): Promise<DiscoveredSenderDTO[]> {
    const query: Record<string, string> = {};
    if (opts.lookbackDays !== undefined) query.lookbackDays = String(opts.lookbackDays);
    if (opts.maxMessages !== undefined) query.maxMessages = String(opts.maxMessages);
    const { data } = await api.get<ApiResponse<DiscoveredSenderDTO[]>>(
      `/api/gmail/${mailboxId}/discover`,
      { params: query },
    );
    return unwrap(data);
  },
};
