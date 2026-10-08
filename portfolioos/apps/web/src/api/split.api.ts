import { api, unwrap } from './client';
import type {
  ApiResponse, SplitActivityDto, SplitBalancesDto, SplitContactDto, SplitExpenseDto, SplitFriendDto,
  SplitGroupDto, SplitMemberDto, SplitModeDto, SplitSettleMethodDto, SplitSettlementDto,
  SplitSettingsDto, SplitUpiLinkDto, SplitLabelDto, SplitCommentDto, SplitShareLinkDto,
} from '@everypaisa/shared';

const BASE = '/api/split';

export const SPLIT_KEYS = {
  all: ['split'] as const,
  groups: ['split', 'groups'] as const,
  group: (id: string) => ['split', 'group', id] as const,
  expenses: (groupId: string) => ['split', 'group', groupId, 'expenses'] as const,
  balances: (groupId: string) => ['split', 'group', groupId, 'balances'] as const,
  settlements: (groupId: string) => ['split', 'group', groupId, 'settlements'] as const,
  activity: (groupId?: string) => ['split', 'activity', groupId ?? 'all'] as const,
  expense: (id: string) => ['split', 'expense', id] as const,
  friends: ['split', 'friends'] as const,
  contacts: ['split', 'contacts'] as const,
  settings: ['split', 'settings'] as const,
  labels: (groupId: string) => ['split', 'group', groupId, 'labels'] as const,
  comments: (expenseId: string) => ['split', 'expense', expenseId, 'comments'] as const,
  shareLink: (expenseId: string) => ['split', 'expense', expenseId, 'share-link'] as const,
};

export interface ContactInput { name: string; email?: string | null; phone?: string | null; upiId?: string | null }
export interface NewGroupInput {
  name: string; type?: 'TRIP' | 'HOME' | 'COUPLE' | 'OTHER'; baseCurrency?: string;
  simplifyDebts?: boolean; myDisplayName: string; contactIds?: string[];
}
export interface ExpenseInput {
  groupId: string; description: string; date: string; amount: string; currency: string;
  fxRate?: string | null; splitMode: SplitModeDto;
  payers: Array<{ memberId: string; amount: string }>;
  shares: Array<{ memberId: string; value?: string }>;
}
export interface SettlementInput {
  groupId: string; fromMemberId: string; toMemberId: string; amount: string;
  currency?: string; method: SplitSettleMethodDto; date: string;
}

async function get<T>(url: string): Promise<T> {
  const { data } = await api.get<ApiResponse<T>>(url);
  return unwrap(data);
}
async function post<T>(url: string, body?: unknown): Promise<T> {
  const { data } = await api.post<ApiResponse<T>>(url, body);
  return unwrap(data);
}
async function patch<T>(url: string, body: unknown): Promise<T> {
  const { data } = await api.patch<ApiResponse<T>>(url, body);
  return unwrap(data);
}

async function put<T>(url: string, body: unknown): Promise<T> {
  const { data } = await api.put<ApiResponse<T>>(url, body);
  return unwrap(data);
}

