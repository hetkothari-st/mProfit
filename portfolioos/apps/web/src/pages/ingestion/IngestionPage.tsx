import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Chrome,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { mailboxesApi, type MailboxDTO } from '@/api/mailboxes.api';
import { gmailApi } from '@/api/gmail.api';
import {
  ingestionApi,
  type DiscoveredSenderDTO,
} from '@/api/ingestion.api';
import {
  monitoredSendersApi,
  type MonitoredSenderDTO,
} from '@/api/monitoredSenders.api';
import {
  canonicalEventsApi,
  type CanonicalEventDTO,
} from '@/api/canonicalEvents.api';
import { apiErrorMessage } from '@/api/client';

/**
 * §6 unified ingestion landing. One screen walks the user through:
 *   1. Connect Gmail (shortcut to /mailboxes if none)
 *   2. Discover + pick senders (scan per Gmail, multi-select add)
 *   3. Review incoming events (pending queue, approve / reject / bulk)
 * Power-user sender config lives at /ingestion/senders; deep event history
 * at /ingestion/history. Rebuild of the prior 3-page flow per user feedback.
 */
export function IngestionPage() {
  const qc = useQueryClient();
  const [detail, setDetail] = useState<CanonicalEventDTO | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const autoDiscover = searchParams.get('auto-discover') === '1';

  const mailboxesQuery = useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => mailboxesApi.list(),
  });
  const sendersQuery = useQuery({
    queryKey: ['monitored-senders'],
    queryFn: () => monitoredSendersApi.list(),
  });
  const parsedQuery = useQuery({
    queryKey: ['canonical-events', 'PARSED'],
    queryFn: () => canonicalEventsApi.list({ status: 'PARSED', limit: 200 }),
  });
  const pendingReviewQuery = useQuery({
    queryKey: ['canonical-events', 'PENDING_REVIEW'],
    queryFn: () =>
      canonicalEventsApi.list({ status: 'PENDING_REVIEW', limit: 200 }),
  });

  const gmailMailboxes = (mailboxesQuery.data ?? []).filter(
    (m) => m.provider === 'GMAIL_OAUTH',
  );
  const senders = sendersQuery.data ?? [];
  const hasGmail = gmailMailboxes.length > 0;
  const hasSenders = senders.length > 0;

  const pendingEvents: CanonicalEventDTO[] = useMemo(() => {
    const combined: CanonicalEventDTO[] = [
      ...(parsedQuery.data ?? []),
      ...(pendingReviewQuery.data ?? []),
    ];
    return combined.sort((a, b) => {
      if (a.eventDate !== b.eventDate) return a.eventDate < b.eventDate ? 1 : -1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
  }, [parsedQuery.data, pendingReviewQuery.data]);

  const autoCommitCandidates = senders.filter(
    (s) =>
      !s.autoCommitEnabled &&
      s.confirmedEventCount >= s.autoCommitAfter &&
      s.isActive,
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['canonical-events'] });
    qc.invalidateQueries({ queryKey: ['monitored-senders'] });
  };

  const approveMut = useMutation({
    mutationFn: (id: string) => canonicalEventsApi.approve(id),
    onSuccess: (r) => {
      if (r.projection.kind === 'failed') {
        toast.error(
          `Approval rolled back — projection failed: ${r.projection.message ?? r.projection.reason}`,
        );
      } else {
        toast.success('Event approved and committed');
      }
      setDetail(null);
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Approval failed')),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      canonicalEventsApi.reject(id, reason),
    onSuccess: () => {
      toast.success('Event rejected');
      setDetail(null);
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Reject failed')),
  });

  const bulkApproveMut = useMutation({
    mutationFn: (senderAddress: string) =>
      canonicalEventsApi.bulkApprove(senderAddress),
    onSuccess: (r) => {
      toast.success(
        `Bulk approved: ${r.approved} succeeded, ${r.failed} failed of ${r.requested}`,
      );
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Bulk approve failed')),
  });

  const enableAutoCommitMut = useMutation({
    mutationFn: (senderId: string) =>
      monitoredSendersApi.update(senderId, { autoCommitEnabled: true }),
    onSuccess: () => {
      toast.success('Auto-commit enabled');
      invalidate();
    },
    onError: (e) =>
      toast.error(apiErrorMessage(e, 'Could not enable auto-commit')),
  });

  const loading =
    mailboxesQuery.isLoading ||
    sendersQuery.isLoading ||
    parsedQuery.isLoading ||
    pendingReviewQuery.isLoading;

  return (
    <div>
      <PageHeader
        title="Email ingestion"
        description="Automatically capture transactions from your bank, broker, and insurer emails. Everything is reviewable before it lands in your records."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['canonical-events'] });
              qc.invalidateQueries({ queryKey: ['mailboxes'] });
              qc.invalidateQueries({ queryKey: ['monitored-senders'] });
            }}
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        }
      />

      <StatusStrip
        hasGmail={hasGmail}
        hasSenders={hasSenders}
        pendingCount={pendingEvents.length}
        senderCount={senders.length}
      />

      <div className="space-y-6 mt-6">
        <ConnectStep mailboxes={gmailMailboxes} loading={mailboxesQuery.isLoading} />

        {hasGmail && (
          <SendersStep
            gmailMailboxes={gmailMailboxes}
            senders={senders}
            onChange={invalidate}
            autoDiscover={autoDiscover}
            onAutoDiscoverConsumed={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('auto-discover');
              setSearchParams(next, { replace: true });
            }}
          />
        )}

        <ReviewStep
          loading={loading}
          hasGmail={hasGmail}
          hasSenders={hasSenders}
          events={pendingEvents}
          autoCommitCandidates={autoCommitCandidates}
          onRowClick={setDetail}
          onApprove={(id) => approveMut.mutate(id)}
          onReject={(id) => rejectMut.mutate({ id })}
          onBulkApprove={(a) => bulkApproveMut.mutate(a)}
          onEnableAutoCommit={(id) => enableAutoCommitMut.mutate(id)}
          approvingId={
            approveMut.isPending ? (approveMut.variables as string) : null
          }
          rejectingId={
            rejectMut.isPending
              ? (rejectMut.variables as { id: string }).id
              : null
          }
          bulkPending={bulkApproveMut.isPending}
          enableAutoCommitPending={enableAutoCommitMut.isPending}
        />
      </div>

      <EventDetailDialog
        event={detail}
        onClose={() => setDetail(null)}
        onApprove={(id) => approveMut.mutate(id)}
        onReject={(id, reason) => rejectMut.mutate({ id, reason })}
        actionPending={approveMut.isPending || rejectMut.isPending}
      />
    </div>
  );
}

