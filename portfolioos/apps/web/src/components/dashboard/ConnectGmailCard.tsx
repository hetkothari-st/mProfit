import { Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { gmailApi } from '@/api/gmail/gmail.api';
import { apiErrorMessage } from '@/api/client';

export function ConnectGmailCard() {
  async function startConnect() {
    try {
      const r = await gmailApi.authUrl();
      window.location.href = r.url;
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Failed to start Gmail connect'));
    }
  }

  return (
    <div className="rounded-lg border border-primary/25 bg-gradient-to-r from-primary/8 via-primary/5 to-transparent px-4 py-3.5 sm:px-6 sm:py-4 flex items-center justify-between gap-4 flex-wrap reveal">
      <div className="flex items-center gap-3 min-w-0">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-primary shrink-0">
          <Mail className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">Auto-import from Gmail</p>
          <p className="text-[12px] text-muted-foreground">
            Scan your inbox for contract notes and statements — you approve each document before import.
          </p>
        </div>
      </div>
      <Button size="sm" className="shrink-0" onClick={startConnect}>
        Connect Gmail
      </Button>
    </div>
  );
}
