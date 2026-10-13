import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Clock, Download, Info, PenLine, ScrollText } from 'lucide-react';
import { formatDateIST, formatDateOnly, formatINR, WILL_DISCLAIMER, type WillHistoryEntryWire, type WillOverviewWire, type WillVersionWire } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiErrorMessage } from '@/api/client';
import { willApi, willDraftExists } from '@/api/will.api';
import { ConfirmDialog } from '@/pages/split/ConfirmDialog';
import { WillGate } from './WillGuards';
import { willStepPath } from './willSteps';
import { WillHistoryCard } from './WillHistoryCard';
import { WillReviewBanner } from './WillReviewBanner';

const STATUS_LABEL: Record<WillOverviewWire['status'], string> = {
  NOT_CREATED: 'Not created',
  DRAFT: 'Draft',
  GENERATED: 'Generated',
  EXECUTED: 'Executed',
};

const PREPARE = [
  'Full legal names and dates of birth of the people you want to include',
  'Who should carry out your will (an executor) and a back-up',
  'A guardian for any children under 18',
  'How you want your assets shared',
  'Later, for signing: two adult witnesses who are not beneficiaries',
];

export function WillOverviewPage() {
  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        eyebrow="Planning"
        title="Will Maker"
        description="Write a simple will under Indian law from your EveryPaisa data, check it, and download it to sign."
      />
      <WillGate>
        <OverviewBody />
      </WillGate>
    </div>
  );
}

function money(v: string): string {
  return formatINR(v, { fractionDigits: 0 });
}

