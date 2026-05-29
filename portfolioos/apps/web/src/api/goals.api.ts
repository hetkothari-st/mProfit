import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export type GoalCategory =
  | 'RETIREMENT'
  | 'CHILD_EDUCATION'
  | 'HOME_PURCHASE'
  | 'EMERGENCY_FUND'
  | 'FIRE_CORPUS'
  | 'VEHICLE_PURCHASE'
  | 'TRAVEL'
  | 'WEALTH_BUILDING'
  | 'CUSTOM';

export type GoalPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type GoalStatus = 'ACTIVE' | 'ACHIEVED' | 'PAUSED' | 'ABANDONED';

export interface GoalDTO {
  id: string;
  name: string;
  category: GoalCategory;
  priority: GoalPriority;
  status: GoalStatus;
  targetAmount: string;
  initialAmount: string;
  inflationRate: string | null;
  expectedReturn: string | null;
  targetDate: string;
  startDate: string;
  portfolioIds: string[];
  notes: string | null;
  achievedAt: string | null;
  createdAt: string;
  updatedAt: string;
  currentValue: string;
  remaining: string;
  progressPct: number;
  yearsRemaining: number;
  inflationAdjustedTarget: string | null;
  requiredCagr: number | null;
  isOnTrack: boolean | null;
}

export interface GoalInput {
  name: string;
  category?: GoalCategory;
  priority?: GoalPriority;
  status?: GoalStatus;
  targetAmount: string | number;
  initialAmount?: string | number;
  inflationRate?: string | number | null;
  expectedReturn?: string | number | null;
  targetDate: string;
  startDate?: string;
  portfolioIds?: string[];
  notes?: string | null;
}

export const goalsApi = {
  async list(): Promise<GoalDTO[]> {
    const { data } = await api.get<ApiResponse<GoalDTO[]>>('/api/goals');
    return unwrap(data);
  },
  async get(id: string): Promise<GoalDTO> {
    const { data } = await api.get<ApiResponse<GoalDTO>>(`/api/goals/${id}`);
    return unwrap(data);
  },
  async create(input: GoalInput): Promise<GoalDTO> {
    const { data } = await api.post<ApiResponse<GoalDTO>>('/api/goals', input);
    return unwrap(data);
  },
  async update(id: string, input: Partial<GoalInput>): Promise<GoalDTO> {
    const { data } = await api.patch<ApiResponse<GoalDTO>>(`/api/goals/${id}`, input);
    return unwrap(data);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/goals/${id}`);
  },
};
