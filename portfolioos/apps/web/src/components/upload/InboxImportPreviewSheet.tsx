import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { gmailScanApi } from '@/api/gmailScan.api';

interface Props {
  docId: string | null;
  onClose: () => void;
}

export function InboxImportPreviewSheet({ docId, onClose }: Props) {
  const q = useQuery({
    queryKey: ['gmail-doc-preview', docId],
    queryFn: () => (docId ? gmailScanApi.getDocPreviewUrl(docId) : Promise.resolve(null)),
    enabled: !!docId,
  });
  return (
    <Sheet open={!!docId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-[min(640px,90vw)] sm:max-w-none p-0">
        <SheetHeader className="p-4 border-b">
          <SheetTitle>{q.data?.fileName ?? 'Document preview'}</SheetTitle>
        </SheetHeader>
        <div className="h-[calc(100vh-64px)] flex items-center justify-center">
          {q.isLoading || !q.data ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <iframe
              key={q.data.url}
              src={q.data.url}
              title={q.data.fileName}
              className="w-full h-full border-0"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
