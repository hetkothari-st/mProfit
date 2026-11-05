import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatINR, type ActOnItView } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiErrorMessage } from '@/api/client';
import { ACT_ON_IT_KEY, actOnItApi, type AdviceAction } from '@/api/actOnIt.api';
import { AdviceCard } from './AdviceCard';
import { TrackRecord } from './TrackRecord';
import { CATEGORY_LABEL } from './actOnItView';

const DONE_TOAST: Record<AdviceAction, string> = {
  accept: "Accepted. We'll confirm it when we see it in your accounts.",
  snooze: "We'll bring this back next week.",
  dismiss: "Skipped. We'll still show what it would have made.",
  'done-elsewhere': 'Marked as done. It shows in your history, not in the total.',
};

export function ActOnItPage() {
  const qc = useQueryClient();
  const [whyId, setWhyId] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ACT_ON_IT_KEY, queryFn: () => actOnItApi.view() });
  const act = useMutation({
    mutationFn: (a: { id: string; action: AdviceAction }) => actOnItApi.act(a.id, a.action),
    onSuccess: (v, a) => {
      qc.setQueryData(ACT_ON_IT_KEY, v);
      setPick(null);
      toast.success(DONE_TOAST[a.action]);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Overview" title="Act on it" />
        <p className="rounded-2xl border p-6 text-[14px] text-muted-foreground">{apiErrorMessage(error, 'Act on it could not load. Try again in a minute.')}</p>
      </div>
    );
  }

  const all = [data.current, ...data.waiting].filter((c): c is NonNullable<typeof c> => c !== null);
  const card = all.find((c) => c.id === pick) ?? all[0] ?? null;
  const others = all.filter((c) => c.id !== card?.id);
  const run = (action: AdviceAction) => card && act.mutate({ id: card.id, action });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Act on it"
        description="Steps that earn or save you money, from your own data, at the right time. Every one is tracked against doing nothing."
        actions={<Link to="/advisor" className="text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">Risk profile and allocation</Link>}
      />

      {card ? (
        <AdviceCard
          card={card}
          compliance={data.compliance.line}
          busy={act.isPending}
          onAccept={() => run('accept')}
          onWhy={() => setWhyId(card.id)}
          onLater={() => run('snooze')}
          onDismiss={() => run('dismiss')}
          onDoneElsewhere={() => run('done-elsewhere')}
        />
      ) : (
        <EmptyAdvice view={data} />
      )}

      {others.length > 0 && (
        <section aria-label="More advice waiting">
          <h2 className="mb-2 text-[13px] font-medium text-muted-foreground">{others.length} more waiting</h2>
          <ul className="flex flex-wrap gap-2">
            {others.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setPick(c.id)} className="rounded-full border bg-card px-3.5 py-1.5 text-left text-[13px] hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="text-muted-foreground">{CATEGORY_LABEL[c.category] ?? c.category}</span>
                  {c.gainInr && <span className="numeric-display ml-1.5 text-accent-ink">+{formatINR(c.gainInr, { fractionDigits: 0 })}</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <TrackRecord view={data} />

      <WhyDialog id={whyId} onClose={() => setWhyId(null)} />
    </div>
  );
}

function EmptyAdvice({ view }: { view: ActOnItView }) {
  return (
    <section className="rounded-[28px] border bg-card p-8 sm:p-10">
      <h2 className="font-display text-[28px] font-semibold">Nothing to act on right now.</h2>
      <p className="mt-2 max-w-[60ch] text-[15px] text-muted-foreground">
        We check your money every night and tell you when there&apos;s something worth doing. Advice only appears when your own data backs it.
      </p>
      <p className="mt-4 text-[12px] text-muted-foreground">{view.compliance.line}</p>
    </section>
  );
}

function WhyDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['act-on-it', 'why', id], queryFn: () => actOnItApi.why(id!), enabled: id !== null });
  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-[22px]">{data?.headline ?? 'Why this advice'}</DialogTitle>
          <DialogDescription>Given on {data ? new Date(data.givenAt).toLocaleDateString('en-IN') : '…'}. Written from your data by code, not guessed.</DialogDescription>
        </DialogHeader>
        {isLoading || !data ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-4 text-[14px]">
            <p className="leading-relaxed">{data.rationale}</p>
            {data.facts.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-[13px] font-medium text-muted-foreground">What it was built from</h3>
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                  {data.facts.map((f) => (
                    <div key={f.label} className="contents">
                      <dt className="text-muted-foreground">{f.label}</dt>
                      <dd className="numeric-display text-right">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            <div>
              <h3 className="mb-1 text-[13px] font-medium text-muted-foreground">How we will check it</h3>
              <p>{data.measuredBy}</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
