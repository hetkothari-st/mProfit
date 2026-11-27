import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fmtDate } from '@/components/ca/accessModel';
import {
  DOCUMENT_REQUEST_STATUS_LABEL,
  caDocumentRequestsApi,
  type MyDocumentRequest,
} from '@/api/caDocumentRequests.api';

const KEY = ['me', 'document-requests'];

/**
 * Documents a professional has asked this account holder for. Answer with a
 * file (it goes into your own documents, which the professional can read) or
 * say it does not apply. Hidden when nothing is asked.
 */
export function MyDocumentRequests() {
  const { data: rows = [] } = useQuery({ queryKey: KEY, queryFn: () => caDocumentRequestsApi.mine() });
  if (rows.length === 0) return null;
  const open = rows.filter((r) => r.status === 'OPEN').length;
  return (
    <section className="mt-10">
      <h2 className="text-[15px] font-medium text-foreground">
        Documents your CA asked for {open > 0 && <span className="text-warning">{open} to send</span>}
      </h2>
      <p className="mb-3 mt-0.5 text-[12.5px] text-muted-foreground">
        What you upload is saved in your documents, where your CA can read it.
      </p>
      <ul className="divide-y divide-border/50 rounded-xl border border-border/60">
        {rows.map((r) => (
          <RequestItem key={r.id} row={r} />
        ))}
      </ul>
    </section>
  );
}

function RequestItem({ row: r }: { row: MyDocumentRequest }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saying, setSaying] = useState(false);
  const [reason, setReason] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: KEY });

  const upload = useMutation({
    mutationFn: (file: File) => caDocumentRequestsApi.upload(r.id, file),
    onSuccess: () => {
      toast.success('Sent to your CA');
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const na = useMutation({
    mutationFn: () => caDocumentRequestsApi.notApplicable(r.id, reason.trim()),
    onSuccess: () => {
      setSaying(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] text-foreground">
            {r.title}
            {r.financialYear && <span className="ml-1.5 text-muted-foreground">FY {r.financialYear}</span>}
          </p>
          <p className="text-[12px] text-muted-foreground">
            Asked by {r.askedBy}
            {r.dueDate && ` · needed by ${fmtDate(r.dueDate)}`}
            {r.status !== 'OPEN' && ` · ${DOCUMENT_REQUEST_STATUS_LABEL[r.status]}`}
          </p>
          {r.note && <p className="mt-1 text-[12.5px] text-foreground/80">{r.note}</p>}
        </div>
        {r.status === 'OPEN' && !saying && (
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              aria-label={`Upload ${r.title}`}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
                e.target.value = '';
              }}
            />
            <Button size="sm" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> Upload
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSaying(true)} className="text-muted-foreground">
              Doesn't apply
            </Button>
          </div>
        )}
      </div>
      {saying && (
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) na.mutate();
          }}
        >
          <Input
            aria-label="Why it doesn't apply"
            placeholder="e.g. I don't pay rent"
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            className="min-w-[220px] flex-1"
          />
          <Button type="submit" size="sm" disabled={!reason.trim() || na.isPending}>
            Tell my CA
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSaying(false)}>
            Back
          </Button>
        </form>
      )}
    </li>
  );
}
