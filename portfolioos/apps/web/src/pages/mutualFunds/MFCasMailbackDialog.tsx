import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Send, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
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
import {
  mfCasMailbackApi,
  type InitiateResult,
  type SubmitResult,
} from '@/api/mf/mfCasMailback.api';
import { authApi } from '@/api/auth.api';
import { portfoliosApi } from '@/api/portfolios.api';
import { apiErrorMessage } from '@/api/client';
import { useActingAsStore } from '@/stores/actingAs.store';

type Step =
  | { phase: 'idle' }
  | { phase: 'set_pan' }
  | { phase: 'captcha'; init: InitiateResult }
  | { phase: 'submitting' }
  | { phase: 'success'; result: SubmitResult }
  | { phase: 'error'; message: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  providers?: ('CAMS' | 'KFINTECH')[];
  title?: string;
  description?: string;
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

export function MFCasMailbackDialog({
  open,
  onOpenChange,
  onSuccess,
  providers,
  title,
  description,
}: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>({ phase: 'idle' });

  // Form state
  const [email, setEmail] = useState('');
  const [period, setPeriod] = useState('ALL');
  const [nickname, setNickname] = useState('');
  const [portfolioId, setPortfolioId] = useState('');
  const [camsCaptcha, setCamsCaptcha] = useState('');
  const [kfinCaptcha, setKfinCaptcha] = useState('');
  const [newPan, setNewPan] = useState('');

  // Managing a family member's account: the request goes out for THEIR PAN.
  const actingAs = useActingAsStore((s) => s.profile);

  const portfoliosQuery = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
    enabled: open,
  });

  // The PAN the server will use, masked. Read from the mailback route — a
  // data route, so it carries X-Act-As — not from /api/auth/pan/reveal, which
  // always answers as the signed-in person: a manager acting for a family
  // member used to see (and submit) their own PAN here while the PDF
  // password came from the member's profile. The server now takes the PAN
  // from the same profile, so the browser never needs the full number.
  const panQuery = useQuery({
    queryKey: ['mfcas-mailback-pan', actingAs?.id ?? null],
    queryFn: () => mfCasMailbackApi.pan(),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });
  const panMasked = panQuery.data?.panMasked ?? null;
  const hasPan = panMasked !== null;

  const updatePanMutation = useMutation({
    mutationFn: (newPan: string) => authApi.updateProfile({ pan: newPan }),
    onSuccess: () => {
      toast.success('PAN saved to profile');
      queryClient.invalidateQueries({ queryKey: ['auth-me'] });
      queryClient.invalidateQueries({ queryKey: ['mfcas-mailback-pan'] });
      setNewPan('');
      setStep({ phase: 'idle' });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to save PAN')),
  });

  const initiateMutation = useMutation({
    mutationFn: () => {
      const { from, to } = periodToRange(period);
      return mfCasMailbackApi.initiate({
        // No PAN: the server uses the one shown above (the effective profile's).
        email: email.trim(),
        portfolioId: portfolioId || null,
        periodFrom: from,
        periodTo: to,
        nickname: nickname.trim() || null,
        providers,
      });
    },
    onSuccess: (r) => {
      setStep({ phase: 'captcha', init: r });
      const reachable = [r.cams && 'CAMS', r.kfintech && 'KFintech']
        .filter(Boolean)
        .join(' & ');
      toast.success(`${reachable} reached`);
    },
    onError: (err) =>
      setStep({ phase: 'error', message: apiErrorMessage(err, 'Failed to reach portals') }),
  });

  const submitMutation = useMutation({
    mutationFn: (init: InitiateResult) =>
      mfCasMailbackApi.submit({
        jobId: init.jobId,
        // PDF password defaults to user.pan on the server.
        cams: init.cams ? { sessionKey: init.cams.sessionKey, captcha: camsCaptcha } : null,
        kfintech: init.kfintech
          ? { sessionKey: init.kfintech.sessionKey, captcha: kfinCaptcha }
          : null,
      }),
    onSuccess: (r) => {
      setStep({ phase: 'success', result: r });
      queryClient.invalidateQueries({ queryKey: ['mfcas-mailback-jobs'] });
      onSuccess?.();
    },
    onError: (err) =>
      setStep({ phase: 'error', message: apiErrorMessage(err, 'Submission failed') }),
  });

  function reset() {
    setStep({ phase: 'idle' });
    setEmail('');
    setNickname('');
    setPortfolioId('');
    setPeriod('ALL');
    setCamsCaptcha('');
    setKfinCaptcha('');
    setNewPan('');
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const canInitiate = emailOk && !initiateMutation.isPending && hasPan;

  // Captcha is required only if the adapter returned an image.
  const camsRequiresCaptcha = step.phase === 'captcha' && Boolean(step.init.cams?.captchaImageBase64);
  const kfinRequiresCaptcha =
    step.phase === 'captcha' && Boolean(step.init.kfintech?.captchaImageBase64);
  const captchaSatisfied =
    step.phase === 'captcha' &&
    (!camsRequiresCaptcha || camsCaptcha.length >= 1) &&
    (!kfinRequiresCaptcha || kfinCaptcha.length >= 1);
  const canSubmit = step.phase === 'captcha' && captchaSatisfied && !submitMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title ?? 'Sync Mutual Funds via CAMS + KFintech CAS'}</DialogTitle>
          <DialogDescription>
            {description ??
              `Enter your PAN and email registered with your AMC folios. We'll request a Consolidated Account Statement (CAS) from CAMS and KFintech. The PDF arrives in your inbox in 5–60 min and is auto-imported by the Gmail integration.`}
          </DialogDescription>
        </DialogHeader>

        {panQuery.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
          </div>
        ) : panQuery.isError ? (
          <div className="rounded border border-red-200 bg-red-50/50 p-3 text-sm">
            {apiErrorMessage(panQuery.error, 'Could not load the PAN for this account')}
          </div>
        ) : !hasPan && actingAs ? (
          // Saving a PAN here goes through the profile route, which always
          // runs as the signed-in person — it would land on the manager's
          // profile, not the member's. Say so instead of offering it.
          <div className="space-y-3">
            <div
              data-testid="mb-no-pan-acting"
              className="rounded border border-amber-300 bg-amber-50/50 p-3 text-sm"
            >
              <strong>No PAN on {actingAs.name}'s profile.</strong> The CAS is requested for
              their PAN and the PDF is locked with it, so it has to be on their profile before
              a statement can be requested.
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Close</Button>
            </DialogFooter>
          </div>
        ) : !hasPan && step.phase !== 'set_pan' ? (
          <div className="space-y-3">
            <div className="rounded border border-amber-300 bg-amber-50/50 p-3 text-sm">
              <strong>PAN not set on your profile.</strong> CAMS encrypts the CAS PDF using your
              PAN — we use it as the PDF password. Set it once and we'll reuse it everywhere
              (Settings → Profile, or here).
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={() => setStep({ phase: 'set_pan' })}>
                <ShieldCheck className="h-4 w-4" /> Set PAN now
              </Button>
            </DialogFooter>
          </div>
        ) : step.phase === 'set_pan' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <Label htmlFor="set-pan">PAN</Label>
              <Input
                id="set-pan"
                className="md:col-span-2"
                placeholder="ABCDE1234F"
                value={newPan}
                onChange={(e) => setNewPan(e.target.value.toUpperCase())}
                maxLength={10}
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              We'll save this to your profile (Settings → Profile) and use it as the PDF
              password for CAS downloads.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep({ phase: 'idle' })}>
                Back
              </Button>
              <Button
                onClick={() => updatePanMutation.mutate(newPan.trim().toUpperCase())}
                disabled={
                  !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(newPan.trim().toUpperCase()) ||
                  updatePanMutation.isPending
                }
              >
                {updatePanMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Save PAN
              </Button>
            </DialogFooter>
          </div>
        ) : step.phase === 'idle' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <Label htmlFor="mb-pan">PAN</Label>
              <div className="md:col-span-2">
                <Input id="mb-pan" data-testid="mb-pan" value={panMasked ?? ''} readOnly disabled />
                <p className="mt-1 text-xs text-muted-foreground">
                  {actingAs
                    ? `From ${actingAs.name}'s profile — the statement is requested for this PAN.`
                    : 'From your profile — the statement is requested for this PAN.'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <Label htmlFor="mb-email">Email</Label>
              <Input
                id="mb-email"
                className="md:col-span-2"
                type="email"
                placeholder="email registered with your folios"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <Label htmlFor="mb-period">Period</Label>
              <Select
                id="mb-period"
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
              <Label htmlFor="mb-portfolio">Portfolio</Label>
              <Select
                id="mb-portfolio"
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
              <Label htmlFor="mb-nick">Nickname</Label>
              <Input
                id="mb-nick"
                className="md:col-span-2"
                placeholder="optional"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={80}
              />
            </div>
            <div className="rounded border bg-muted/30 p-2 text-xs text-muted-foreground">
              <ShieldCheck className="inline h-3 w-3 mr-1" />
              PDF will be encrypted with this PAN. When the email arrives, we auto-decrypt and
              import it.
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={() => initiateMutation.mutate()} disabled={!canInitiate}>
                {initiateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Continue
              </Button>
            </DialogFooter>
          </div>
        ) : step.phase === 'captcha' ? (
          <div className="space-y-4">
            <div className="rounded border bg-muted/30 p-3 text-sm">
              CAS will be emailed to{' '}
              <span className="font-mono font-medium">{step.init.emailMasked}</span>. PDF
              password = the PAN above ({panMasked ?? 'profile'}).
            </div>

            {step.init.cams && (
              <div className="rounded border p-3 space-y-2">
                <p className="text-sm font-medium">CAMS</p>
                {camsRequiresCaptcha ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      CAMS requires a captcha to prevent automated abuse. Type what you see below.
                    </p>
                    <img
                      src={`data:image/png;base64,${step.init.cams.captchaImageBase64}`}
                      alt="CAMS captcha"
                      className="border bg-white"
                    />
                    <Input
                      placeholder="Captcha for CAMS"
                      value={camsCaptcha}
                      onChange={(e) => setCamsCaptcha(e.target.value)}
                      maxLength={20}
                      autoFocus
                    />
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Form opened — no captcha challenge. Click Submit to send the request.
                  </p>
                )}
              </div>
            )}

            {step.init.kfintech && (
              <div className="rounded border p-3 space-y-2">
                <p className="text-sm font-medium">KFintech</p>
                {kfinRequiresCaptcha ? (
                  <>
                    <p className="text-xs text-muted-foreground">
                      KFintech requires a captcha. Type what you see below.
                    </p>
                    <img
                      src={`data:image/png;base64,${step.init.kfintech.captchaImageBase64}`}
                      alt="KFintech captcha"
                      className="border bg-white"
                    />
                    <Input
                      placeholder="Captcha for KFintech"
                      value={kfinCaptcha}
                      onChange={(e) => setKfinCaptcha(e.target.value)}
                      maxLength={20}
                    />
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Form opened — no captcha challenge.
                  </p>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep({ phase: 'idle' })}>
                Back
              </Button>
              <Button
                onClick={() => {
                  setStep({ phase: 'submitting' });
                  submitMutation.mutate(step.init);
                }}
                disabled={!canSubmit}
              >
                {submitMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Submit CAS Request
              </Button>
            </DialogFooter>
          </div>
        ) : step.phase === 'submitting' ? (
          <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p>Submitting request to portal(s)...</p>
          </div>
        ) : step.phase === 'success' ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded border border-green-200 bg-green-50/50 p-3 text-sm">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">CAS request submitted</p>
                <p className="text-xs text-muted-foreground mt-1">
                  CAMS:{' '}
                  {step.result.cams
                    ? step.result.cams.ok
                      ? `OK${step.result.cams.requestRef ? ` (ref ${step.result.cams.requestRef})` : ''}`
                      : `failed — ${step.result.cams.message}`
                    : 'not requested'}
                </p>
                <p className="text-xs text-muted-foreground">
                  KFintech:{' '}
                  {step.result.kfintech
                    ? step.result.kfintech.ok
                      ? `OK${step.result.kfintech.requestRef ? ` (ref ${step.result.kfintech.requestRef})` : ''}`
                      : `failed — ${step.result.kfintech.message}`
                    : 'not requested'}
                </p>
                <p className="text-xs mt-2">
                  PDF arrives in your inbox in 5–60 min, encrypted with your saved PAN. Auto-imports
                  via Gmail integration.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : step.phase === 'error' ? (
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
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
