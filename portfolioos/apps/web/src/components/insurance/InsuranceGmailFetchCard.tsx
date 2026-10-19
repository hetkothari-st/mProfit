import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Mail, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiErrorMessage } from '@/api/client';
import { insuranceApi } from '@/api/insurance/insurance.api';

const RUNNING = new Set(['PENDING', 'LISTING', 'DOWNLOADING', 'CLASSIFYING']);

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

/**
 * Permission to find insurance documents in the user's Gmail, per account.
 *
 * Off by default. The card says exactly what is read — emails from insurers,
 * or with an insurance subject line, that have a PDF attached — before the
 * user turns it on, and turning it off stops any search in progress.
 */
export function InsuranceGmailFetchCard() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['insurance-gmail-fetch'],
    queryFn: () => insuranceApi.gmailFetchStatus(),
    // Poll while a scan runs so the progress line updates.
    refetchInterval: (query) =>
      query.state.data?.mailboxes.some((m) => m.lastScan && RUNNING.has(m.lastScan.status)) ? 5_000 : false,
  });

  const toggle = useMutation({
    mutationFn: ({ mailboxId, enabled }: { mailboxId: string; enabled: boolean }) =>
      insuranceApi.setGmailFetch(mailboxId, enabled),
    onSuccess: (r) => {
      toast.success(r.enabled ? 'Searching your Gmail for insurance documents' : 'Insurance search turned off');
      void qc.invalidateQueries({ queryKey: ['insurance-gmail-fetch'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not change the setting')),
  });

  const scan = useMutation({
    mutationFn: (mailboxId: string) => insuranceApi.scanGmailNow(mailboxId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['insurance-gmail-fetch'] }),
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not start the search')),
  });

  if (q.isLoading || !q.data) return null;
  const { mailboxes, documentsFound } = q.data;

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">Find my insurance documents in Gmail</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Looks only at emails from insurers, or with an insurance subject such as "policy document" or
              "premium receipt", that have a PDF attached. Policy documents, premium receipts, renewal notices and
              claim letters are collected. Nothing else in your inbox is read. You can turn it off at any time.
            </p>

            {mailboxes.length === 0 ? (
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link to="/ingestion">Connect Gmail first</Link>
              </Button>
            ) : (
              <ul className="mt-3 space-y-3">
                {mailboxes.map((m) => {
                  const running = m.lastScan && RUNNING.has(m.lastScan.status);
                  return (
                    <li key={m.mailboxId} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 text-sm">
                        <div className="truncate font-medium">{m.googleEmail ?? 'Gmail account'}</div>
                        <div className="text-muted-foreground">
                          {!m.enabled
                            ? 'Off'
                            : running
                              ? `Searching… ${m.lastScan!.attachmentsFound} document(s) found so far`
                              : m.lastScan?.status === 'FAILED'
                                ? `Last search failed: ${m.lastScan.errorMessage ?? 'unknown error'}`
                                : m.lastScan?.completedAt
                                  ? `On · last searched ${when(m.lastScan.completedAt)}`
                                  : `On since ${when(m.consentAt)}`}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {m.enabled && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={Boolean(running) || scan.isPending}
                            onClick={() => scan.mutate(m.mailboxId)}
                          >
                            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Scan now
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={m.enabled ? 'outline' : 'default'}
                          disabled={toggle.isPending}
                          onClick={() => toggle.mutate({ mailboxId: m.mailboxId, enabled: !m.enabled })}
                        >
                          {m.enabled ? 'Turn off' : 'Turn on'}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {documentsFound > 0 && (
              <p className="mt-3 text-sm text-muted-foreground">
                {documentsFound} insurance document{documentsFound === 1 ? '' : 's'} found. They will appear on
                your policies and in Documents once matched.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
