import { api } from './client';
import type { ApiResponse } from '@portfolioos/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

export interface ChallanDTO {
  id: string;
  vehicleId: string;
  challanNo: string;
  offenceDate: string;
  offenceType: string | null;
  location: string | null;
  amount: string;
  status: string;
  details: unknown;
  fetchedAt: string;
}

export interface VehicleDTO {
  id: string;
  userId: string;
  portfolioId: string | null;
  registrationNo: string;
  make: string | null;
  model: string | null;
  variant: string | null;
  manufacturingYear: number | null;
  fuelType: string | null;
  color: string | null;
  chassisLast4: string | null;
  rtoCode: string | null;
  ownerName: string | null;
  purchaseDate: string | null;
  purchasePrice: string | null;
  currentValue: string | null;
  currentValueSource: string | null;
  insuranceExpiry: string | null;
  insurancePolicyId: string | null;
  pucExpiry: string | null;
  fitnessExpiry: string | null;
  roadTaxExpiry: string | null;
  permitExpiry: string | null;
  lastRefreshedAt: string | null;
  refreshSource: string | null;
  createdAt: string;
  updatedAt: string;
  challans?: ChallanDTO[];
  insurancePolicies?: Array<{ id: string; insurer: string; policyNumber: string }>;
}

export interface CreateVehicleInput {
  registrationNo: string;
  make?: string | null;
  model?: string | null;
  variant?: string | null;
  manufacturingYear?: number | null;
  fuelType?: string | null;
  color?: string | null;
  chassisLast4?: string | null;
  ownerName?: string | null;
  purchaseDate?: string | null;
  purchasePrice?: string | null;
  currentValue?: string | null;
  currentValueSource?: string | null;
  insuranceExpiry?: string | null;
  pucExpiry?: string | null;
  fitnessExpiry?: string | null;
  roadTaxExpiry?: string | null;
  permitExpiry?: string | null;
}

export type UpdateVehicleInput = Partial<CreateVehicleInput>;

export interface RefreshAttempt {
  adapter: string;
  version: string;
  ok: boolean;
  error?: string;
}

export interface RefreshResult {
  vehicle: VehicleDTO;
  outcome: {
    ok: boolean;
    source?: string;
    sourceVersion?: string;
    attempts: RefreshAttempt[];
  };
}

export interface SmsPasteResult {
  vehicle: VehicleDTO | null;
  created: boolean;
  outcome: {
    ok: boolean;
    source?: string;
    sourceVersion?: string;
    attempts: RefreshAttempt[];
  };
}

export interface ChallanScanResult {
  ok: boolean;
  source: string;
  sourceVersion: string;
  newChallans: number;
  updatedChallans: number;
  unchangedChallans: number;
  totalReturned: number;
  error?: string;
}

export const vehiclesApi = {
  async list(): Promise<VehicleDTO[]> {
    const { data } = await api.get<ApiResponse<VehicleDTO[]>>('/api/vehicles');
    return unwrap(data);
  },
  async get(id: string): Promise<VehicleDTO> {
    const { data } = await api.get<ApiResponse<VehicleDTO>>(`/api/vehicles/${id}`);
    return unwrap(data);
  },
  async create(input: CreateVehicleInput): Promise<VehicleDTO> {
    const { data } = await api.post<ApiResponse<VehicleDTO>>('/api/vehicles', input);
    return unwrap(data);
  },
  async update(id: string, input: UpdateVehicleInput): Promise<VehicleDTO> {
    const { data } = await api.patch<ApiResponse<VehicleDTO>>(
      `/api/vehicles/${id}`,
      input,
    );
    return unwrap(data);
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/api/vehicles/${id}`);
  },
  async refresh(
    id: string,
    input: { mode?: 'auto' | 'interactive'; chassisLast4?: string; smsBody?: string } = {},
  ): Promise<RefreshResult> {
    const { data } = await api.post<ApiResponse<RefreshResult>>(
      `/api/vehicles/${id}/refresh`,
      { mode: 'interactive', ...input },
    );
    return unwrap(data);
  },
  async smsPaste(input: { registrationNo: string; smsBody: string }): Promise<SmsPasteResult> {
    const { data } = await api.post<ApiResponse<SmsPasteResult>>(
      '/api/vehicles/sms-paste',
      input,
    );
    return unwrap(data);
  },
  async scanChallans(id: string): Promise<ChallanScanResult> {
    const { data } = await api.post<ApiResponse<ChallanScanResult>>(
      `/api/vehicles/${id}/challans/scan`,
    );
    return unwrap(data);
  },
  async carInfoInit(input: { registrationNo: string; mobileNo: string }): Promise<{ sessionId: string }> {
    const { data } = await api.post<ApiResponse<{ sessionId: string }>>(
      '/api/vehicles/carinfo/init',
      input,
    );
    return unwrap(data);
  },
  async carInfoVerify(input: { sessionId: string; otp: string }): Promise<any> {
    const { data } = await api.post<ApiResponse<any>>(
      '/api/vehicles/carinfo/verify',
      input,
    );
    return unwrap(data);
  },
};
