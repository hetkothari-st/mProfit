import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

export interface VehicleAlert {
  vehicleId: string;
  label: string;
  type: string;
  expiryDate: string;
  daysUntil: number;
}

export interface InsuranceRenewal {
  policyId: string;
  insurer: string;
  type: string;
  planName: string | null;
  nextPremiumDue: string;
  daysUntil: number;
  amount: string;
}

export interface AllocationSlice {
  key: string;
  label: string;
  value: string;
  numericValue: number;
  percent: number;
  category: 'FINANCIAL' | 'VEHICLE' | 'REAL_ESTATE';
}

export interface DashboardAlert {
  type: string;
  title: string;
  description: string;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  daysUntil: number | null;
}

export interface NetWorthResponse {
  totalNetWorth: string;
  portfolio: {
    currentValue: string;
    totalInvested: string;
    unrealisedPnL: string;
    unrealisedPnLPct: number;
  };
  realEstate: {
    count: number;
    totalValue: string;
    monthlyRent: string;
    incomeYTD: string;
    expenseYTD: string;
    netYTD: string;
    overdueCount: number;
  };
  vehicles: {
    count: number;
    totalValue: string;
    pendingChallans: number;
    expiringItems: VehicleAlert[];
  };
  insurance: {
    activePoliciesCount: number;
    totalSumAssured: string;
    annualPremiumTotal: string;
    upcomingRenewals: InsuranceRenewal[];
  };
  allocationBreakdown: AllocationSlice[];
  alerts: DashboardAlert[];
}

function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export const dashboardApi = {
  async netWorth(): Promise<NetWorthResponse> {
    const { data } = await api.get<ApiResponse<NetWorthResponse>>('/api/dashboard/net-worth');
    return unwrap(data);
  },
};
