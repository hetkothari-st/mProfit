import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Loader2,
  RefreshCw,
  Search,
  PlusCircle,
  Inbox,
  CheckCircle2,
  Chrome,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { mailboxesApi, type MailboxDTO } from '@/api/mailboxes.api';
import {
  ingestionApi,
  type DiscoveredSenderDTO,
} from '@/api/ingestion.api';
import { monitoredSendersApi } from '@/api/monitoredSenders.api';
import { apiErrorMessage } from '@/api/client';

/**
 * §6.6 + §6.8 — Gmail discovery surface. For each connected Gmail mailbox,
 * the user hits "Scan" → backend runs `_runDiscovery` → we render the ranked
 * sender list with seed-directory badges. An "Add" button whitelists the
 * sender into `MonitoredSender` so the §6.7 poller picks it up next tick.
 */
export function DiscoveryPage() {
  const qc = useQueryClient();
  const { data: mailboxes, isLoading } = useQuery({
    queryKey: ['mailboxes'],
    queryFn: () => mailboxesApi.list(),
  });

  const gmailMailboxes = (mailboxes ?? []).filter((m) => m.provider === 'GMAIL_OAUTH');

  return (
    <div>
      <PageHeader
        title="Discover senders"
        description="Scan a connected Gmail inbox for likely financial senders. Add the ones you want us to monitor — only those senders will be polled."
      />

      {isLoading ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            Loading mailboxes…
          </CardContent>
        </Card>
      ) : gmailMailboxes.length === 0 ? (
        <EmptyState
          icon={Chrome}
          title="No Gmail account connected"
          description="Connect a Gmail account first. Discovery only works on Gmail (OAuth) — IMAP mailboxes can't be scanned this way."
          action={
            <Button asChild>
              <a href="/mailboxes">Connect Gmail</a>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {gmailMailboxes.map((m) => (
            <MailboxDiscoverySection
              key={m.id}
              mailbox={m}
              onSenderAdded={() => {
                qc.invalidateQueries({ queryKey: ['monitored-senders'] });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MailboxDiscoverySection({
  mailbox,
  onSenderAdded,
}: {
  mailbox: MailboxDTO;
  onSenderAdded: () => void;
}) {
  const [results, setResults] = useState<DiscoveredSenderDTO[] | null>(null);

  const scanMut = useMutation({
    mutationFn: () => ingestionApi.discover(mailbox.id),
    onSuccess: (r) => {
      setResults(r);
      toast.success(
        r.length === 0
          ? 'Scan complete — no financial senders found'
          : `Found ${r.length} financial sender${r.length === 1 ? '' : 's'}`,
      );
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Scan failed')),
  });

  const addMut = useMutation({
    mutationFn: (sender: DiscoveredSenderDTO) =>
      monitoredSendersApi.create({
        address: sender.address,
        displayLabel:
          sender.seedMatch?.suggestedDisplayLabel ?? sender.displayName ?? null,
      }),
    onSuccess: () => {
      toast.success('Sender added to monitored list');
      onSenderAdded();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not add sender')),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Chrome className="h-4 w-4" /> {mailbox.googleEmail ?? mailbox.label ?? 'Gmail'}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {results
              ? `Scanned · ${results.length} candidate${results.length === 1 ? '' : 's'}`
              : 'Not scanned yet'}
          </p>
        </div>
        <Button
          onClick={() => scanMut.mutate()}
          disabled={scanMut.isPending}
        >
          {scanMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : results ? (
            <RefreshCw className="h-4 w-4" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {scanMut.isPending ? 'Scanning…' : results ? 'Re-scan' : 'Scan now'}
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {results === null ? (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">
            Click <span className="font-medium">Scan now</span> to look through
            the last 2 years of mail for likely bank, broker, and insurer
            addresses.
          </div>
        ) : results.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Inbox}
              title="No financial senders detected"
              description="We didn't find any senders whose recent mail looked financial. You can still add senders manually from the Monitored senders page."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Sender</th>
                  <th className="text-left font-medium px-4 py-2">Type</th>
                  <th className="text-right font-medium px-4 py-2">Score</th>
                  <th className="text-right font-medium px-4 py-2">Mail</th>
                  <th className="text-right font-medium px-4 py-2 w-28">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {results.map((s) => (
                  <tr key={s.address} className="hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <div className="font-medium">
                        {s.displayName ?? s.address}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {s.address}
                      </div>
                      {s.recentSubjects.length > 0 && (
                        <div className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
                          e.g. {s.recentSubjects[0]}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {s.seedMatch ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                          <CheckCircle2 className="h-3 w-3" />
                          {s.seedMatch.institutionName}
                          <span className="text-muted-foreground ml-1">
                            ({s.seedMatch.institutionKind.toLowerCase()})
                          </span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Unknown
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {s.score.toFixed(1)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {s.messageCount}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={addMut.isPending}
                        onClick={() => addMut.mutate(s)}
                      >
                        <PlusCircle className="h-3 w-3" />
                        Add
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
