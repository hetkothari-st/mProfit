import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Download, FileCheck2, Info } from 'lucide-react';
import { formatDateOnly, istCalendarDate, WILL_DISCLAIMER, type WillExecutionWire } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiErrorMessage } from '@/api/client';
import { isWillNotExecutable, willApi, willExecutionIssues, type WillSignedCopyInput } from '@/api/will.api';
import { WillGate } from '../WillGuards';
import { WILL_STATUS_LABEL } from '../willStatusLabels';
import { ExecutionGuide, FindALawyer } from './ExecutionGuide';
import { SignedCopyForm } from './SignedCopyForm';
import { WILL_WITNESS_BENEFICIARY_WARNING } from './executeCopy';

export function WillExecutePage() {
  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        eyebrow="Will Maker"
        title="Sign and store your will"
        description="Step 9: sign your will the right way, then keep a copy of the signed will here."
      />
      <WillGate>
        <ExecuteBody />
      </WillGate>
    </div>
  );
}

function ExecuteBody() {
  const { id = '' } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const key = ['will', 'execution', id];
  const q = useQuery({ queryKey: key, queryFn: () => willApi.execution(id), retry: false });

  const record = useMutation({
    mutationFn: (input: WillSignedCopyInput) => willApi.recordExecution(id, input),
    onSuccess: (e) => {
      qc.setQueryData(key, e);
      void qc.invalidateQueries({ queryKey: ['will', 'overview'] });
      setEditing(false);
      toast.success('Your signed will is stored');
    },
    onError: (err) => {
      if (isWillNotExecutable(err)) {
        // The will changed state under us: reload so the page turns read-only.
        void qc.invalidateQueries({ queryKey: key });
        toast.error("This will can't be signed and stored any more");
      } else if (willExecutionIssues(err).length === 0) {
        toast.error(apiErrorMessage(err, "Couldn't store the signed copy"));
      }
    },
  });
  const serverIssues = useMemo(() => willExecutionIssues(record.error), [record.error]);
  const pdf = useMutation({
    mutationFn: (e: WillExecutionWire) => willApi.downloadPdf(e.versionId, e.version),
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't download the PDF")),
  });
  const signed = useMutation({
    mutationFn: (e: WillExecutionWire) => willApi.downloadSignedCopy(e.willId, e.signedCopy?.fileName ?? `will-v${e.version}-signed`),
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't download the signed copy")),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (q.isError || !q.data) {
    const blocked = isWillNotExecutable(q.error);
    return (
      <Card className="space-y-3 p-5 text-sm">
        <p className={blocked ? 'text-foreground' : 'text-negative'}>
          {blocked
            ? "This will can't be signed and stored here: it is still a draft or was discarded."
            : apiErrorMessage(q.error, "Couldn't load your will")}
        </p>
        <Button size="sm" variant="outline" asChild><Link to="/will">Back to Will Maker</Link></Button>
      </Card>
    );
  }

  const e = q.data;
  const live = e.status === 'GENERATED' || e.status === 'EXECUTED';
  const showForm = live && (e.executedOn === null || editing);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <Card className="space-y-2 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-foreground">Version {e.version}</h2>
            <Badge variant={e.status === 'EXECUTED' ? 'default' : 'secondary'}>{WILL_STATUS_LABEL[e.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">Generated on {formatDateOnly(e.generatedOn)}</p>
          {e.status === 'SUPERSEDED' && (
            <p className="text-sm text-foreground">This version was replaced by a newer version. Its record is kept here as history.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={pdf.isPending} onClick={() => pdf.mutate(e)}>
              <Download className="mr-1 h-4 w-4" />Download PDF
            </Button>
            <Button size="sm" variant="ghost" asChild><Link to="/will">Back to Will Maker</Link></Button>
          </div>
        </Card>

        {live && <ExecutionGuide />}

        {e.warnings.includes('WITNESS_IS_BENEFICIARY') && (
          <Card className="flex gap-2 border-warning/40 bg-warning/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="break-words text-foreground">{WILL_WITNESS_BENEFICIARY_WARNING}</p>
          </Card>
        )}

        {e.executedOn && !editing && (
          <Card className="space-y-2 p-4 sm:p-5">
            <p className="flex items-center gap-2 text-base font-semibold text-foreground">
              <CheckCircle2 className="h-5 w-5 text-positive" aria-hidden="true" />Signed on {formatDateOnly(e.executedOn)}
            </p>
            <p className="break-words text-sm text-foreground">Witnesses: {e.witnesses.join(' and ')}</p>
            {e.nextReviewAt && (
              <p className="text-sm text-muted-foreground">Next review {formatDateOnly(e.nextReviewAt)}</p>
            )}
            {e.signedCopy && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 p-3 text-sm">
                <FileCheck2 className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 break-all text-foreground">{e.signedCopy.fileName}</span>
                <span className="text-muted-foreground">{Math.max(1, Math.round(e.signedCopy.sizeBytes / 1024))} KB</span>
                <Button size="sm" variant="outline" disabled={signed.isPending} onClick={() => signed.mutate(e)}>
                  <Download className="mr-1 h-4 w-4" />Download signed copy
                </Button>
              </div>
            )}
            {live && (
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Replace the copy or fix details</Button>
            )}
          </Card>
        )}

        {showForm && (
          <Card className="space-y-3 p-4 sm:p-5">
            <h2 className="text-base font-semibold text-foreground">
              {e.executedOn ? 'Update your signed will' : 'Store your signed will'}
            </h2>
            <p className="text-sm text-muted-foreground">
              After signing, scan or photograph every page into one PDF (or one clear photo) and add the date and both witnesses.
            </p>
            <SignedCopyForm
              initial={e.executedOn ? { executedOn: e.executedOn, witnesses: [e.witnesses[0] ?? '', e.witnesses[1] ?? ''] } : undefined}
              ctx={{ today: istCalendarDate(new Date()), generatedOn: e.generatedOn, requireFile: e.signedCopy === null }}
              pending={record.isPending}
              serverIssues={serverIssues}
              onSubmit={(input) => record.mutate(input)}
              onCancel={e.executedOn ? () => setEditing(false) : undefined}
            />
          </Card>
        )}
      </div>

      <div className="min-w-0 space-y-4">
        <FindALawyer />
        <Card tone="muted" className="flex gap-2 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-foreground">{WILL_DISCLAIMER}</p>
        </Card>
      </div>
    </div>
  );
}
