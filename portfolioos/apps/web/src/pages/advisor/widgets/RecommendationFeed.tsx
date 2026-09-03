import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Compass, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/common/EmptyState';
import {
  advisorApi,
  advisorKeys,
  type Recommendation,
  type RecommendationStatus,
} from '@/api/advisor.api';
import { RecommendationCard } from './RecommendationCard';

const FILTERS: Array<{ value: RecommendationStatus; label: string; empty: string }> = [
  {
    value: 'OPEN',
    label: 'Open',
    empty: 'Nothing needs your attention right now. Refresh after your next set of transactions.',
  },
  { value: 'ACCEPTED', label: 'Accepted', empty: "Nothing accepted yet — accept a suggestion and it'll land here." },
  { value: 'SNOOZED', label: 'Snoozed', empty: 'Nothing snoozed.' },
  { value: 'DONE', label: 'Done', empty: "Once you've acted on a suggestion, mark it done and it moves here." },
  { value: 'DISMISSED', label: 'Dismissed', empty: 'Nothing dismissed.' },
];

export interface RecommendationFeedProps {
  /** Only true when GET /llm-status reports the prose model is available. */
  llmEnabled: boolean;
}

export function RecommendationFeed({ llmEnabled }: RecommendationFeedProps) {
  const [status, setStatus] = useState<RecommendationStatus>('OPEN');

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: advisorKeys.recommendations(status),
    queryFn: () => advisorApi.recommendations(status),
  });

  // Priority ascending — 1 is the most urgent. Ties break on newest first.
  const sorted = useMemo<Recommendation[]>(() => {
    if (!data) return [];
    return [...data].sort(
      (a, b) =>
        a.priority - b.priority ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [data]);

  const activeFilter = FILTERS.find((f) => f.value === status) ?? FILTERS[0]!;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
            Recommendations
          </p>
          <h2 className="font-display mt-1 text-[26px] leading-none tracking-tight text-foreground">
            What to do next
          </h2>
        </div>
        <Tabs value={status} onValueChange={(v) => setStatus(v as RecommendationStatus)}>
          <div className="overflow-x-auto">
            <TabsList className="w-max flex-nowrap">
              {FILTERS.map((f) => (
                <TabsTrigger key={f.value} value={f.value} className="shrink-0 whitespace-nowrap">
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
      </div>

      {isLoading && (
        <div className="py-10 text-center text-muted-foreground">
          <Loader2 className="inline h-5 w-5 animate-spin" /> Loading recommendations…
        </div>
      )}

      {isError && !isLoading && (
        <Card className="p-6 text-sm text-negative">
          Couldn't load your recommendations. Try again shortly.
        </Card>
      )}

      {!isLoading && !isError && sorted.length === 0 && (
        <EmptyState
          icon={Compass}
          title={status === 'OPEN' ? 'No open recommendations' : `Nothing ${activeFilter.label.toLowerCase()}`}
          description={activeFilter.empty}
        />
      )}

      {!isLoading && !isError && sorted.length > 0 && (
        <div className={isFetching ? 'space-y-4 opacity-70 transition-opacity' : 'space-y-4'}>
          {sorted.map((rec) => (
            <RecommendationCard key={rec.id} rec={rec} llmEnabled={llmEnabled} />
          ))}
        </div>
      )}
    </section>
  );
}
