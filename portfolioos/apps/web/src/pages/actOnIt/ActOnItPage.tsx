import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatINR, type ActOnItView } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { apiErrorMessage } from '@/api/client';
import { ACT_ON_IT_KEY, actOnItApi, type AdviceAction } from '@/api/actOnIt.api';
import { AdviceCard } from './AdviceCard';
import { TrackRecord } from './TrackRecord';
import { WhyDialog } from './WhyDialog';
import { CATEGORY_LABEL, adviceTabs, type AdviceTabKey } from './actOnItView';
import { AdviceList } from './AdviceList';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  const [tab, setTab] = useState<AdviceTabKey>('open');
  const { data, isLoading, error } = useQuery({
    queryKey: ACT_ON_IT_KEY,
    queryFn: () => actOnItApi.view(),
  });
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
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Overview" title="Act on it" />
        <p className="rounded-2xl border p-6 text-[14px] text-muted-foreground">
          {apiErrorMessage(error, 'Act on it could not load. Try again in a minute.')}
        </p>
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
        actions={
          <Link
            to="/advisor"
            className="text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Risk profile and allocation
          </Link>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as AdviceTabKey)}>
        <TabsList className="h-auto gap-1 rounded-full border bg-card p-1">
          {adviceTabs(data).map((t) => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              className="gap-2 rounded-full px-4 py-2 text-[13.5px] aria-selected:bg-accent aria-selected:text-background aria-selected:shadow-[0_6px_20px_-8px_hsl(var(--accent)/0.6)]"
            >
              {t.label}
              <span className="numeric-display rounded-full bg-foreground/10 px-1.5 text-[12px] leading-5">
                {t.count}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="open" className="mt-5 space-y-6">
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
              <h2 className="mb-2 text-[13px] font-medium text-muted-foreground">
                {others.length} more waiting
              </h2>
              <ul className="flex flex-wrap gap-2">
                {others.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setPick(c.id)}
                      className="rounded-full border bg-card px-3.5 py-1.5 text-left text-[13px] hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="text-muted-foreground">
                        {CATEGORY_LABEL[c.category] ?? c.category}
                      </span>
                      {c.gainInr && (
                        <span className="numeric-display ml-1.5 text-accent-ink">
                          +{formatINR(c.gainInr, { fractionDigits: 0 })}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </TabsContent>

        {adviceTabs(data)
          .filter((t) => t.key !== 'open')
          .map((t) => (
            <TabsContent key={t.key} value={t.key} className="mt-5">
              <AdviceList rows={t.rows} empty={EMPTY_TAB[t.key]} onOpen={setWhyId} />
            </TabsContent>
          ))}
      </Tabs>

      <TrackRecord view={data} />

      <WhyDialog
        id={whyId}
        card={all.find((c) => c.id === whyId) ?? null}
        row={data.history.find((h) => h.id === whyId) ?? null}
        onClose={() => setWhyId(null)}
      />
    </div>
  );
}

const EMPTY_TAB: Record<AdviceTabKey, string> = {
  open: '',
  accepted: 'Advice you accept shows here until we see the move in your accounts.',
  done: 'Advice you acted on shows here, with what it earned against doing nothing.',
  skipped: 'Advice you skip shows here, with what acting would have made.',
  past: 'Advice that stopped applying shows here.',
};

function EmptyAdvice({ view }: { view: ActOnItView }) {
  return (
    <section className="rounded-[28px] border bg-card p-8 sm:p-10">
      <h2 className="font-display text-[28px] font-semibold">Nothing to act on right now.</h2>
      <p className="mt-2 max-w-[60ch] text-[15px] text-muted-foreground">
        We check your money every night and tell you when there&apos;s something worth doing. Advice
        only appears when your own data backs it.
      </p>
      <p className="mt-4 text-[12px] text-muted-foreground">{view.compliance.line}</p>
    </section>
  );
}
