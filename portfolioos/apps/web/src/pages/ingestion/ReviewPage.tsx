import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Inbox,
  RefreshCw,
  X,
  Zap,
  CheckCircle2,
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
import {
  canonicalEventsApi,
  type CanonicalEventDTO,
  type CanonicalEventStatus,
} from '@/api/canonicalEvents.api';
import { monitoredSendersApi } from '@/api/monitoredSenders.api';
import { apiErrorMessage } from '@/api/client';

type Tab = 'pending' | 'projected' | 'rejected';

const TAB_STATUSES: Record<Tab, CanonicalEventStatus[]> = {
  pending: ['PARSED', 'PENDING_REVIEW'],
  projected: ['PROJECTED'],
  rejected: ['REJECTED', 'FAILED', 'ARCHIVED'],
};

const TAB_LABEL: Record<Tab, string> = {
  pending: 'Pending review',
  projected: 'Auto-committed',
  rejected: 'Rejected / failed',
};

/**
 * §6.8 — three-tab review queue for CanonicalEvents.
 *
 * Server can only filter by ONE status per call, so on tab switch we fire
 * one request per status in the tab's set and merge. For the projected
 * and rejected tabs this is fine (one status each). For "pending" we fire
 * two requests but they run concurrent via tanstack-query's parallel
 * `useQuery`, and the page doesn't care about global ordering across
 * statuses — rows sort by eventDate within each sub-list.
 */