export const splitApi = {
  listContacts: () => get<SplitContactDto[]>(`${BASE}/contacts`),
  createContact: (i: ContactInput) => post<SplitContactDto>(`${BASE}/contacts`, i),
  updateContact: (id: string, i: Partial<ContactInput>) => patch<SplitContactDto>(`${BASE}/contacts/${id}`, i),
  deleteContact: async (id: string) => { await api.delete(`${BASE}/contacts/${id}`); },

  listGroups: (includeArchived = false) =>
    get<SplitGroupDto[]>(`${BASE}/groups${includeArchived ? '?includeArchived=1' : ''}`),
  createGroup: (i: NewGroupInput) => post<SplitGroupDto>(`${BASE}/groups`, i),
  directGroup: (contactId: string, myDisplayName: string) =>
    post<SplitGroupDto>(`${BASE}/groups/direct`, { contactId, myDisplayName }),
  getGroup: (id: string) => get<SplitGroupDto>(`${BASE}/groups/${id}`),
  updateGroup: (id: string, p: { name?: string; type?: 'TRIP' | 'HOME' | 'COUPLE' | 'OTHER'; simplifyDebts?: boolean; archived?: boolean }) =>
    patch<SplitGroupDto>(`${BASE}/groups/${id}`, p),
  addMember: (groupId: string, contactId: string) => post<SplitMemberDto>(`${BASE}/groups/${groupId}/members`, { contactId }),
  removeMember: async (groupId: string, memberId: string) => { await api.delete(`${BASE}/groups/${groupId}/members/${memberId}`); },

  listExpenses: (groupId: string, includeDeleted = false) =>
    get<SplitExpenseDto[]>(`${BASE}/groups/${groupId}/expenses${includeDeleted ? '?includeDeleted=1' : ''}`),
  getExpense: (id: string) => get<SplitExpenseDto>(`${BASE}/expenses/${id}`),
  createExpense: (i: ExpenseInput) => post<SplitExpenseDto>(`${BASE}/expenses`, i),
  updateExpense: (id: string, i: Omit<ExpenseInput, 'groupId'>) => patch<SplitExpenseDto>(`${BASE}/expenses/${id}`, i),
  deleteExpense: async (id: string) => { await api.delete(`${BASE}/expenses/${id}`); },
  restoreExpense: (id: string) => post<SplitExpenseDto>(`${BASE}/expenses/${id}/restore`),

  listSettlements: (groupId: string) => get<SplitSettlementDto[]>(`${BASE}/groups/${groupId}/settlements`),
  createSettlement: (i: SettlementInput) => post<SplitSettlementDto>(`${BASE}/settlements`, i),
  deleteSettlement: async (id: string) => { await api.delete(`${BASE}/settlements/${id}`); },

  balances: (groupId: string) => get<SplitBalancesDto>(`${BASE}/groups/${groupId}/balances`),
  friends: () => get<SplitFriendDto[]>(`${BASE}/friends`),
  activity: (groupId?: string) =>
    get<SplitActivityDto[]>(groupId ? `${BASE}/groups/${groupId}/activity` : `${BASE}/activity`),

  getSettings: () => get<SplitSettingsDto>(`${BASE}/settings`),
  updateSettings: (p: Partial<SplitSettingsDto>) => put<SplitSettingsDto>(`${BASE}/settings`, p),
  upiLink: (groupId: string, toMemberId: string, amount?: string) => {
    const q = new URLSearchParams({ to: toMemberId });
    if (amount) q.set('amount', amount);
    return get<SplitUpiLinkDto>(`${BASE}/groups/${groupId}/upi-link?${q.toString()}`);
  },

  listLabels: (groupId: string) => get<SplitLabelDto[]>(`${BASE}/groups/${groupId}/labels`),
  createLabel: (groupId: string, i: { name: string; color: string }) =>
    post<SplitLabelDto>(`${BASE}/groups/${groupId}/labels`, i),
  deleteLabel: async (id: string) => { await api.delete(`${BASE}/labels/${id}`); },
  setExpenseLabels: (expenseId: string, labelIds: string[]) =>
    put<string[]>(`${BASE}/expenses/${expenseId}/labels`, { labelIds }),

  listComments: (expenseId: string) => get<SplitCommentDto[]>(`${BASE}/expenses/${expenseId}/comments`),
  addComment: (expenseId: string, body: string) => post<SplitCommentDto>(`${BASE}/expenses/${expenseId}/comments`, { body }),
  deleteComment: async (id: string) => { await api.delete(`${BASE}/comments/${id}`); },

  uploadReceipt: async (expenseId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const { data } = await api.put<ApiResponse<{ hasReceipt: true; mime: string }>>(
      `${BASE}/expenses/${expenseId}/receipt`, fd, { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return unwrap(data);
  },
  fetchReceipt: async (expenseId: string): Promise<Blob> => {
    const res = await api.get(`${BASE}/expenses/${expenseId}/receipt`, { responseType: 'blob' });
    return res.data as Blob;
  },
  deleteReceipt: async (expenseId: string) => { await api.delete(`${BASE}/expenses/${expenseId}/receipt`); },

  getShareLink: (expenseId: string) => get<SplitShareLinkDto>(`${BASE}/expenses/${expenseId}/share-link`),
  setShareLink: (expenseId: string, i: { enabled: boolean; portfolioId?: string | null }) =>
    put<SplitShareLinkDto>(`${BASE}/expenses/${expenseId}/share-link`, i),

  remind: (groupId: string, memberId: string) => post<{ sent: boolean }>(`${BASE}/reminders`, { groupId, memberId }),
  inviteContact: (contactId: string) => post<{ sent: boolean }>(`${BASE}/contacts/${contactId}/invite`),
};
