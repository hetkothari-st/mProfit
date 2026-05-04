import { useEffect, useState } from 'react';
import { DocumentEditor } from '@onlyoffice/document-editor-react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { documentsApi } from '@/api/documents.api';
import type { OnlyOfficeConfigResponse } from '@portfolioos/shared';

interface Props {
  documentId: string | null;
  fileName: string;
  onClose: () => void;
}

export function DocumentEditorModal({ documentId, fileName, onClose }: Props) {
  const [data, setData] = useState<OnlyOfficeConfigResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setData(null);
    setError(null);
    documentsApi
      .onlyofficeConfig(documentId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load editor');
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  if (!documentId) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="font-display text-lg truncate">{fileName}</div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" /> Close
        </Button>
      </div>
      <div className="flex-1 relative">
        {!data && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading editor…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-negative px-6 text-center">
            {error}
            <br />
            Verify OnlyOffice DocumentServer is running at the configured URL.
          </div>
        )}
        {data && (
          <DocumentEditor
            id={`oo-editor-${documentId}`}
            documentServerUrl={data.docServerUrl}
            // The wrapper accepts the full config object — we cast because
            // the upstream typings are looser than ours.
            config={data.config as never}
            events_onError={(e: unknown) => {
              const err = e as { data?: { errorDescription?: string } };
              setError(err.data?.errorDescription ?? 'OnlyOffice error');
            }}
          />
        )}
      </div>
    </div>
  );
}
