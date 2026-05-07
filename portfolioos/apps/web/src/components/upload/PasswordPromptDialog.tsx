import { useEffect, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface PasswordPromptDialogProps {
  open: boolean;
  fileName: string;
  /** Optional one-line hint shown under the title. Common values:
   *  "Try your PAN" for CAS files, "Account number / DOB" for bank statements. */
  hint?: string;
  /** True while the retry request is in flight. */
  isPending?: boolean;
  /** Set after a previous wrong password was tried — shown above the input. */
  errorMessage?: string | null;
  /** When false, hides the "remember for future files" checkbox. */
  allowSavePassword?: boolean;
  onSubmit: (password: string, save: boolean) => void;
  onCancel: () => void;
}

export function PasswordPromptDialog({
  open,
  fileName,
  hint,
  isPending = false,
  errorMessage,
  allowSavePassword = true,
  onSubmit,
  onCancel,
}: PasswordPromptDialogProps) {
  const [password, setPassword] = useState('');
  const [save, setSave] = useState(true);

  useEffect(() => {
    if (open) {
      setPassword('');
      setSave(true);
    }
  }, [open]);

  function submit() {
    const trimmed = password.trim();
    if (!trimmed || isPending) return;
    onSubmit(trimmed, save);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-500" />
            Unlock {fileName}
          </DialogTitle>
          <DialogDescription>
            {hint ?? 'This file is password-protected. Enter the password to continue.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {errorMessage && (
            <p className="text-xs text-destructive">{errorMessage}</p>
          )}
          <div className="space-y-1">
            <Label htmlFor="doc-password" className="text-xs">Password</Label>
            <Input
              id="doc-password"
              type="password"
              autoFocus
              autoComplete="off"
              value={password}
              maxLength={200}
              className="font-mono"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              disabled={isPending}
            />
          </div>
          {allowSavePassword && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={save}
                onChange={(e) => setSave(e.target.checked)}
                disabled={isPending}
              />
              Remember this password for future locked files
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending || !password.trim()}>
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Unlock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