function OverviewBody() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['will', 'overview'], queryFn: () => willApi.overview() });
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const create = useMutation({
    mutationFn: (fromWillId?: string) => willApi.createDraft(fromWillId),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['will'] });
      navigate(willStepPath(d.id, d.currentStep));
    },
    onError: (err) => {
      const existing = willDraftExists(err);
      if (existing) {
        navigate(willStepPath(existing.id, existing.currentStep));
        return;
      }
      toast.error(apiErrorMessage(err, "Couldn't start your will"));
    },
  });
  const discard = useMutation({
    mutationFn: (id: string) => willApi.discard(id),
    onSuccess: () => {
      toast.success('Draft discarded');
      void qc.invalidateQueries({ queryKey: ['will'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't discard the draft")),
  });
  const download = useMutation({
    mutationFn: (v: WillVersionWire) => willApi.downloadPdf(v.id, v.versionNo),
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't download the PDF")),
  });
  const changed = useMutation({
    mutationFn: (willId: string) => willApi.createDraft(willId, 'CIRCUMSTANCES_CHANGED'),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['will'] });
      navigate(willStepPath(d.id, d.currentStep));
    },
    onError: (err) => {
      const existing = willDraftExists(err);
      if (existing) {
        navigate(willStepPath(existing.id, existing.currentStep));
        return;
      }
      toast.error(apiErrorMessage(err, "Couldn't start a new version"));
    },
  });
  const reviewed = useMutation({
    mutationFn: (willId: string) => willApi.markReviewed(willId),
    onSuccess: (r) => {
      toast.success(`Thanks. We'll remind you again on ${formatDateOnly(r.nextReviewAt)}.`);
      void qc.invalidateQueries({ queryKey: ['will'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't save your review")),
  });
  const downloadEntry = useMutation({
    mutationFn: (h: WillHistoryEntryWire) => willApi.downloadPdf(h.versionId ?? '', h.version),
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't download the PDF")),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (q.isError || !q.data) {
    return <Card className="p-5 text-sm text-negative">{apiErrorMessage(q.error, "Couldn't load Will Maker")}</Card>;
  }
  const o = q.data;
  const latest = o.versions.find((v) => v.status === 'GENERATED' || v.status === 'EXECUTED') ?? null;
  const nominee = money(o.estate.nomineeOnly);
  const liveEntry = latest ? o.history.find((h) => h.willId === latest.willId) ?? null : null;
  const executed = liveEntry?.status === 'EXECUTED';
  // 'truncated' marks a cut-off list, not a source that failed.
  const unreadSources = o.estateFailedSources.filter((s) => s !== 'truncated').length;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        {o.review?.due && (
          <WillReviewBanner
            review={o.review}
            busy={reviewed.isPending || changed.isPending}
            onReviewed={() => reviewed.mutate(o.review!.willId)}
            onChanged={() => changed.mutate(o.review!.willId)}
          />
        )}
        <Card className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ScrollText className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Your will</h2>
            </div>
            <Badge variant="secondary">{STATUS_LABEL[o.status]}</Badge>
          </div>
          {o.draft && (
            <div className="space-y-2 rounded-md border border-border/60 p-3 text-sm">
              <p className="text-foreground">
                Draft, version {o.draft.version} - last saved {formatDateIST(o.draft.updatedAt)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => navigate(willStepPath(o.draft!.id, o.draft!.currentStep))}>Continue</Button>
                <Button size="sm" variant="outline" disabled={discard.isPending} onClick={() => setConfirmDiscard(true)}>
                  Discard draft
                </Button>
              </div>
              <ConfirmDialog
                open={confirmDiscard}
                onOpenChange={setConfirmDiscard}
                title="Discard this draft?"
                description="You can't get it back."
                confirmLabel="Discard"
                destructive
                onConfirm={() => discard.mutate(o.draft!.id)}
              />
            </div>
          )}
          {latest && (
            <div className="space-y-2 rounded-md border border-border/60 p-3 text-sm">
              <p className="text-foreground">Version {latest.versionNo} generated on {formatDateOnly(latest.generatedOn)}</p>
              {executed && liveEntry?.executedOn && (
                <p className="text-muted-foreground" data-testid="will-executed-line">
                  Signed on {formatDateOnly(liveEntry.executedOn)}
                  {liveEntry.nextReviewAt ? ` - next review ${formatDateOnly(liveEntry.nextReviewAt)}` : ''}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <DownloadButton variant="outline" version={latest} download={download} />
                <Button size="sm" variant={executed ? 'outline' : 'default'} asChild>
                  <Link to={`/will/${encodeURIComponent(latest.willId)}/execute`}>
                    <PenLine className="mr-1 h-4 w-4" />{executed ? 'Signed copy' : 'Sign and store'}
                  </Link>
                </Button>
                {!o.draft && !executed && (
                  <Button size="sm" variant="outline" disabled={create.isPending} onClick={() => create.mutate(latest.willId)}>
                    Start a new version
                  </Button>
                )}
                {!o.draft && executed && (
                  <Button size="sm" variant="outline" disabled={changed.isPending} onClick={() => changed.mutate(latest.willId)}>
                    My circumstances changed
                  </Button>
                )}
              </div>
            </div>
          )}
          {!o.draft && !latest && (
            <Button disabled={create.isPending} onClick={() => create.mutate(undefined)}>Create my will</Button>
          )}
          {!latest && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />About 15-20 minutes. Your progress is saved as you go.
            </p>
          )}
        </Card>

        <Card className="space-y-3 p-4 sm:p-5">
          <h2 className="text-base font-semibold text-foreground">Your estate (indicative)</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile label="Assets" value={money(o.estate.assets)} testId="will-estate-assets" />
            <Tile label="Liabilities" value={money(o.estate.liabilities)} testId="will-estate-liabilities" />
            <Tile label="Net worth" value={money(o.estate.net)} testId="will-estate-net" />
          </div>
          <p className="text-xs text-muted-foreground">
            From your EveryPaisa accounts today. Insurance paid to nominees ({nominee}) is not counted.
            {unreadSources > 0 && ` ${unreadSources} source(s) could not be read right now.`}
          </p>
        </Card>

        <WillHistoryCard history={o.history} downloading={downloadEntry.isPending} onDownload={(h) => downloadEntry.mutate(h)} />
      </div>

      <div className="min-w-0 space-y-4">
        <Card tone="muted" className="space-y-2 p-4 text-sm">
          <h2 className="font-semibold text-foreground">Key things to prepare</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {PREPARE.map((t) => <li key={t}>{t}</li>)}
          </ul>
        </Card>
        <Card tone="muted" className="flex gap-2 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-foreground">{WILL_DISCLAIMER}</p>
        </Card>
      </div>
    </div>
  );
}

/** One download at a time; the row being fetched says so. */
function DownloadButton({ version, download, variant }: {
  version: WillVersionWire;
  download: UseMutationResult<void, Error, WillVersionWire>;
  variant: 'outline' | 'ghost';
}) {
  const mine = download.isPending && download.variables?.id === version.id;
  return (
    <Button size="sm" variant={variant} disabled={download.isPending} onClick={() => download.mutate(version)}>
      <Download className="mr-1 h-4 w-4" />{mine ? 'Downloading...' : 'Download PDF'}
    </Button>
  );
}

function Tile({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border/60 bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums text-foreground" data-testid={testId}>{value}</p>
    </div>
  );
}
