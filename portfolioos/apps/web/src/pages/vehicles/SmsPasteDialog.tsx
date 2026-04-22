import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, MessageSquareShare } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { vehiclesApi } from '@/api/vehicles.api';
import { apiErrorMessage } from '@/api/client';

/**
 * §7.4 SMS fallback UI. User texts VAHAN <regNo> to 07738299899 and
 * pastes the reply — we regex-parse it server-side and either update an
 * existing vehicle or create a new one.
 */
export function SmsPasteDialog({
  open,
  onOpenChange,
  defaultRegNo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultRegNo?: string;
}) {
  const queryClient = useQueryClient();
  const [regNo, setRegNo] = useState(defaultRegNo ?? '');
  const [smsBody, setSmsBody] = useState('');

  const mutation = useMutation({
    mutationFn: () => vehiclesApi.smsPaste({ registrationNo: regNo, smsBody }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      if (result.outcome.ok) {
        toast.success(
          result.created
            ? `Vehicle ${regNo.toUpperCase()} created from SMS`
            : `Vehicle ${regNo.toUpperCase()} updated from SMS`,
        );
      } else {
        const firstErr = result.outcome.attempts.find((a) => !a.ok)?.error;
        toast.error(firstErr ?? 'SMS could not be parsed');
      }
      setSmsBody('');
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'SMS paste failed')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareShare className="h-4 w-4" /> Paste VAHAN SMS
          </DialogTitle>
          <DialogDescription>
            Text <code className="font-mono">VAHAN &lt;reg-no&gt;</code> to{' '}
            <code className="font-mono">07738299899</code> and paste the reply here. We parse
            what we can and leave blanks for you to fill in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="regNo">Registration number</Label>
            <Input
              id="regNo"
              className="mt-1 uppercase"
              placeholder="MH47BT5950"
              value={regNo}
              onChange={(e) => setRegNo(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="sms">SMS body</Label>
            <Textarea
              id="sms"
              rows={8}
              className="mt-1 font-mono text-xs"
              placeholder="RC: MH47BT5950, Owner: ..., Make/Model: ..., Insurance: ..."
              value={smsBody}
              onChange={(e) => setSmsBody(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !regNo.trim() || smsBody.trim().length < 10}
          >
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Apply SMS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
