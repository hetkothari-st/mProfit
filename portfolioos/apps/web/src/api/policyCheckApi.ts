/**
 * Client for `/api/insurance/health-check` endpoints.
 *
 * All types are imported from `@everypaisa/shared`. Nothing is redeclared
 * locally — CONTEXT.md §11 and §16 rule 6: local shapes hide contract drift
 * from the compiler.
 */

import { api } from './client';
import type {
  ApiResponse,
  PolicyHealthCheckDTO,
  PolicyExtractionDocDTO,
  PolicyFieldConflict,
  FinancialSimulatorInput,
  FinancialSimulatorOutput,
} from '@everypaisa/shared';

function unwrap<T>(r: ApiResponse<T>): T {
  if (!r.success) throw new Error(r.error);
  return r.data;
}

// ---------------------------------------------------------------------------
// Check lifecycle
// ---------------------------------------------------------------------------

/** Create a new health check for a HEALTH policy. Returns the checkId. */
export async function createHealthCheck(policyId: string): Promise<{ checkId: string }> {
  const r = await api.post<ApiResponse<{ checkId: string }>>(
    `/api/insurance/policies/${policyId}/health-check`,
  );
  return unwrap(r.data);
}

/** Upload documents for a health check. */
export async function uploadHealthCheckDocuments(
  checkId: string,
  files: File[],
  onProgress?: (pct: number) => void,
): Promise<{ checkId: string; uploadedDocIds: string[] }> {
  const form = new FormData();
  for (const f of files) form.append('files', f);

  const r = await api.post<ApiResponse<{ checkId: string; uploadedDocIds: string[] }>>(
    `/api/insurance/health-check/${checkId}/documents`,
    form,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => {
        if (onProgress && evt.total) {
          onProgress(Math.round((evt.loaded * 100) / evt.total));
        }
      },
    },
  );
  return unwrap(r.data);
}

/** Poll check status and extraction docs. */
export async function getHealthCheck(checkId: string): Promise<PolicyHealthCheckDTO> {
  const r = await api.get<ApiResponse<PolicyHealthCheckDTO>>(
    `/api/insurance/health-check/${checkId}`,
  );
  return unwrap(r.data);
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/** Trigger LLM extraction for a check. */
export async function triggerExtraction(
  checkId: string,
): Promise<{ ok: boolean; dataId?: string; error?: string }> {
  const r = await api.post<ApiResponse<{ ok: boolean; dataId?: string; error?: string }>>(
    `/api/insurance/health-check/${checkId}/extract`,
  );
  return unwrap(r.data);
}

/** Get extracted fields with confidence and source citations. */
export async function getExtraction(checkId: string): Promise<{
  id: string;
  checkId: string;
  fields: unknown;
  conflicts: PolicyFieldConflict[];
  verifiedAt: string | null;
  version: number;
}> {
  const r = await api.get<ApiResponse<{
    id: string;
    checkId: string;
    fields: unknown;
    conflicts: PolicyFieldConflict[];
    verifiedAt: string | null;
    version: number;
  }>>(`/api/insurance/health-check/${checkId}/extraction`);
  return unwrap(r.data);
}

/** Save user corrections to extracted fields. Transitions status to VERIFIED. */
export async function patchExtraction(
  checkId: string,
  corrections: Record<string, unknown>,
): Promise<{ checkId: string; version: number; status: string }> {
  const r = await api.patch<ApiResponse<{ checkId: string; version: number; status: string }>>(
    `/api/insurance/health-check/${checkId}/extraction`,
    corrections,
  );
  return unwrap(r.data);
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/** Trigger the full rules + scoring + verdict analysis. */
export async function triggerAnalysis(
  checkId: string,
): Promise<{ checkId: string; status?: string; alreadyRunning?: boolean }> {
  const r = await api.post<ApiResponse<{ checkId: string; status?: string; alreadyRunning?: boolean }>>(
    `/api/insurance/health-check/${checkId}/analyze`,
  );
  return unwrap(r.data);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

/** Get the full health check report (all 10 sections). */
export async function getReport(checkId: string): Promise<unknown> {
  const r = await api.get<ApiResponse<unknown>>(
    `/api/insurance/health-check/${checkId}/report`,
  );
  return unwrap(r.data);
}

// ---------------------------------------------------------------------------
// Financial simulator
// ---------------------------------------------------------------------------

/** Run the financial scenario simulator. */
export async function simulate(
  checkId: string,
  input: FinancialSimulatorInput,
): Promise<FinancialSimulatorOutput> {
  const r = await api.post<ApiResponse<FinancialSimulatorOutput>>(
    `/api/insurance/health-check/${checkId}/simulate`,
    input,
  );
  return unwrap(r.data);
}

export interface HealthCheckHistoryItem {
  checkId: string;
  status: string;
  asOf: string;
  completedAt: string | null;
  score: string | null;
  verdict: string | null;
}

/** All previous health checks for a policy, newest first. */
export async function listHealthChecks(policyId: string): Promise<HealthCheckHistoryItem[]> {
  const r = await api.get<ApiResponse<{ checks: HealthCheckHistoryItem[] }>>(
    `/api/insurance/policies/${policyId}/health-checks`,
  );
  return unwrap(r.data).checks;
}
