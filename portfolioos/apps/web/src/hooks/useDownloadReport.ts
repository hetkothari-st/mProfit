import { useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { getApiBaseUrl } from '@/api/baseUrl';

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
    for (const [k, v] of Object.entries(params)) {
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
      if (!r.ok) {
        const msg = await r.text().catch(() => 'Download failed');
        throw new Error(msg);
      }
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
