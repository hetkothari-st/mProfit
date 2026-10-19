import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/api/client';
import { legacyApi } from '@/api/legacy/legacy.api';

/** Asks for a 2FA code (or an emailed code) and calls onDone once a grant is held. */
export function StepUpDialog({ open, onDone, onCancel }: { open: boolean; onDone: () => void; onCancel: () => void }) {
  const [method, setMethod] = useState<'totp' | 'email' | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode('');
    setMethod(null);
    legacyApi.startStepUp().then((r) => setMethod(r.method)).catch((e) => toast.error(apiErrorMessage(e)));
  }, [open]);

  async function submit() {
    setBusy(true);
    try {
      await legacyApi.verifyStepUp(code);
      onDone();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Confirm it’s you</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">
          {method === 'totp'
            ? 'Enter the code from your authenticator app (or a backup code).'
            : method === 'email'
              ? 'We emailed you a 6-digit code.'
              : 'Preparing…'}
        </p>
        <div className="space-y-1">
          <Label htmlFor="legacy-code">Code</Label>
          <Input
            id="legacy-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && code.trim().length >= 6) void submit(); }}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button disabled={!method || code.trim().length < 6 || busy} onClick={submit}>Confirm</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
