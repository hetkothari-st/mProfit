import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth.store';
import { fmtDate } from './accessModel';
import { filingYearOptions } from '@/api/caClientList.api';
import {
  DOCUMENT_REQUEST_STATUS_LABEL,
  caDocumentRequestsApi,
  type CaDocumentRequest,
} from '@/api/caDocumentRequests.api';

const onError = (e: Error) => toast.error(e.message);

/**
 * Ask a client for a document and follow it up. The client is told in their
 * inbox and answers from their own account; what they send lands in their
 * vault, which this grant already reads.
 */
export function DocumentRequestsPanel({
  clientId,
  canRequest = true,
}: {
  clientId: string;
  canRequest?: boolean;
}) {
  const qc = useQueryClient();
  const key = ['ca', clientId, 'document-requests'];
  const { data: rows = [] } = useQuery({
    queryKey: key,
    queryFn: () => caDocumentRequestsApi.list(clientId),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['ca', clientId, 'documents'] });
  };

  const years = filingYearOptions();
  const [title, setTitle] = useState('');
  const [fy, setFy] = useState('');
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  const ask = useMutation({
    mutationFn: () =>
      caDocumentRequestsApi.ask(clientId, {
        title: title.trim(),
        financialYear: fy || null,
        dueDate: due || null,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      setTitle('');
      setDue('');
      setNote('');
      toast.success('Request sent');
      refresh();
    },
    onError,
  });
  const close = useMutation({
    mutationFn: (v: { id: string; outcome: 'ACCEPTED' | 'CANCELLED' }) =>
      caDocumentRequestsApi.close(clientId, v.id, v.outcome),
    onSuccess: refresh,
    onError,
  });

  const live = rows.filter(
    (r) => r.status === 'OPEN' || r.status === 'UPLOADED' || r.status === 'NOT_APPLICABLE',
  );
  const done = rows.filter((r) => r.status === 'ACCEPTED' || r.status === 'CANCELLED');

  return (
    <section className="mb-8">
      <h3 className="mb-1 text-[15px] font-medium text-foreground">
        Ask the client for a document
      </h3>
      {!canRequest ? (
        <p className="mb-4 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[12.5px] text-muted-foreground">
          This is a record you keep, so there is no login to send a request to. Add their documents
          to the books yourself, or invite them to the app.
        </p>
      ) : (
        <>
          <p className="mb-3 text-[12.5px] text-muted-foreground">
            They get it in their inbox and upload it from their own account. It lands in their
            documents, below.
          </p>
          <form
            className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim()) ask.mutate();
            }}
          >
            <Input
              aria-label="Document to ask for"
              placeholder="e.g. Form 16"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
            <select
              aria-label="Financial year"
              value={fy}
              onChange={(e) => setFy(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-[13px]"
            >
              <option value="">Any year</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  FY {y}
                </option>
              ))}
            </select>
            <DateInput
              aria-label="Needed by"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              className="w-[160px]"
            />
            <Input
              aria-label="Note to the client"
              placeholder="Note (optional): which bank, which months…"
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              className="sm:col-span-2"
            />
            <Button type="submit" size="sm" disabled={!title.trim() || ask.isPending}>
              <Send className="h-3.5 w-3.5" /> Send request
            </Button>
          </form>
        </>
      )}

      {live.length > 0 && (
        <ul className="divide-y divide-border/50 rounded-xl border border-border/60">
          {live.map((r) => (
            <RequestRow
              key={r.id}
              clientId={clientId}
              row={r}
              onAccept={() => close.mutate({ id: r.id, outcome: 'ACCEPTED' })}
              onCancel={() => close.mutate({ id: r.id, outcome: 'CANCELLED' })}
              busy={close.isPending}
            />
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <p className="mt-2 text-[12px] text-muted-foreground">
          {done.length} closed:{' '}
          {done
            .map((r) => `${r.title} (${DOCUMENT_REQUEST_STATUS_LABEL[r.status].toLowerCase()})`)
            .join(', ')}
        </p>
      )}
    </section>
  );
}

function RequestRow({
  clientId,
  row: r,
  onAccept,
  onCancel,
  busy,
}: {
  clientId: string;
  row: CaDocumentRequest;
  onAccept: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const accessToken = useAuthStore((s) => s.accessToken);
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] text-foreground">
          {r.title}
          {r.financialYear && (
            <span className="ml-1.5 text-muted-foreground">FY {r.financialYear}</span>
          )}
        </p>
        <p className="text-[12px] text-muted-foreground">
          <span className={cn(r.status === 'OPEN' ? 'text-warning' : 'text-positive')}>
            {DOCUMENT_REQUEST_STATUS_LABEL[r.status]}
          </span>
          {r.dueDate && r.status === 'OPEN' && <span> · needed by {fmtDate(r.dueDate)}</span>}
          {r.clientNote && <span> · “{r.clientNote}”</span>}
        </p>
      </div>
      {r.status === 'UPLOADED' && r.documentId && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            caDocumentRequestsApi
              .downloadDocument(clientId, r.documentId!, accessToken)
              .catch((e: Error) => toast.error(e.message))
          }
        >
          <FileDown className="h-3.5 w-3.5" /> Download
        </Button>
      )}
      {r.status !== 'OPEN' && (
        <Button size="sm" variant="outline" disabled={busy} onClick={onAccept}>
          Accept
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={onCancel}
        className="text-muted-foreground"
      >
        Withdraw
      </Button>
    </li>
  );
}
