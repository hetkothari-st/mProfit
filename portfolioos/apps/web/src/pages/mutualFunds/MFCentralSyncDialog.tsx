import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
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
import { mfCentralApi, type SubmitOtpResult } from '@/api/mfCentral.api';
import { portfoliosApi } from '@/api/portfolios.api';
import { apiErrorMessage } from '@/api/client';

type Step =
  | { phase: 'idle' }
  | { phase: 'otp_pending'; jobId: string; maskedContact: string }
  | { phase: 'verifying' }
  | { phase: 'success'; result: SubmitOtpResult }
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

function periodToRange(p: string): { from: string | null; to: string | null } {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const past = new Date(today);
  if (p === 'LAST_3M') past.setMonth(today.getMonth() - 3);
  else if (p === 'LAST_6M') past.setMonth(today.getMonth() - 6);
  else if (p === 'LAST_12M') past.setMonth(today.getMonth() - 12);
  else return { from: null, to: null };
  return { from: past.toISOString().slice(0, 10), to };
}

export function MFCentralSyncDialog({ open, onOpenChange, onSuccess }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>({ phase: 'idle' });

  // Form state
  const [pan, setPan] = useState('');
  const [otpMethod, setOtpMethod] = useState<'PHONE' | 'EMAIL'>('PHONE');
  const [contactValue, setContactValue] = useState('');
  const [period, setPeriod] = useState('ALL');
  const [nickname, setNickname] = useState('');
  const [portfolioId, setPortfolioId] = useState<string>('');
  const [otp, setOtp] = useState('');

  const portfoliosQuery = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
    enabled: open,
  });

  const requestOtpMutation = useMutation({
    mutationFn: () => {
      const { from, to } = periodToRange(period);
      return mfCentralApi.requestOtp({
        pan: pan.trim().toUpperCase(),
        otpMethod,
        contactValue: contactValue.trim(),
        portfolioId: portfolioId || null,
        periodFrom: from,
        periodTo: to,
        nickname: nickname.trim() || null,
      });
    },
    onSuccess: (r) => {
      setStep({ phase: 'otp_pending', jobId: r.jobId, maskedContact: r.maskedContact });
      toast.success('OTP sent');
    },
    onError: (err) =>
      setStep({ phase: 'error', message: apiErrorMessage(err, 'Failed to request OTP') }),
  });

  const submitOtpMutation = useMutation({
    mutationFn: (jobId: string) => mfCentralApi.submitOtp(jobId, otp.trim()),
    onSuccess: (r) => {
      if (r.status === 'COMPLETED') {
        setStep({ phase: 'success', result: r });
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
        queryClient.invalidateQueries({ queryKey: ['imports'] });
        onSuccess?.();
      } else {
        setStep({
          phase: 'error',
          message: r.errorMessage ?? 'Sync failed',
        });
      }
    },
    onError: (err) =>
      setStep({ phase: 'error', message: apiErrorMessage(err, 'OTP verification failed') }),
  });

  function reset() {
    setStep({ phase: 'idle' });
    setPan('');
    setContactValue('');
    setNickname('');
    setOtp('');
    setPortfolioId('');
    setPeriod('ALL');
    setOtpMethod('PHONE');
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  const canRequestOtp =
    /^[A-Za-z]{5}[0-9]{4}[A-Za-z]$/.test(pan.trim()) &&
    contactValue.trim().length >= 5 &&
    !requestOtpMutation.isPending;

  const canSubmitOtp = otp.trim().length >= 4 && !submitOtpMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Sync all your Mutual Funds linked to your PAN</DialogTitle>
          <DialogDescription>
            Uses MFCentral CAS API to fetch all your Mutual Fund transactions across AMCs.
            An OTP will be sent to your registered phone/email.
          </DialogDescription>
        </DialogHeader>

        {step.phase === 'idle' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <Label htmlFor="mfc-pan">PAN</Label>
              <Input
                id="mfc-pan"
                className="md:col-span-2"
                placeholder="ABCDE1234F"
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
                maxLength={10}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <Label>OTP via</Label>
              <div className="md:col-span-2 flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="otpMethod"
                    value="PHONE"
                    checked={otpMethod === 'PHONE'}
                    onChange={() => setOtpMethod('PHONE')}
                  />
                  Phone
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="otpMethod"
                    value="EMAIL"
                    checked={otpMethod === 'EMAIL'}
                    onChange={() => setOtpMethod('EMAIL')}
                  />
                  Email
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <Label htmlFor="mfc-contact">{otpMethod === 'EMAIL' ? 'Email' : 'Phone'}</Label>
              <Input
                id="mfc-contact"
                className="md:col-span-2"
                type={otpMethod === 'EMAIL' ? 'email' : 'tel'}
                placeholder={
                  otpMethod === 'EMAIL' ? 'you@example.com' : '10-digit mobile number'
                }
                value={contactValue}
                onChange={(e) => setContactValue(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <Label htmlFor="mfc-period">Period</Label>
              <Select
                id="mfc-period"
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
              <Label htmlFor="mfc-portfolio">Portfolio</Label>
              <Select
                id="mfc-portfolio"
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
              <Label htmlFor="mfc-nickname">Nickname</Label>
              <Input
                id="mfc-nickname"
                className="md:col-span-2"
                placeholder="optional, e.g. Personal MF"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={80}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => requestOtpMutation.mutate()}
                disabled={!canRequestOtp}
              >
                {requestOtpMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Send OTP
              </Button>
            </DialogFooter>
          </div>
        )}

        {step.phase === 'otp_pending' && (
          <div className="space-y-4">
            <div className="rounded border bg-muted/30 p-3 text-sm">
              OTP sent to your mobile/email registered with CAMS or KFintech for this PAN.
              Check your phone and email, then enter the OTP below.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <Label htmlFor="mfc-otp">OTP</Label>
              <Input
                id="mfc-otp"
                className="md:col-span-2"
                inputMode="numeric"
                placeholder="6-digit code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                maxLength={8}
                autoFocus
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep({ phase: 'idle' })}>
                Back
              </Button>
              <Button
                onClick={() => {
                  setStep({ phase: 'verifying' });
                  submitOtpMutation.mutate(step.jobId);
                }}
                disabled={!canSubmitOtp}
              >
                {submitOtpMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Verify & Sync
              </Button>
            </DialogFooter>
          </div>
        )}

        {step.phase === 'verifying' && (
          <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p>Verifying OTP and downloading your CAS...</p>
            <p className="text-xs">This usually takes 10–30 seconds.</p>
          </div>
        )}

        {step.phase === 'success' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded border border-green-200 bg-green-50/50 p-3 text-sm">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Sync complete</p>
                <p className="text-xs text-muted-foreground">
                  {step.result.txnsCreated} new transaction
                  {step.result.txnsCreated === 1 ? '' : 's'} added across{' '}
                  {step.result.fundsFound} fund{step.result.fundsFound === 1 ? '' : 's'}.
                </p>
              </div>
            </div>
            {step.result.warnings.length > 0 && (
              <div className="rounded border bg-muted/30 p-3 text-xs">
                <p className="font-medium mb-1">Warnings</p>
                <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                  {step.result.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
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
