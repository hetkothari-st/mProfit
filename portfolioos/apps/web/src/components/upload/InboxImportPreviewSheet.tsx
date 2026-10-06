import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { gmailScanApi } from '@/api/gmailScan.api';
import { api } from '@/api/client';
import { classifyPreview, type PreviewMode } from '@/lib/safePreview';

interface Props {
  docId: string | null;
  onClose: () => void;
}

export function InboxImportPreviewSheet({ docId, onClose }: Props) {
  const metaQ = useQuery({
    queryKey: ['gmail-doc-preview', docId],
    queryFn: () => (docId ? gmailScanApi.getDocPreviewUrl(docId) : Promise.resolve(null)),
    enabled: !!docId,
  });

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<PreviewMode>('none');
  const [blobError, setBlobError] = useState<string | null>(null);

  useEffect(() => {
    if (!metaQ.data?.url) return;
    let revoked = false;
    setBlobUrl(null);
    setBlobError(null);
    api.get<ArrayBuffer>(metaQ.data.url, { responseType: 'arraybuffer' })
      .then(({ data, headers }) => {
        if (revoked) return;
        // The attachment came from an email: its declared type is the
        // sender's choice. classifyPreview decides from the bytes.
        const declared = (headers['content-type'] as string) || metaQ.data!.mimeType || '';
        const preview = classifyPreview(data, declared, metaQ.data!.fileName ?? '');
        setMode(preview.mode);
        if (preview.blob) setBlobUrl(URL.createObjectURL(preview.blob));
        else setBlobError('No preview for this file type. Import it to see its contents.');
      })
      .catch((err) => {
        if (!revoked) setBlobError(String(err));
      });
    return () => {
      revoked = true;
    };
  }, [metaQ.data?.url]);

  // Revoke blob URL when sheet closes or doc changes
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const fileName = metaQ.data?.fileName ?? 'Document preview';

  return (
    <Sheet open={!!docId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-[min(720px,95vw)] sm:max-w-none p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle className="truncate">{fileName}</SheetTitle>
        </SheetHeader>
        <div className="h-[calc(100vh-64px)] flex items-center justify-center">
          {blobError ? (
            <p className="text-sm text-destructive px-4">{blobError}</p>
          ) : !blobUrl ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <iframe
              key={blobUrl}
              src={blobUrl}
              title={fileName}
              // HTML/text attachments get no scripts and an opaque origin.
              // PDFs cannot render sandboxed, and only real PDFs reach here.
              {...(mode === 'pdf' ? {} : { sandbox: '' })}
              className="w-full h-full border-0"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
