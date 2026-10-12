import axios from 'axios';
import type {
  ApiResponse, WillDraftWire, WillEstateRefreshWire, WillGenerateResultWire, WillOverviewWire, WillPreviewWire,
  WillSaveResultWire, WillSection, WillSectionData, WillSuggestionWire,
} from '@everypaisa/shared';
import { api, decodeBlobError, unwrap } from './client';

const BASE = '/api/will';
const draftPath = (id: string) => `${BASE}/drafts/${encodeURIComponent(id)}`;

/** Will Maker. Money and percentages stay decimal strings end to end. */
export const willApi = {
  async overview(): Promise<WillOverviewWire> {
    const { data } = await api.get<ApiResponse<WillOverviewWire>>(BASE);
    return unwrap(data);
  },
  async createDraft(fromWillId?: string): Promise<WillDraftWire> {
    const { data } = await api.post<ApiResponse<WillDraftWire>>(`${BASE}/drafts`, fromWillId ? { fromWillId } : {});
    return unwrap(data);
  },
  async getDraft(id: string): Promise<WillDraftWire> {
    const { data } = await api.get<ApiResponse<WillDraftWire>>(draftPath(id));
    return unwrap(data);
  },
  async saveSection<S extends WillSection>(
    id: string,
    section: S,
    body: { revision: number; currentStep: number; data: WillSectionData[S] },
  ): Promise<WillSaveResultWire> {
    const { data } = await api.put<ApiResponse<WillSaveResultWire>>(`${draftPath(id)}/sections/${section}`, body);
    return unwrap(data);
  },
  async refreshEstate(id: string, revision: number): Promise<WillEstateRefreshWire> {
    const { data } = await api.post<ApiResponse<WillEstateRefreshWire>>(`${draftPath(id)}/estate/refresh`, { revision });
    return unwrap(data);
  },
  async discard(id: string): Promise<void> {
    await api.delete(draftPath(id));
  },
  async suggestions(): Promise<WillSuggestionWire[]> {
    const { data } = await api.get<ApiResponse<{ suggestions: WillSuggestionWire[] }>>(`${BASE}/people/suggestions`);
    return unwrap(data).suggestions;
  },
  async preview(id: string): Promise<WillPreviewWire> {
    const { data } = await api.get<ApiResponse<WillPreviewWire>>(`${draftPath(id)}/preview`);
    return unwrap(data);
  },
  /** `generatedOn` is the date of the preview the user acknowledged; the API refuses a stale one. */
  async generate(id: string, revision: number, generatedOn: string): Promise<WillGenerateResultWire> {
    const { data } = await api.post<ApiResponse<WillGenerateResultWire>>(`${draftPath(id)}/generate`, { revision, acknowledge: true, generatedOn });
    return unwrap(data);
  },
  async downloadPdf(versionId: string, versionNo: number): Promise<void> {
    let res;
    try {
      res = await api.get(`${BASE}/versions/${encodeURIComponent(versionId)}/pdf`, { responseType: 'blob' });
    } catch (err) {
      throw await decodeBlobError(err);
    }
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `will-v${versionNo}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};

function errorDetails(err: unknown, status: number): Record<string, unknown> | null {
  if (!axios.isAxiosError(err) || err.response?.status !== status) return null;
  const details = (err.response.data as { details?: unknown } | undefined)?.details;
  return details && typeof details === 'object' ? (details as Record<string, unknown>) : null;
}

export function isWillRevisionConflict(err: unknown): boolean {
  return errorDetails(err, 409)?.['reason'] === 'WILL_REVISION_CONFLICT';
}

/** The open draft named by a WILL_DRAFT_EXISTS conflict, with the step it was saved at. */
export function willDraftExists(err: unknown): { id: string; currentStep: number } | null {
  const d = errorDetails(err, 409);
  if (d?.['reason'] !== 'WILL_DRAFT_EXISTS' || typeof d['draftId'] !== 'string') return null;
  const step = d['currentStep'];
  return { id: d['draftId'], currentStep: typeof step === 'number' && Number.isInteger(step) ? step : 2 };
}

export function isWillPreviewOutdated(err: unknown): boolean {
  return errorDetails(err, 409)?.['reason'] === 'WILL_PREVIEW_OUTDATED';
}

export function isWillBlocked(err: unknown): boolean {
  return errorDetails(err, 422)?.['reason'] === 'WILL_BLOCKED';
}
