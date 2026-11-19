import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  SUPPORT_TOPIC_LABELS,
  formatDateTimeIST,
  type AdminSupportTicketDTO,
  type SupportStatus,
} from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/api/client';
import { supportAdminApi } from '@/api/support.api';
import { useAuthStore } from '@/stores/auth.store';

const QUERY_KEY = ['admin-support-tickets'];

function TicketCard({ ticket, onChanged }: { ticket: AdminSupportTicketDTO; onChanged: () => void }) {
  const [note, setNote] = useState(ticket.adminNote ?? '');
  const onError = (err: unknown) => toast.error(apiErrorMessage(err, "That didn't work"));
  const setStatus = useMutation({
    mutationFn: (status: SupportStatus) => supportAdminApi.update(ticket.id, { status }),
    onSuccess: onChanged,
    onError,
  });
  const saveNote = useMutation({
    mutationFn: () => supportAdminApi.update(ticket.id, { adminNote: note }),
    onSuccess: () => { toast.success('Note saved'); onChanged(); },
    onError,
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium break-words">{ticket.subject}</p>
            <p className="text-xs text-muted-foreground">
              {SUPPORT_TOPIC_LABELS[ticket.topic]} · {formatDateTimeIST(ticket.createdAt)}
              {ticket.pagePath ? <> · <span className="font-mono">{ticket.pagePath}</span></> : null}
            </p>
            <p className="mt-0.5 text-sm">
              {ticket.user.name ? `${ticket.user.name} · ` : ''}
              <a className="underline underline-offset-2" href={`mailto:${ticket.user.email}`}>{ticket.user.email}</a>
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Select
              aria-label={`Status of ${ticket.subject}`}
              className="h-9 w-auto"
              value={ticket.status}
              disabled={setStatus.isPending}
              onChange={(e) => setStatus.mutate(e.target.value as SupportStatus)}
            >
              {SUPPORT_STATUSES.map((s) => (
                <option key={s} value={s}>{SUPPORT_STATUS_LABELS[s]}</option>
              ))}
            </Select>
            {!ticket.emailDelivered && <Badge variant="outline">Email to the team did not send</Badge>}
          </div>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm">{ticket.message}</p>
        <div>
          <Textarea
            aria-label="Private note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Private note (the user never sees this)"
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="outline" disabled={saveNote.isPending || note === (ticket.adminNote ?? '')} onClick={() => saveNote.mutate()}>
              Save note
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Settings - Support requests. The server gate (ADMIN + a session signed in with a second factor) is the
 * control that matters; the role check here only avoids showing a page whose every request would fail.
 */
export function SupportAdminPage() {
  const isAdmin = useAuthStore((s) => s.user?.role) === 'ADMIN';
  const qc = useQueryClient();
  const [filter, setFilter] = useState<SupportStatus | ''>('');
  const query = useQuery({
    queryKey: [...QUERY_KEY, filter],
    queryFn: () => supportAdminApi.list(filter || undefined),
    enabled: isAdmin,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: QUERY_KEY });

  if (!isAdmin) {
    return <p className="text-sm text-muted-foreground">This page is for the EveryPaisa team.</p>;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Support requests"
        description="Messages from Help & support. Each one is also emailed to the support inbox; reply from there, then mark it here."
        actions={
          <Select aria-label="Filter by status" className="h-9 w-auto" value={filter} onChange={(e) => setFilter(e.target.value as SupportStatus | '')}>
            <option value="">All requests</option>
            {SUPPORT_STATUSES.map((s) => (
              <option key={s} value={s}>{SUPPORT_STATUS_LABELS[s]}</option>
            ))}
          </Select>
        }
      />
      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : query.isError ? (
        <p className="text-sm text-negative">{apiErrorMessage(query.error, 'Could not load support requests.')}</p>
      ) : (query.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className="space-y-3">
          {query.data!.map((t) => (
            <li key={t.id}>
              <TicketCard ticket={t} onChanged={() => void refresh()} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
