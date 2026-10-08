import { api, unwrap } from './client';
import type {
  ApiResponse, SplitActivityDto, SplitBalancesDto, SplitContactDto, SplitExpenseDto, SplitFriendDto,
  SplitGroupDto, SplitMemberDto, SplitModeDto, SplitSettleMethodDto, SplitSettlementDto,
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
};
