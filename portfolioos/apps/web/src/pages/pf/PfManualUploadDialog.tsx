import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/api/client';
import { apiErrorMessage } from '@/api/client';

interface Props {
  accountId: string;
  onClose: () => void;
}

export function PfManualUploadDialog({ accountId, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.post<{ success: true; data: { inserted: number } }>(
        `/api/epfppf/accounts/${accountId}/passbook`,
        fd,
      );
      setResult(`Imported ${r.data.data.inserted} new ${r.data.data.inserted === 1 ? 'entry' : 'entries'}.`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Upload failed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Upload Passbook PDF</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Upload an EPFO passbook PDF to import transactions without using the live
            portal. The file is processed server-side and not stored.
          </p>

          <input
            type="file"
            accept="application/pdf"
            ref={fileRef}
            className="text-sm w-full"
            onChange={() => { setResult(null); setError(null); }}
          />

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {result && (
            <p className="text-sm text-green-600 font-medium">{result}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              {result ? 'Close' : 'Cancel'}
            </Button>
            <Button onClick={() => void upload()} disabled={busy} className="w-24">
              {busy ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
