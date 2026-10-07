import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { intelligenceApi } from '@/api/intelligence.api';
import { HealthScoreGauge } from './HealthScoreGauge';

import { UNGRADED } from '@/api/intelligence.api';
const GRADE_BLURB: Record<string, string> = {
  A: 'Excellent — your finances are in great shape.',
  B: 'Good — a few areas could use attention.',
  C: 'Fair — some gaps are holding you back.',
  D: 'Needs work — several areas need attention.',
  F: 'At risk — start with the lowest-scoring area.',
};

/**
 * Dashboard summary only: gauge + one-line takeaway + link to /health-score
 * for the full per-dimension breakdown. Keeps the dashboard scannable
 * instead of repeating all six dimension cards inline.
 */
export function HealthScore() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['intelligence', 'health-score'],
    queryFn: () => intelligenceApi.healthScore(),
  });

  if (isLoading) {
    return (
      <Card className="p-6 animate-pulse text-sm text-muted-foreground">
        Computing your financial health score…
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card className="p-6 text-sm text-negative">
        Couldn't load your health score. Try again shortly.
      </Card>
    );
  }

  return (
    <Link to="/health-score" className="group block">
      <Card className="flex flex-col items-center gap-4 p-5 transition-shadow hover:shadow-sm sm:flex-row sm:gap-5">
        <HealthScoreGauge score={data.overallScore} grade={data.grade} size={84} />
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
            Financial Health Score
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.grade === UNGRADED
              ? 'Not enough data to grade yet. Add your income and expenses to get a score.'
              : (GRADE_BLURB[data.grade] ?? 'See your full breakdown.')}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-accent-ink group-hover:underline">
          View breakdown <ArrowRight className="h-4 w-4" />
        </span>
      </Card>
    </Link>
  );
}
