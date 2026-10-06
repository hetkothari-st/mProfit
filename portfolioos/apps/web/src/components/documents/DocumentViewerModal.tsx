import { useEffect, useState } from 'react';
import { Loader2, X, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { documentsApi } from '@/api/documents.api';
import { apiErrorMessage } from '@/api/client';

type ViewerKind = 'pdf' | 'image';

interface Props {
  documentId: string | null;
  fileName: string;
  kind: ViewerKind;
  onClose: () => void;
}

/**
 * Native in-browser viewer for PDFs and images. Fetches the bytes over the
 * authed download endpoint (so the access token is sent), wraps them in an
 * object URL, and renders with the browser's built-in PDF viewer / <img>.
 * No OnlyOffice DocumentServer dependency.
 */
export function DocumentViewerModal({ documentId, fileName, kind, onClose }: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) {
      setObjectUrl(null);
      setError(null);
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    setObjectUrl(null);
    setError(null);
    documentsApi
      .fetchBlob(documentId)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      })
      .catch((err) => {
        if (!cancelled) setError(apiErrorMessage(err, 'Failed to load document'));
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [documentId]);

  const handleDownload = async () => {
    if (!documentId) return;
    try {
      await documentsApi.openDownload(documentId, fileName);
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Download failed'));
    }
  };

  if (!documentId) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1 font-display text-lg truncate">{fileName}</div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <Button size="sm" variant="ghost" onClick={handleDownload} aria-label="Download">
            <Download className="h-4 w-4" /> <span className="hidden sm:inline">Download</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" /> <span className="hidden sm:inline">Close</span>
          </Button>
        </div>
      </div>
      <div className="flex-1 relative bg-muted/20">
        {!objectUrl && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading document…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-negative px-6 text-center">
            {error}
            <Button size="sm" variant="outline" onClick={handleDownload}>
              <Download className="h-4 w-4" /> Download instead
            </Button>
          </div>
        )}
        {objectUrl && kind === 'pdf' && (
          <iframe
            title={fileName}
            src={objectUrl}
            className="absolute inset-0 h-full w-full border-0"
          />
        )}
        {objectUrl && kind === 'image' && (
          <div className="absolute inset-0 flex items-center justify-center overflow-auto p-4">
            <img
              src={objectUrl}
              alt={fileName}
              className="max-h-full max-w-full object-contain"
              onError={() =>
                setError('This image format cannot be previewed in the browser.')
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