export function ReviewPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('pending');
  const [detail, setDetail] = useState<CanonicalEventDTO | null>(null);

  const { data: sendersList } = useQuery({
    queryKey: ['monitored-senders'],
    queryFn: () => monitoredSendersApi.list(),
  });

  const parsedQuery = useQuery({
    queryKey: ['canonical-events', 'PARSED'],
    queryFn: () => canonicalEventsApi.list({ status: 'PARSED', limit: 200 }),
    enabled: tab === 'pending',
  });
  const pendingReviewQuery = useQuery({
    queryKey: ['canonical-events', 'PENDING_REVIEW'],
    queryFn: () => canonicalEventsApi.list({ status: 'PENDING_REVIEW', limit: 200 }),
    enabled: tab === 'pending',
  });
  const projectedQuery = useQuery({
    queryKey: ['canonical-events', 'PROJECTED'],
    queryFn: () => canonicalEventsApi.list({ status: 'PROJECTED', limit: 200 }),
    enabled: tab === 'projected',
  });
  const rejectedQuery = useQuery({
    queryKey: ['canonical-events', 'REJECTED'],
    queryFn: () => canonicalEventsApi.list({ status: 'REJECTED', limit: 200 }),
    enabled: tab === 'rejected',
  });
  const failedQuery = useQuery({
    queryKey: ['canonical-events', 'FAILED'],
    queryFn: () => canonicalEventsApi.list({ status: 'FAILED', limit: 200 }),
    enabled: tab === 'rejected',
  });
  const archivedQuery = useQuery({
    queryKey: ['canonical-events', 'ARCHIVED'],
    queryFn: () => canonicalEventsApi.list({ status: 'ARCHIVED', limit: 200 }),
    enabled: tab === 'rejected',
  });

  const rows: CanonicalEventDTO[] = useMemo(() => {
    const combined: CanonicalEventDTO[] = [];
    const push = (arr: CanonicalEventDTO[] | undefined) => {
      if (arr) combined.push(...arr);
    };
    if (tab === 'pending') {
      push(parsedQuery.data);
      push(pendingReviewQuery.data);
    } else if (tab === 'projected') {
      push(projectedQuery.data);
    } else {
      push(rejectedQuery.data);
      push(failedQuery.data);
      push(archivedQuery.data);
    }
    return combined.sort((a, b) => {
      if (a.eventDate !== b.eventDate) {
        return a.eventDate < b.eventDate ? 1 : -1;
      }
      return a.createdAt < b.createdAt ? 1 : -1;
    });
  }, [
    tab,
    parsedQuery.data,
    pendingReviewQuery.data,
    projectedQuery.data,
    rejectedQuery.data,
    failedQuery.data,
    archivedQuery.data,
  ]);

  const isLoading =
    (tab === 'pending' && (parsedQuery.isLoading || pendingReviewQuery.isLoading)) ||
    (tab === 'projected' && projectedQuery.isLoading) ||
    (tab === 'rejected' &&
      (rejectedQuery.isLoading || failedQuery.isLoading || archivedQuery.isLoading));

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
        if (r.senderReachedAutoCommit && r.event.senderAddress) {
          toast(
            (t) => (
              <span className="flex items-center gap-2 text-sm">
                <Zap className="h-4 w-4 text-accent" />
                {r.event.senderAddress} is reliable. Enable auto-commit on the
                Senders page.
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    toast.dismiss(t.id);
                    window.location.href = '/ingestion/senders';
                  }}
                >
                  Go
                </Button>
              </span>
            ),
            { duration: 10000 },
          );
        }
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
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not enable auto-commit')),
  });

  /**
   * Senders that have crossed their auto-commit threshold but haven't been
   * flipped yet — the banner at the top of the Pending tab nudges the
   * user to trust them. Quiet when no senders qualify.
   */
  const autoCommitCandidates =
    sendersList?.filter(
      (s) =>
        !s.autoCommitEnabled &&
        s.confirmedEventCount >= s.autoCommitAfter &&
        s.isActive,
    ) ?? [];

  return (
    <div>
      <PageHeader
        title="Review ingestion"
        description="Canonical events extracted from your email. Approve to commit them to transactions; reject to drop them."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['canonical-events'] })}
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        }
      />

      {tab === 'pending' && autoCommitCandidates.length > 0 && (
        <Card className="mb-4 border-accent/50 bg-accent/5">
          <CardContent className="py-4 space-y-2">
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
                    skip review for future events?
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={enableAutoCommitMut.isPending}
                  onClick={() => enableAutoCommitMut.mutate(s.id)}
                >
                  Enable auto-commit
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-1 mb-4">
        {(Object.keys(TAB_STATUSES) as Tab[]).map((t) => (
          <Button
            key={t}
            variant={tab === t ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab(t)}
          >
            {TAB_LABEL[t]}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{TAB_LABEL[tab]}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Inbox}
                title={
                  tab === 'pending'
                    ? 'Inbox is clear'
                    : tab === 'projected'
                      ? 'Nothing auto-committed yet'
                      : 'No rejected or failed events'
                }
                description={
                  tab === 'pending'
                    ? 'No events are waiting for review. New emails from your monitored senders will show up here.'
                    : tab === 'projected'
                      ? 'Once a sender earns auto-commit, events from it will land here directly instead of the review queue.'
                      : 'Nothing to see — clean history.'
                }
              />
            </div>
          ) : (
            <EventsTable
              rows={rows}
              mode={tab}
              bulkPending={bulkApproveMut.isPending}
              onBulkApprove={(addr) => bulkApproveMut.mutate(addr)}
              onRowClick={setDetail}
              onApprove={(id) => approveMut.mutate(id)}
              onReject={(id) => rejectMut.mutate({ id })}
              approvingId={
                approveMut.isPending ? (approveMut.variables as string) : null
              }
              rejectingId={
                rejectMut.isPending
                  ? (rejectMut.variables as { id: string }).id
                  : null
              }
            />
          )}
        </CardContent>
      </Card>

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

function EventsTable({
  rows,
  mode,
  bulkPending,
  onBulkApprove,
  onRowClick,
  onApprove,
  onReject,
  approvingId,
  rejectingId,
}: {
  rows: CanonicalEventDTO[];
  mode: Tab;
  bulkPending: boolean;
  onBulkApprove: (senderAddress: string) => void;
  onRowClick: (row: CanonicalEventDTO) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  approvingId: string | null;
  rejectingId: string | null;
}) {
  // Group by sender so the pending tab can offer per-sender bulk-approve.
  const groups = useMemo(() => {
    const m = new Map<string, CanonicalEventDTO[]>();
    for (const r of rows) {
      const key = r.senderAddress ?? '(unknown sender)';
      const existing = m.get(key);
      if (existing) existing.push(r);
      else m.set(key, [r]);
    }
    return Array.from(m.entries());
  }, [rows]);

  return (
    <div className="divide-y">
      {groups.map(([sender, group]) => (
        <div key={sender}>
          <div className="flex items-center justify-between bg-muted/30 px-4 py-2">
            <div className="text-xs font-mono text-muted-foreground">
              {sender} · {group.length} event{group.length === 1 ? '' : 's'}
            </div>
            {mode === 'pending' && sender !== '(unknown sender)' && group.length > 1 && (
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
                    {mode === 'pending' ? (
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
                    ) : (
                      <StatusBadge status={r.status} />
                    )}
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
  );
}

function StatusBadge({ status }: { status: CanonicalEventStatus }) {
  const tone = {
    PROJECTED: 'text-positive',
    REJECTED: 'text-muted-foreground',
    FAILED: 'text-negative',
    ARCHIVED: 'text-amber-600',
    PARSED: 'text-accent',
    PENDING_REVIEW: 'text-accent',
    CONFIRMED: 'text-positive',
  }[status];
  const Icon =
    status === 'PROJECTED'
      ? CheckCircle2
      : status === 'FAILED' || status === 'REJECTED'
        ? AlertTriangle
        : CheckCircle2;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${tone}`}>
      <Icon className="h-3 w-3" />
      {status.replace('_', ' ').toLowerCase()}
    </span>
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
    event && (event.status === 'PARSED' || event.status === 'PENDING_REVIEW');

  return (
    <Dialog open={Boolean(event)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Canonical event</DialogTitle>
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
              <DetailField
                label="Quantity"
                value={event.quantity ?? '—'}
                mono
              />
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
                    Approve & commit
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
