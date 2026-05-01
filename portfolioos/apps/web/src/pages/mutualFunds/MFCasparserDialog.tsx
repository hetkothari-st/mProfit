import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Send,
  CheckCircle2,
  AlertTriangle,
  CircleAlert,
} from 'lucide-react';
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
import { Select } from '@/components/ui/select';
import {
  mfCasparserApi,
  type KfintechMailbackResult,
} from '@/api/mfCasparser.api';
import { portfoliosApi } from '@/api/portfolios.api';
import { apiErrorMessage } from '@/api/client';

type Step =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'success'; result: KfintechMailbackResult }
  | { phase: 'error'; message: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const PERIOD_OPTIONS = [
  { value: 'ALL', label: 'All to Date' },
  { value: 'LAST_12M', label: 'Last 12 months' },
  { value: 'LAST_6M', label: 'Last 6 months' },
  { value: 'LAST_3M', label: 'Last 3 months' },
];

function periodToRange(p: string): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const past = new Date(today);
  if (p === 'LAST_3M') past.setMonth(today.getMonth() - 3);
  else if (p === 'LAST_6M') past.setMonth(today.getMonth() - 6);
  else if (p === 'LAST_12M') past.setMonth(today.getMonth() - 12);
  else past.setFullYear(1990, 0, 1); // ALL: KFintech accepts 1990-01-01 onwards
  return { from: past.toISOString().slice(0, 10), to };
}

export function MFCasparserDialog({ open, onOpenChange, onSuccess }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>({ phase: 'idle' });

  // form
  const [pan, setPan] = useState('');
  const [email, setEmail] = useState('');
  const [period, setPeriod] = useState('ALL');
  const [portfolioId, setPortfolioId] = useState('');
  const [nickname, setNickname] = useState('');

  const portfoliosQuery = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
    enabled: open,
  });

  const creditsQuery = useQuery({
    queryKey: ['casparser-credits'],
    queryFn: () => mfCasparserApi.credits(),
    enabled: open,
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: () => {
      const { from, to } = periodToRange(period);
      return mfCasparserApi.kfintechMailback({
        pan: pan.trim().toUpperCase(),
        email: email.trim(),
        fromDate: from,
        toDate: to,
      });
    },
    onSuccess: (r) => {
      setStep({ phase: 'success', result: r });
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      onSuccess?.();
    },
    onError: (err) =>
      setStep({ phase: 'error', message: apiErrorMessage(err, 'KFintech mailback failed') }),
  });

  function reset() {
    setStep({ phase: 'idle' });
    setPan('');
    setEmail('');
    setPeriod('ALL');
    setPortfolioId('');
    setNickname('');
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  const panOk = /^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(pan.trim());
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const canSubmit = panOk && emailOk && !submitMutation.isPending;

  const remaining = creditsQuery.data?.credits_remaining;
  const lowCredits = typeof remaining === 'number' && remaining <= 5;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Sync Mutual Funds via PAN + Email</DialogTitle>
          <DialogDescription>
            Enter PAN and the email registered on your folios. We use the casparser.in API
            (single endpoint covers <strong>both CAMS + KFintech</strong> RTAs). CAS PDF arrives
            in your inbox in 5-60 min and is auto-imported via the Gmail integration.
          </DialogDescription>
        </DialogHeader>

        {creditsQuery.data && (
          <div
            className={`flex items-center gap-2 rounded border p-2 text-xs ${
              lowCredits
                ? 'border-amber-300 bg-amber-50/50 text-amber-700'
                : 'bg-muted/30 text-muted-foreground'
            }`}
          >
            <CircleAlert className="h-3.5 w-3.5" />
            <span>
              CASParser credits: <span className="font-mono">{remaining ?? '?'}</span>
              {creditsQuery.data.plan ? ` (${creditsQuery.data.plan})` : ''}
            </span>
          </div>
        )}

        {step.phase === 'idle' && (
          <div className="space-y-4">
            <div className="rounded border bg-muted/30 p-3 text-xs">
              <strong>Why email, not OTP?</strong> No free public API allows PAN+OTP→MF data
              without a paid B2B partnership (mProfit uses the paid MFCentral partner API).
              KFintech mailback is the closest free PAN-only flow: identity is verified by sending
              the PDF to the email already registered on your folios. PAN-not-on-record will
              receive nothing — same security as OTP.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <Label htmlFor="cp-pan">PAN</Label>
              <Input
                id="cp-pan"
                className="md:col-span-2"
                placeholder="ABCDE1234F"
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
                maxLength={10}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <Label htmlFor="cp-email">Email</Label>
              <Input
                id="cp-email"
                className="md:col-span-2"
                type="email"
                placeholder="email registered with your folios"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <Label htmlFor="cp-period">Period</Label>
              <Select
                id="cp-period"
                className="md:col-span-2"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                {PERIOD_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <Label htmlFor="cp-portfolio">Portfolio</Label>
              <Select
                id="cp-portfolio"
                className="md:col-span-2"
                value={portfolioId}
                onChange={(e) => setPortfolioId(e.target.value)}
              >
                <option value="">Default</option>
                {portfoliosQuery.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <Label htmlFor="cp-nick">Nickname</Label>
              <Input
                id="cp-nick"
                className="md:col-span-2"
                placeholder="optional"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={80}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={() => submitMutation.mutate()} disabled={!canSubmit}>
                {submitMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Request CAS
              </Button>
            </DialogFooter>
          </div>
        )}

        {step.phase === 'submitting' && (
          <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p>Submitting request to KFintech...</p>
          </div>
        )}

        {step.phase === 'success' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded border border-green-200 bg-green-50/50 p-3 text-sm">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">CAS request submitted</p>
                <p className="text-xs text-muted-foreground mt-1">{step.result.message}</p>
                <p className="text-xs mt-2">
                  PDF arrives in your inbox in 5-60 min. Connect Gmail in Settings to
                  auto-import. Otherwise upload the PDF manually via "Import CAS PDF".
                </p>
                {step.result.requestId && (
                  <p className="text-xs mt-1 font-mono">ref: {step.result.requestId}</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}

        {step.phase === 'error' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded border border-red-200 bg-red-50/50 p-3 text-sm">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Something went wrong</p>
                <p className="text-xs text-muted-foreground">{step.message}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep({ phase: 'idle' })}>Try again</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
