import { useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api, apiErrorMessage } from '@/api/client';
import { PasswordPromptDialog } from '@/components/upload/PasswordPromptDialog';
import { useUploadWithPasswordRetry } from '@/hooks/useUploadWithPasswordRetry';

interface Props {
  accountId: string;
  onClose: () => void;
}

interface UploadResponse {
  success: true;
  data: { inserted: number };
}

export function PfManualUploadDialog({ accountId, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const passwordRetry = useUploadWithPasswordRetry<UploadResponse>({
    uploadFn: async (file, password, save) => {
      const fd = new FormData();
      fd.append('file', file);
      if (password) {
        fd.append('password', password);
        fd.append('save', String(save ?? true));
      }
      const r = await api.post<UploadResponse>(
        `/api/epfppf/accounts/${accountId}/passbook`,
        fd,
      );
      return r.data;
    },
    onSuccess: (response) => {
      const inserted = response.data.inserted;
      setResult(`Imported ${inserted} new ${inserted === 1 ? 'entry' : 'entries'}.`);
      setError(null);
    },
    onError: (err) => {
      setError(apiErrorMessage(err, 'Upload failed.'));
      setResult(null);
    },
  });

  function startUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setResult(null);
    setError(null);
    passwordRetry.upload(file);
  }

  return (
    <>
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Upload Passbook PDF</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Upload an EPFO passbook PDF to import transactions without using the live
              portal. The file is processed server-side and not stored. Password-protected
              passbooks will prompt you for the password.
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
              <Button variant="outline" onClick={onClose} disabled={passwordRetry.uploading}>
                {result ? 'Close' : 'Cancel'}
              </Button>
              <Button
                onClick={startUpload}
                disabled={passwordRetry.uploading}
                className="w-24"
              >
                {passwordRetry.uploading ? 'Uploading…' : 'Upload'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <PasswordPromptDialog {...passwordRetry.dialogProps} />
    </>
  );
}
