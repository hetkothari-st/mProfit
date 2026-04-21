import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Trash2, PlusCircle, Mail, Power, PowerOff, Zap } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/common/EmptyState';
import {
  monitoredSendersApi,
  type CreateMonitoredSenderInput,
  type MonitoredSenderDTO,
  type UpdateMonitoredSenderInput,
} from '@/api/monitoredSenders.api';
import { apiErrorMessage } from '@/api/client';

const DEFAULT_FORM: CreateMonitoredSenderInput = {
  address: '',
  displayLabel: '',
  autoCommitAfter: 5,
};

/**
 * §6.8 — Monitored-sender management. This is the allow-list the Gmail
 * poller (§6.7) reads: only addresses here get fetched. Delete, toggle
 * active, flip auto-commit once the user is happy with the sender.
 */
export function SendersPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateMonitoredSenderInput>(DEFAULT_FORM);

  const { data: senders, isLoading } = useQuery({
    queryKey: ['monitored-senders'],
    queryFn: () => monitoredSendersApi.list(),
  });

  const createMut = useMutation({
    mutationFn: (input: CreateMonitoredSenderInput) => monitoredSendersApi.create(input),
    onSuccess: () => {
      toast.success('Sender added');
      setForm(DEFAULT_FORM);
      qc.invalidateQueries({ queryKey: ['monitored-senders'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not add sender')),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateMonitoredSenderInput }) =>
      monitoredSendersApi.update(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monitored-senders'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Update failed')),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => monitoredSendersApi.remove(id),
    onSuccess: () => {
      toast.success('Sender removed');
      qc.invalidateQueries({ queryKey: ['monitored-senders'] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not remove sender')),
  });

  return (
    <div>
      <PageHeader
        title="Monitored senders"
        description="The email addresses we scan for financial events. Only senders listed here are polled — everything else is ignored."
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" /> Add sender manually
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Email address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="alerts@hdfcbank.net or @hdfcbank.net"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Use <code>@domain.com</code> to whitelist every address at a domain,
                or a specific address.
              </p>
            </div>
            <div>
              <Label>Display label (optional)</Label>
              <Input
                value={form.displayLabel ?? ''}
                onChange={(e) =>
                  setForm({ ...form, displayLabel: e.target.value || null })
                }
                placeholder="HDFC Bank alerts"
              />
            </div>
            <div>
              <Label>Auto-commit after N confirmed events</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={form.autoCommitAfter ?? 5}
                onChange={(e) =>
                  setForm({
                    ...form,
                    autoCommitAfter: Number.parseInt(e.target.value, 10),
                  })
                }
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Once you've approved this many events from the sender, the
                review UI will offer to auto-commit future events.
              </p>
            </div>
            <div className="pt-1">
              <Button
                className="w-full"
                disabled={!form.address.trim() || createMut.isPending}
                onClick={() => createMut.mutate(form)}
              >
                {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Add sender
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configured senders</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                Loading…
              </div>
            ) : !senders || senders.length === 0 ? (
              <EmptyState
                icon={Mail}
                title="No senders configured"
                description="Run a discovery scan, or add a sender manually on the left."
              />
            ) : (
              <div className="space-y-2">
                {senders.map((s) => (
                  <SenderRow
                    key={s.id}
                    sender={s}
                    onToggleActive={() =>
                      updateMut.mutate({
                        id: s.id,
                        patch: { isActive: !s.isActive },
                      })
                    }
                    onToggleAutoCommit={() =>
                      updateMut.mutate({
                        id: s.id,
                        patch: { autoCommitEnabled: !s.autoCommitEnabled },
                      })
                    }
                    onDelete={() => {
                      if (!confirm(`Remove ${s.address}? This won't delete past events.`)) return;
                      deleteMut.mutate(s.id);
                    }}
                    pending={updateMut.isPending || deleteMut.isPending}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SenderRow({
  sender,
  onToggleActive,
  onToggleAutoCommit,
  onDelete,
  pending,
}: {
  sender: MonitoredSenderDTO;
  onToggleActive: () => void;
  onToggleAutoCommit: () => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const progress = Math.min(
    100,
    Math.round((sender.confirmedEventCount / sender.autoCommitAfter) * 100),
  );
  const thresholdReached = sender.confirmedEventCount >= sender.autoCommitAfter;

  return (
    <div className="border rounded-md px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {sender.displayLabel ?? sender.address}
            </span>
            <span
              className={
                sender.isActive ? 'text-positive text-xs' : 'text-muted-foreground text-xs'
              }
            >
              · {sender.isActive ? 'Active' : 'Paused'}
            </span>
            {sender.autoCommitEnabled && (
              <span className="inline-flex items-center gap-0.5 text-xs text-accent">
                <Zap className="h-3 w-3" /> Auto-commit
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground font-mono truncate">
            {sender.address}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {sender.confirmedEventCount} / {sender.autoCommitAfter} approved
            {sender.lastFetchedAt
              ? ` · last fetched ${new Date(sender.lastFetchedAt).toLocaleString()}`
              : ' · never fetched'}
          </div>
          <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
            <div
              className={
                thresholdReached
                  ? 'h-full bg-accent'
                  : 'h-full bg-muted-foreground/40'
              }
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={onToggleAutoCommit}
            title={
              sender.autoCommitEnabled
                ? 'Disable auto-commit'
                : thresholdReached
                  ? 'Enable auto-commit'
                  : `Approve ${sender.autoCommitAfter - sender.confirmedEventCount} more to enable`
            }
          >
            <Zap
              className={
                sender.autoCommitEnabled
                  ? 'h-4 w-4 text-accent'
                  : 'h-4 w-4 text-muted-foreground'
              }
            />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={onToggleActive}
            title={sender.isActive ? 'Pause polling' : 'Resume polling'}
          >
            {sender.isActive ? (
              <Power className="h-4 w-4 text-positive" />
            ) : (
              <PowerOff className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-negative" />
          </Button>
        </div>
      </div>
    </div>
  );
}
