import { api } from './client';
import type {
  ApiResponse,
  CpiSector,
  InflationGoalsView,
  InflationItemInput,
  InflationSourceCandidate,
  PersonalInflationSummary,
} from '@everypaisa/shared';

/** A payee the categoriser could not place (GET /api/spending/payees/uncategorised). */
export interface UncategorisedPayee {
  payeeKey: string;
  label: string;
  count: number;
  total: string;
}

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

/** Every write returns the fresh summary, so callers just setQueryData. */
export const personalInflationApi = {
  async summary(): Promise<PersonalInflationSummary> {
    const { data } = await api.get<ApiResponse<PersonalInflationSummary>>('/api/personal-inflation');
    return unwrap(data);
  },
  async setProfile(input: { stateCode: number; sector: CpiSector }): Promise<PersonalInflationSummary> {
    const { data } = await api.put<ApiResponse<PersonalInflationSummary>>('/api/personal-inflation/profile', input);
    return unwrap(data);
  },
  async createItem(input: InflationItemInput): Promise<PersonalInflationSummary> {
    const { data } = await api.post<ApiResponse<PersonalInflationSummary>>('/api/personal-inflation/items', input);
    return unwrap(data);
  },
  async updateItem(id: string, input: Partial<InflationItemInput>): Promise<PersonalInflationSummary> {
    const { data } = await api.patch<ApiResponse<PersonalInflationSummary>>(`/api/personal-inflation/items/${id}`, input);
    return unwrap(data);
  },
  async deleteItem(id: string): Promise<PersonalInflationSummary> {
    const { data } = await api.delete<ApiResponse<PersonalInflationSummary>>(`/api/personal-inflation/items/${id}`);
    return unwrap(data);
  },
  /** Loans, premiums and maintenance the user already tracks, ready to add. */
  async sources(): Promise<InflationSourceCandidate[]> {
    const { data } = await api.get<ApiResponse<InflationSourceCandidate[]>>('/api/personal-inflation/sources');
    return unwrap(data);
  },
  async importSources(sourceRefs: string[]): Promise<PersonalInflationSummary> {
    const { data } = await api.post<ApiResponse<PersonalInflationSummary>>('/api/personal-inflation/items/import', { sourceRefs });
    return unwrap(data);
  },
  /** Agree to bank spending being read for this page (the notice's current version). */
  async giveSpendingConsent(version: string): Promise<PersonalInflationSummary> {
    const { data } = await api.post<ApiResponse<PersonalInflationSummary>>('/api/personal-inflation/spending-consent', { version, agree: true });
    return unwrap(data);
  },
  /** Turn it off and delete what was worked out from bank spending. */
  async withdrawSpendingConsent(): Promise<PersonalInflationSummary> {
    const { data } = await api.delete<ApiResponse<PersonalInflationSummary>>('/api/personal-inflation/spending-consent');
    return unwrap(data);
  },
  /** realRise: true = the price really went up; false = moved home or changed school. */
  async answerStepChange(seriesId: string, realRise: boolean): Promise<PersonalInflationSummary> {
    const { data } = await api.put<ApiResponse<PersonalInflationSummary>>(`/api/personal-inflation/step-changes/${seriesId}`, { realRise });
    return unwrap(data);
  },
  async uncategorisedPayees(): Promise<UncategorisedPayee[]> {
    const { data } = await api.get<ApiResponse<UncategorisedPayee[]>>('/api/spending/payees/uncategorised', { params: { limit: 5 } });
    return unwrap(data);
  },
  async tagPayee(payeeKey: string, category: string): Promise<{ changed: number; uncategorised: UncategorisedPayee[] }> {
    const { data } = await api.put<ApiResponse<{ changed: number; uncategorised: UncategorisedPayee[] }>>('/api/spending/payees/category', { payeeKey, category });
    return unwrap(data);
  },
  async goals(): Promise<InflationGoalsView> {
    const { data } = await api.get<ApiResponse<InflationGoalsView>>('/api/personal-inflation/goals');
    return unwrap(data);
  },
  async applyGoalRates(goalIds: string[]): Promise<InflationGoalsView> {
    const { data } = await api.post<ApiResponse<InflationGoalsView>>('/api/personal-inflation/goals/apply', { goalIds });
    return unwrap(data);
  },
};

export const PERSONAL_INFLATION_QUERY_KEY = ['personal-inflation'] as const;
export const PERSONAL_INFLATION_SOURCES_KEY = ['personal-inflation', 'sources'] as const;
export const UNCATEGORISED_PAYEES_KEY = ['personal-inflation', 'payees'] as const;
export const PERSONAL_INFLATION_GOALS_KEY = ['personal-inflation', 'goals'] as const;