function StatusStrip({
  hasGmail,
  hasSenders,
  pendingCount,
  senderCount,
}: {
  hasGmail: boolean;
  hasSenders: boolean;
  pendingCount: number;
  senderCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <StatusChip
        done={hasGmail}
        label={hasGmail ? 'Gmail connected' : 'Connect Gmail'}
      />
      <StatusChip
        done={hasSenders}
        label={
          hasSenders ? `${senderCount} sender${senderCount === 1 ? '' : 's'}` : 'Add senders'
        }
      />
      <StatusChip
        done={pendingCount === 0 && hasSenders}
        label={
          pendingCount > 0
            ? `${pendingCount} event${pendingCount === 1 ? '' : 's'} to review`
            : 'Inbox clear'
        }
        tone={pendingCount > 0 ? 'attention' : 'done'}
      />
      <div className="ml-auto">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/ingestion/senders">
            <Settings2 className="h-3 w-3" /> Sender settings
          </Link>
        </Button>
      </div>
    </div>
  );
}

function StatusChip({
  done,
  label,
  tone,
}: {
  done: boolean;
  label: string;
  tone?: 'done' | 'attention' | 'todo';
}) {
  const variant = tone ?? (done ? 'done' : 'todo');
  const classes =
    variant === 'done'
      ? 'bg-positive/10 text-positive border-positive/20'
      : variant === 'attention'
        ? 'bg-accent/10 text-accent border-accent/20'
        : 'bg-muted text-muted-foreground border-border';
  const Icon = variant === 'done' ? CheckCircle2 : AlertTriangle;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${classes}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function ConnectStep({
  mailboxes,
  loading,
}: {
  mailboxes: MailboxDTO[];
  loading: boolean;
}) {
  const connectMut = useMutation({
    mutationFn: () => gmailApi.authUrl(),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to start Google sign-in')),
  });

  const disconnectMut = useMutation({
    mutationFn: (id: string) => gmailApi.remove(id),
    onSuccess: () => toast.success('Gmail disconnected'),
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to disconnect')),
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Loading email accounts…
        </CardContent>
      </Card>
    );
  }

  if (mailboxes.length === 0) {
    return (
      <Card className="border-accent/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-bold">
              1
            </span>
            Connect your email
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Chrome}
            title="No Gmail connected yet"
            description="PortfolioOS scans Gmail for financial emails (read-only) and turns them into transactions. Connect once — we never scan anything except the senders you explicitly allow."
            action={
              <Button onClick={() => connectMut.mutate()} disabled={connectMut.isPending}>
                {connectMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Chrome className="h-4 w-4" />
                )}
                Connect Gmail
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-positive/20 text-positive text-xs font-bold">
            <Check className="h-3.5 w-3.5" />
          </span>
          Email accounts
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => connectMut.mutate()}
          disabled={connectMut.isPending}
        >
          {connectMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Chrome className="h-3 w-3" />}
          Add another
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {mailboxes.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between border rounded-md px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Chrome className="h-4 w-4 shrink-0 text-accent" />
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">
                  {m.googleEmail ?? m.label ?? 'Gmail'}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {m.lastPolledAt
                    ? `Last checked ${new Date(m.lastPolledAt).toLocaleString()}`
                    : 'Not polled yet'}
                  {m.lastError ? ` · ${m.lastError}` : ''}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={
                  m.isActive
                    ? 'text-[11px] text-positive'
                    : 'text-[11px] text-muted-foreground'
                }
              >
                {m.isActive ? 'Active' : 'Paused'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (confirm(`Disconnect ${m.googleEmail ?? m.label ?? 'this Gmail'}?`)) {
                    disconnectMut.mutate(m.id);
                  }
                }}
                disabled={disconnectMut.isPending}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SendersStep({
  gmailMailboxes,
  senders,
  onChange,
  autoDiscover,
  onAutoDiscoverConsumed,
}: {
  gmailMailboxes: MailboxDTO[];
  senders: MonitoredSenderDTO[];
  onChange: () => void;
  autoDiscover?: boolean;
  onAutoDiscoverConsumed?: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-bold">
            2
          </span>
          Senders to monitor
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Only addresses on this list are fetched. Scan your inbox for financial
          senders, then pick the ones you want us to watch.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {gmailMailboxes.map((m, idx) => (
          <DiscoveryCard
            key={m.id}
            mailbox={m}
            existingAddresses={new Set(senders.map((s) => s.address.toLowerCase()))}
            onAdded={onChange}
            autoTrigger={Boolean(autoDiscover) && idx === 0}
            onAutoTriggered={onAutoDiscoverConsumed}
          />
        ))}

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Currently monitored ({senders.length})
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/ingestion/senders">
                Auto-commit settings <ChevronRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
          {senders.length === 0 ? (
            <div className="text-sm text-muted-foreground border border-dashed rounded-md px-3 py-4 text-center">
              No senders yet. Scan above, or add manually from the settings page.
            </div>
          ) : (
            <ul className="space-y-1">
              {senders.map((s) => (
                <SenderChip key={s.id} sender={s} onChange={onChange} />
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DiscoveryCard({
  mailbox,
  existingAddresses,
  onAdded,
  autoTrigger,
  onAutoTriggered,
}: {
  mailbox: MailboxDTO;
  existingAddresses: Set<string>;
  onAdded: () => void;
  autoTrigger?: boolean;
  onAutoTriggered?: () => void;
}) {
  const [results, setResults] = useState<DiscoveredSenderDTO[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const autoFiredRef = useRef(false);

  const scanMut = useMutation({
    mutationFn: () => ingestionApi.discover(mailbox.id),
    onSuccess: (r) => {
      setResults(r);
      setSelected(new Set());
      toast.success(
        r.length === 0
          ? 'Scan complete — no financial senders found'
          : `Found ${r.length} financial sender${r.length === 1 ? '' : 's'}`,
      );
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Scan failed')),
  });

  const addMut = useMutation({
    mutationFn: async (picks: DiscoveredSenderDTO[]) => {
      const results = await Promise.allSettled(
        picks.map((s) =>
          monitoredSendersApi.create({
            address: s.address,
            displayLabel:
              s.seedMatch?.suggestedDisplayLabel ?? s.displayName ?? null,
          }),
        ),
      );
      return {
        added: results.filter((r) => r.status === 'fulfilled').length,
        failed: results.filter((r) => r.status === 'rejected').length,
      };
    },
    onSuccess: ({ added, failed }) => {
      if (added > 0) {
        toast.success(
          `Added ${added} sender${added === 1 ? '' : 's'}${failed > 0 ? ` · ${failed} failed` : ''}`,
        );
      } else if (failed > 0) {
        toast.error(`All ${failed} add operations failed`);
      }
      setSelected(new Set());
      onAdded();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not add senders')),
  });

  // Auto-fire scan once when prompted (e.g. just after Gmail OAuth callback).
  // Also auto-selects all unpicked seed-matched senders so the user can hit
  // "Add" with one click after the scan completes.
  useEffect(() => {
    if (!autoTrigger || autoFiredRef.current) return;
    autoFiredRef.current = true;
    scanMut.mutate(undefined, {
      onSuccess: (r) => {
        const preselect = new Set<string>();
        for (const s of r) {
          if (existingAddresses.has(s.address.toLowerCase())) continue;
          if (s.seedMatch || s.score >= 4) preselect.add(s.address);
        }
        setSelected(preselect);
        onAutoTriggered?.();
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrigger]);

  const unpickedResults = (results ?? []).filter(
    (s) => !existingAddresses.has(s.address.toLowerCase()),
  );

  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          <Chrome className="h-4 w-4 shrink-0 text-accent" />
          <span className="font-medium text-sm truncate">
            {mailbox.googleEmail ?? mailbox.label ?? 'Gmail'}
          </span>
          {results !== null && (
            <span className="text-[11px] text-muted-foreground">
              · {unpickedResults.length} new candidate
              {unpickedResults.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant={results === null ? 'default' : 'outline'}
          onClick={() => scanMut.mutate()}
          disabled={scanMut.isPending}
        >
          {scanMut.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : results ? (
            <RefreshCw className="h-3 w-3" />
          ) : (
            <Search className="h-3 w-3" />
          )}
          {scanMut.isPending ? 'Scanning…' : results ? 'Re-scan' : 'Scan inbox'}
        </Button>
      </div>

      {results === null ? (
        <div className="px-3 py-4 text-xs text-muted-foreground">
          Click <span className="font-medium">Scan inbox</span> to look through
          the last 2 years of mail for likely bank, broker, and insurer senders.
          No emails are sent anywhere — scoring is done locally from subject
          keywords.
        </div>
      ) : unpickedResults.length === 0 ? (
        <div className="px-3 py-4 text-xs text-muted-foreground text-center">
          {results.length === 0
            ? 'No financial senders detected in this inbox.'
            : 'Every detected sender is already on your monitor list.'}
        </div>
      ) : (
        <div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-8 px-3 py-1.5 text-left">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={
                        selected.size === unpickedResults.length &&
                        unpickedResults.length > 0
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelected(
                            new Set(unpickedResults.map((s) => s.address)),
                          );
                        } else {
                          setSelected(new Set());
                        }
                      }}
                    />
                  </th>
                  <th className="px-3 py-1.5 text-left font-medium">Sender</th>
                  <th className="px-3 py-1.5 text-left font-medium">Match</th>
                  <th className="px-3 py-1.5 text-right font-medium">Score</th>
                  <th className="px-3 py-1.5 text-right font-medium">Mail</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {unpickedResults.map((s) => {
                  const checked = selected.has(s.address);
                  return (
                    <tr
                      key={s.address}
                      className={`hover:bg-muted/30 cursor-pointer ${checked ? 'bg-accent/5' : ''}`}
                      onClick={() => {
                        const next = new Set(selected);
                        if (checked) next.delete(s.address);
                        else next.add(s.address);
                        setSelected(next);
                      }}
                    >
                      <td
                        className="px-3 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Select ${s.address}`}
                          checked={checked}
                          onChange={() => {
                            const next = new Set(selected);
                            if (checked) next.delete(s.address);
                            else next.add(s.address);
                            setSelected(next);
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-sm">
                          {s.displayName ?? s.address}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {s.address}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {s.seedMatch ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                            <CheckCircle2 className="h-3 w-3" />
                            {s.seedMatch.institutionName}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            Unknown — review manually
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {s.score.toFixed(1)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        {s.messageCount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/20">
            <div className="text-xs text-muted-foreground">
              {selected.size > 0
                ? `${selected.size} selected`
                : 'Tick senders to add'}
            </div>
            <Button
              size="sm"
              disabled={selected.size === 0 || addMut.isPending}
              onClick={() => {
                const picks = unpickedResults.filter((s) =>
                  selected.has(s.address),
                );
                addMut.mutate(picks);
              }}
            >
              {addMut.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Add {selected.size > 0 ? `${selected.size} ` : ''}sender
              {selected.size === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SenderChip({
  sender,
  onChange,
}: {
  sender: MonitoredSenderDTO;
  onChange: () => void;
}) {
  const removeMut = useMutation({
    mutationFn: () => monitoredSendersApi.remove(sender.id),
    onSuccess: () => {
      toast.success('Sender removed');
      onChange();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not remove sender')),
  });

  return (
    <li className="flex items-center justify-between border rounded-md px-3 py-1.5 text-sm">
      <div className="min-w-0 flex items-center gap-2">
        <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className="truncate font-medium">
            {sender.displayLabel ?? sender.address}
          </div>
          <div className="text-[11px] text-muted-foreground font-mono truncate">
            {sender.address}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {sender.autoCommitEnabled && (
          <span className="inline-flex items-center gap-0.5 text-[11px] text-accent">
            <Zap className="h-3 w-3" /> Auto
          </span>
        )}
        <span
          className={
            sender.isActive
              ? 'text-[11px] text-positive'
              : 'text-[11px] text-muted-foreground'
          }
        >
          {sender.isActive ? 'Active' : 'Paused'}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={removeMut.isPending}
          onClick={() => {
            if (!confirm(`Remove ${sender.address}?`)) return;
            removeMut.mutate();
          }}
          title="Remove sender"
        >
          <Trash2 className="h-3 w-3 text-negative" />
        </Button>
      </div>
    </li>
  );
}

function ReviewStep({
  loading,
  hasGmail,
  hasSenders,
  events,
  autoCommitCandidates,
  onRowClick,
  onApprove,
  onReject,
  onBulkApprove,
  onEnableAutoCommit,
  approvingId,
  rejectingId,
  bulkPending,
  enableAutoCommitPending,
}: {
  loading: boolean;
  hasGmail: boolean;
  hasSenders: boolean;
  events: CanonicalEventDTO[];
  autoCommitCandidates: MonitoredSenderDTO[];
  onRowClick: (e: CanonicalEventDTO) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onBulkApprove: (senderAddress: string) => void;
  onEnableAutoCommit: (senderId: string) => void;
  approvingId: string | null;
  rejectingId: string | null;
  bulkPending: boolean;
  enableAutoCommitPending: boolean;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, CanonicalEventDTO[]>();
    for (const r of events) {
      const key = r.senderAddress ?? '(unknown sender)';
      const existing = m.get(key);
      if (existing) existing.push(r);
      else m.set(key, [r]);
    }
    return Array.from(m.entries());
  }, [events]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-bold">
              3
            </span>
            Pending review
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Events parsed from your monitored senders, waiting for your approval
            before they land as transactions.
          </p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/ingestion/history">
            See committed / rejected <ChevronRight className="h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>

      {autoCommitCandidates.length > 0 && (
        <div className="px-6">
          <div className="rounded-md border border-accent/40 bg-accent/5 px-3 py-2 mb-3 space-y-2">
            {autoCommitCandidates.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-accent" />
                  <span>
                    <span className="font-medium">
                      {s.displayLabel ?? s.address}
                    </span>{' '}
                    has {s.confirmedEventCount} confirmed events. Trust it and
                    skip review next time?
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={enableAutoCommitPending}
                  onClick={() => onEnableAutoCommit(s.id)}
                >
                  Enable auto-commit
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading…</div>
        ) : events.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Inbox}
              title={
                !hasGmail
                  ? 'Connect Gmail to start receiving events'
                  : !hasSenders
                    ? 'Add at least one sender to start receiving events'
                    : 'Inbox is clear'
              }
              description={
                !hasGmail
                  ? 'Step 1 above — without a connected Gmail, we have nothing to poll.'
                  : !hasSenders
                    ? 'Step 2 above — add the bank / broker / insurer addresses you want us to watch.'
                    : 'Nothing waiting for review. New emails from your monitored senders will show up here (poller runs every 10 minutes).'
              }
            />
          </div>
        ) : (
          <div className="divide-y">
            {groups.map(([sender, group]) => (
              <div key={sender}>
                <div className="flex items-center justify-between bg-muted/30 px-4 py-2">
                  <div className="text-xs font-mono text-muted-foreground">
                    {sender} · {group.length} event
                    {group.length === 1 ? '' : 's'}
                  </div>
                  {sender !== '(unknown sender)' && group.length > 1 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={bulkPending}
                      onClick={() => onBulkApprove(sender)}
                    >
                      <Check className="h-3 w-3" />
                      Approve all
                    </Button>
                  )}
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    {group.map((r) => (
                      <tr
                        key={r.id}
                        className="hover:bg-muted/30 cursor-pointer"
                        onClick={() => onRowClick(r)}
                      >
                        <td className="px-4 py-2 w-28 text-xs text-muted-foreground">
                          {r.eventDate}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-block px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium tracking-wide">
                              {r.eventType}
                            </span>
                            <span className="text-sm truncate">
                              {r.counterparty ??
                                r.instrumentSymbol ??
                                r.instrumentName ??
                                '—'}
                            </span>
                          </div>
                          {r.parserNotes && (
                            <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                              {r.parserNotes}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-sm">
                          {r.amount ? `₹${r.amount}` : '—'}
                        </td>
                        <td className="px-4 py-2 w-32 text-right">
                          <div
                            className="flex justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={approvingId === r.id}
                              onClick={() => onApprove(r.id)}
                            >
                              <Check className="h-3 w-3 text-positive" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={rejectingId === r.id}
                              onClick={() => onReject(r.id)}
                            >
                              <X className="h-3 w-3 text-negative" />
                            </Button>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground w-8">
                          <ChevronRight className="h-3 w-3" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EventDetailDialog({
  event,
  onClose,
  onApprove,
  onReject,
  actionPending,
}: {
  event: CanonicalEventDTO | null;
  onClose: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string, reason?: string) => void;
  actionPending: boolean;
}) {
  const [rejectReason, setRejectReason] = useState('');
  const reviewable =
    event &&
    (event.status === 'PARSED' || event.status === 'PENDING_REVIEW');

  return (
    <Dialog open={Boolean(event)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Event details</DialogTitle>
        </DialogHeader>
        {event && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <DetailField label="Type" value={event.eventType} />
              <DetailField label="Status" value={event.status} />
              <DetailField label="Event date" value={event.eventDate} />
              <DetailField
                label="Confidence"
                value={`${(Number.parseFloat(event.confidence) * 100).toFixed(0)}%`}
              />
              <DetailField
                label="Amount"
                value={event.amount ? `₹${event.amount}` : '—'}
                mono
              />
              <DetailField label="Quantity" value={event.quantity ?? '—'} mono />
              <DetailField label="Counterparty" value={event.counterparty ?? '—'} />
              <DetailField
                label="Instrument"
                value={
                  event.instrumentSymbol ??
                  event.instrumentName ??
                  event.instrumentIsin ??
                  '—'
                }
              />
              <DetailField
                label="Sender"
                value={event.senderAddress ?? '—'}
                mono
              />
              <DetailField
                label="Source"
                value={`${event.sourceAdapter} v${event.sourceAdapterVer}`}
                mono
              />
            </div>

            {event.sourceAdapter.startsWith('gmail') && event.sourceRef && (
              <a
                href={`https://mail.google.com/mail/u/0/#inbox/${event.sourceRef}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
              >
                <Mail className="h-3 w-3" /> View original in Gmail
              </a>
            )}

            {event.parserNotes && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Parser notes
                </div>
                <div className="rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap">
                  {event.parserNotes}
                </div>
              </div>
            )}

            {event.rejectionReason && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Rejection reason
                </div>
                <div className="rounded-md bg-muted/40 p-3 text-xs whitespace-pre-wrap">
                  {event.rejectionReason}
                </div>
              </div>
            )}

            {reviewable && (
              <div className="border-t pt-4 space-y-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Rejection reason (optional)
                  </div>
                  <input
                    className="w-full border rounded-md px-2 py-1 text-sm"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g. promotional email, not a real transaction"
                  />
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button
                    variant="outline"
                    disabled={actionPending}
                    onClick={() =>
                      onReject(event.id, rejectReason.trim() || undefined)
                    }
                  >
                    <X className="h-4 w-4 text-negative" />
                    Reject
                  </Button>
                  <Button
                    disabled={actionPending}
                    onClick={() => onApprove(event.id)}
                  >
                    <Check className="h-4 w-4" />
                    Approve &amp; commit
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div className={mono ? 'text-sm font-mono break-all' : 'text-sm break-words'}>
        {value}
      </div>
    </div>
  );
}
