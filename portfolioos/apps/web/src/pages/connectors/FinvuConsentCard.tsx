/**
 * Account Aggregator consent card.
 *
 * Shows the user's existing consents (status + expiry) and lets them
 * initiate a new one. Initiating returns a redirect URL that opens in
 * a popup; in demo mode the popup is skipped and the consent flips
 * straight to APPROVED via a "Simulate approval" button.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plug,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { finfactorApi, type AaConsentDTO } from '@/api/finfactor.api';
import { apiErrorMessage } from '@/api/client';

const STATUS_TONES: Record<string, { label: string; cls: string }> = {
  INITIATED: { label: 'Initiated', cls: 'bg-muted text-muted-foreground ring-1 ring-border' },
  PENDING: { label: 'Pending', cls: 'bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20' },
  APPROVED: { label: 'Approved', cls: 'bg-positive/10 text-positive ring-1 ring-positive/20' },
  REJECTED: { label: 'Rejected', cls: 'bg-negative/10 text-negative ring-1 ring-negative/20' },
  EXPIRED: { label: 'Expired', cls: 'bg-negative/10 text-negative ring-1 ring-negative/20' },
  REVOKED: { label: 'Revoked', cls: 'bg-negative/10 text-negative ring-1 ring-negative/20' },
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function FinvuConsentCard() {
  const qc = useQueryClient();
  const [, setLastHandle] = useState<string | null>(null);

  const statusQ = useQuery({
    queryKey: ['finfactor-status'],
    queryFn: () => finfactorApi.status(),
    staleTime: 60_000,
  });

  const consentsQ = useQuery({
    queryKey: ['finfactor-consents'],
    queryFn: () => finfactorApi.listConsents(),
    refetchInterval: 10_000,
  });

  const initiate = useMutation({
    mutationFn: () =>
      finfactorApi.consentInitiate({
        fiTypes: ['MUTUAL_FUNDS', 'EQUITIES'],
      }),
    onSuccess: (result) => {
      setLastHandle(result.consent.consentHandle);
      qc.invalidateQueries({ queryKey: ['finfactor-consents'] });
      if (result.demoMode) {
        toast.success('[Demo] Consent initiated — click Simulate approval to mark it approved.');
        return;
      }
      if (result.consent.redirectUrl) {
        const popup = window.open(
          result.consent.redirectUrl,
          'finvu-consent',
          'width=460,height=720',
        );
        if (!popup) {
          toast.error('Popup blocked — allow popups for this site and retry');
          return;
        }
        toast.success('Consent flow opened in a popup. Approve in your bank app to continue.');
      } else {
        toast('Consent created — check Finvu for the redirect URL.', { icon: 'ℹ️' });
      }
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const approveDemo = useMutation({
    mutationFn: (handle: string) => finfactorApi.approveConsentDemo(handle),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finfactor-consents'] });
      toast.success('[Demo] Consent approved');
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const revoke = useMutation({
    mutationFn: (handle: string) => finfactorApi.revokeConsent(handle),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['finfactor-consents'] });
      toast.success('Consent revoked');
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  });

  const configured = statusQ.data?.configured ?? false;
  const demoMode = statusQ.data?.demoMode ?? false;
  const consents = consentsQ.data ?? [];
  const active = consents.find((c) => c.status === 'APPROVED');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-accent-ink" />
            Account Aggregator (Finvu)
          </div>
          <span
            className={`text-[10px] uppercase tracking-kerned px-2 py-1 rounded-full font-medium ${
              demoMode
                ? 'bg-accent/15 text-accent-ink ring-1 ring-accent/30'
                : configured
                ? 'bg-positive/10 text-positive ring-1 ring-positive/20'
                : 'bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20'
            }`}
          >
            {demoMode ? 'Demo mode' : configured ? 'Configured' : 'Token missing'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Pull mutual funds, deposits and equities directly from the user's linked banks via the
          RBI-regulated Account Aggregator framework. Once approved, holdings sync automatically.
        </p>

        {demoMode && (
          <div className="flex items-start gap-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent-ink">
            <Sparkles className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <div>
              Demo mode is active — no real consent flow is triggered. Initiating creates a
              fixture consent; click <strong>Simulate approval</strong> to mark it APPROVED.
            </div>
          </div>
        )}

        {!configured && !demoMode && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <div>
              Set <code className="font-mono">FINFACTOR_API_TOKEN</code> in the API env to enable
              consent flows.
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={!configured || initiate.isPending}
            onClick={() => initiate.mutate()}
          >
            {initiate.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plug className="h-3.5 w-3.5" />
            )}
            {active ? 'Re-initiate consent' : 'Connect via Finvu'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey: ['finfactor-consents'] })}
            disabled={consentsQ.isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${consentsQ.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {consents.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
            No consents yet. Click <strong>Connect via Finvu</strong> to initiate one.
          </div>
        ) : (
          <div className="space-y-2">
            {consents.map((c) => (
              <ConsentRow
                key={c.id}
                consent={c}
                demoMode={demoMode}
                onApprove={() => c.consentHandle && approveDemo.mutate(c.consentHandle)}
                onRevoke={() => c.consentHandle && revoke.mutate(c.consentHandle)}
                isApproving={approveDemo.isPending}
                isRevoking={revoke.isPending}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConsentRow({
  consent,
  demoMode,
  onApprove,
  onRevoke,
  isApproving,
  isRevoking,
}: {
  consent: AaConsentDTO;
  demoMode: boolean;
  onApprove: () => void;
  onRevoke: () => void;
  isApproving: boolean;
  isRevoking: boolean;
}) {
  const tone = STATUS_TONES[consent.status] ?? STATUS_TONES['INITIATED']!;
  const isPending = consent.status === 'INITIATED' || consent.status === 'PENDING';
  const isApproved = consent.status === 'APPROVED';
  return (
    <div className="rounded-md border border-border bg-card/40 px-3 py-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {isApproved && <CheckCircle2 className="h-3.5 w-3.5 text-positive" />}
          <span className="font-mono text-[10.5px] text-muted-foreground truncate">
            {consent.consentHandle ?? consent.id}
          </span>
        </div>
        <span
          className={`text-[10px] uppercase tracking-kerned px-2 py-0.5 rounded-full font-medium ${tone.cls}`}
        >
          {tone.label}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
        <div>
          <div className="text-muted-foreground uppercase tracking-wide text-[9.5px]">
            Initiated
          </div>
          <div>{fmtDate(consent.initiatedAt)}</div>
        </div>
        <div>
          <div className="text-muted-foreground uppercase tracking-wide text-[9.5px]">
            Approved
          </div>
          <div>{fmtDate(consent.approvedAt)}</div>
        </div>
        <div>
          <div className="text-muted-foreground uppercase tracking-wide text-[9.5px]">
            Expires
          </div>
          <div>{fmtDate(consent.expiresAt)}</div>
        </div>
        <div>
          <div className="text-muted-foreground uppercase tracking-wide text-[9.5px]">
            FI types
          </div>
          <div className="truncate">{consent.fiTypes.join(', ') || '—'}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {demoMode && isPending && (
          <Button size="sm" variant="outline" onClick={onApprove} disabled={isApproving}>
            {isApproving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Simulate approval
          </Button>
        )}
        {!demoMode && isPending && consent.redirectUrl && (
          <a
            href={consent.redirectUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted/50"
          >
            <ExternalLink className="h-3 w-3" />
            Open Finvu
          </a>
        )}
        {isApproved && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRevoke}
            disabled={isRevoking}
            className="text-negative hover:text-negative"
          >
            {isRevoking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            Revoke
          </Button>
        )}
      </div>
    </div>
  );
}
