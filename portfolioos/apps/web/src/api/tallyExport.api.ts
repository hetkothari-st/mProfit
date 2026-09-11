import { getApiBaseUrl } from '@/api/baseUrl';
import { useAuthStore } from '@/stores/auth.store';

/** The server's message for a failed request, or the status when there is none. */
async function errorMessage(r: Response): Promise<string> {
  const body = await r.text();
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string; message?: string };
    const error = typeof parsed.error === 'string' ? parsed.error : parsed.error?.message;
    return error ?? parsed.message ?? `Export failed (HTTP ${r.status})`;
  } catch {
    // Not JSON (a proxy's HTML error page, say): show what came back, or the status.
    return body.trim() || `Export failed (HTTP ${r.status})`;
  }
}

/**
 * Download "Export to Tally": the user's books as one ZIP (masters,
 * transactions per financial year, holdings, import guide).
 */
export async function downloadTallyExport(): Promise<void> {
  const token = useAuthStore.getState().accessToken;
  if (!token) throw new Error('Not signed in');
  const r = await fetch(`${getApiBaseUrl()}/api/reports/download/tally-export`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await errorMessage(r));
  const blob = await r.blob();
  const named = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') ?? '')?.[1];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = named ?? 'tally-export.zip';
  a.click();
  URL.revokeObjectURL(a.href);
}
