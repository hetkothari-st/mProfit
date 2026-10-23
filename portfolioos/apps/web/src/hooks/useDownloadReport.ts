import { useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { getApiBaseUrl } from '@/api/baseUrl';
import { currentReportTheme } from '@/lib/reportTheme';
import { errorFromResponse } from '@/lib/reportDownloads';

export type ReportFormat = 'pdf' | 'xlsx';

export function useDownloadReport() {
  const [loading, setLoading] = useState(false);
  const accessToken = useAuthStore(s => s.accessToken);

  async function download(
    path: string,
    params: Record<string, string | string[] | undefined>,
    filename: string,
  ): Promise<void> {
    const base = getApiBaseUrl();
    const qs = new URLSearchParams();
    // Matches the app's current theme by default; a caller can override by
    // including its own `theme` in `params` (e.g. from a light/dark toggle
    // on the download dialog) — that spreads in after this default and wins.
    const merged: Record<string, string | string[] | undefined> = {
      theme: currentReportTheme(),
      ...params,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === '') continue;
      if (Array.isArray(v)) {
        if (v.length > 0) qs.set(k, v.join(','));
      } else {
        qs.set(k, v);
      }
    }
    const url = `${base}${path}?${qs.toString()}`;

    setLoading(true);
    try {
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      // The server's message, not its raw JSON envelope.
      if (!r.ok) throw await errorFromResponse(r);
      const blob = await r.blob();
      const a = document.createElement('a');
      const objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
      a.download = filename;
      a.click();
      // Delay revocation — browser fetches the blob URL asynchronously after click
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } finally {
      setLoading(false);
    }
  }

  return { download, loading };
}
