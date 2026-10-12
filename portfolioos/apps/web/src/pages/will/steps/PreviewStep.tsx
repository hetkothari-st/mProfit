import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CheckCircle2, Download } from 'lucide-react';
import { formatDateOnly, WILL_ACKNOWLEDGEMENT, type WillVersionWire } from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/api/client';
import { isWillBlocked, willApi } from '@/api/will.api';
import { BlocksView } from '../BlocksView';
import { Notice } from '../parts';
import type { WillStepProps } from './types';

export function PreviewStep({ willId, flush, getRevision, goTo }: WillStepProps) {
  const qc = useQueryClient();
  const [ack, setAck] = useState(false);
  const [done, setDone] = useState<WillVersionWire | null>(null);

  const preview = useQuery({
    queryKey: ['will', 'preview', willId],
    queryFn: async () => {
      if (!(await flush())) throw new Error("Couldn't save your latest changes");
      return willApi.preview(willId);
    },
    retry: false,
  });
  const generate = useMutation({
    mutationFn: async () => {
      if (!(await flush())) throw new Error("Couldn't save your latest changes");
      return willApi.generate(willId, getRevision());
    },
    onSuccess: (r) => {
      setDone(r.version);
      void qc.invalidateQueries({ queryKey: ['will', 'overview'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't create your will")),
  });
  const download = useMutation({
    mutationFn: (v: WillVersionWire) => willApi.downloadPdf(v.id, v.versionNo),
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't download the PDF")),
  });

  if (done) {
    return (
      <Card className="space-y-3 p-4 sm:p-5">
        <p className="flex items-center gap-2 text-base font-semibold text-foreground">
          <CheckCircle2 className="h-5 w-5 text-positive" />Version {done.versionNo} is ready
        </p>
        <p className="text-sm text-muted-foreground">Generated on {formatDateOnly(done.generatedOn)}.</p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
          <li>Have it reviewed by a qualified advocate.</li>
          <li>Print it and sign every page in front of two adult witnesses who are not beneficiaries; they sign too.</li>
          <li>Registration with the sub-registrar is optional.</li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button disabled={download.isPending} onClick={() => download.mutate(done)}>
            <Download className="mr-1 h-4 w-4" />Download PDF
          </Button>
          <Button variant="outline" asChild><Link to="/will">Back to Will Maker</Link></Button>
        </div>
      </Card>
    );
  }

  if (preview.isLoading) return <p className="text-sm text-muted-foreground">Preparing your preview...</p>;
  if (preview.isError || !preview.data) {
    return isWillBlocked(preview.error) ? (
      <Notice tone="warning">
        <p>Fix the items on the Review step first.</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => goTo(7)}>Go to Review</Button>
      </Notice>
    ) : (
      <Notice tone="warning">{apiErrorMessage(preview.error, "Couldn't prepare the preview")}</Notice>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <Card tone="muted" className="p-4 sm:p-5">
        <BlocksView testId="will-summary" blocks={preview.data.summary} />
      </Card>
      <Card className="bg-card p-4 sm:p-8">
        <BlocksView testId="will-document" blocks={preview.data.document} />
      </Card>
      <Card className="space-y-3 p-4 sm:p-5">
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>{WILL_ACKNOWLEDGEMENT}</span>
        </label>
        <Button disabled={!ack || generate.isPending} onClick={() => generate.mutate()}>
          {generate.isPending ? 'Generating...' : 'Generate PDF'}
        </Button>
      </Card>
    </div>
  );
}
