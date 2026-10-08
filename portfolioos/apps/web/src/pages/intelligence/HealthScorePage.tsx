import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  PiggyBank,
  TrendingUp,
  Scale,
  PieChart,
  Shield,
  Target,
  RefreshCw,
  Loader2,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { intelligenceApi, type HealthSubScore } from '@/api/intelligence.api';
import { HealthScoreGauge } from '@/components/intelligence/HealthScoreGauge';

import { formatDateTimeIST } from '@everypaisa/shared';
type DimensionId = 'emergencyFund' | 'investmentRate' | 'debtBurden' | 'diversification' | 'insurance' | 'goalProgress';

interface DimensionLink {
  label: string;
  to: string;
}

interface DimensionMeta {
  label: string;
  weight: number;
  icon: LucideIcon;
  explanation: string;
  links: DimensionLink[];
}

const DIMENSION_META: Record<DimensionId, DimensionMeta> = {
  emergencyFund: {
    label: 'Emergency Fund',
    weight: 20,
    icon: PiggyBank,
    explanation: 'How many months of expenses your liquid assets (savings, FDs) could cover. Target: 6 months.',
    links: [
      { label: 'Bank Accounts', to: '/bank-accounts' },
      { label: 'FDs & RDs', to: '/fds' },
    ],
  },
  investmentRate: {
    label: 'Investment Rate',
    weight: 20,
    icon: TrendingUp,
    explanation: 'Share of your income going into investments each month, based on the last 3 months. Target: 20%.',
    links: [{ label: 'Transactions', to: '/transactions' }, { label: 'Income', to: '/income' }],
  },
  debtBurden: {
    label: 'Debt Burden',
    weight: 20,
    icon: Scale,
    explanation: 'Share of your income going toward EMIs and credit card minimums. Full score at 20% or under, zero at 60% or above.',
    links: [
      { label: 'Loans', to: '/loans' },
      { label: 'Credit Cards', to: '/credit-cards' },
      { label: 'Income', to: '/income' },
    ],
  },
  diversification: {
    label: 'Diversification',
    weight: 20,
    icon: PieChart,
    explanation: 'How spread out your portfolio is across asset classes and holdings, and whether your equity mix fits your age.',
    links: [{ label: 'Analytics', to: '/analytics' }, { label: 'Portfolios', to: '/portfolios' }],
  },
  insurance: {
    label: 'Insurance Coverage',
    weight: 10,
    icon: Shield,
    explanation: 'Your life insurance sum assured measured against 10x your annual income.',
    links: [{ label: 'Insurance', to: '/insurance' }, { label: 'Income', to: '/income' }],
  },
  goalProgress: {
    label: 'Goal Progress',
    weight: 10,
    icon: Target,
    explanation: 'Average progress across your active financial goals.',
    links: [{ label: 'Goals', to: '/goals' }],
  },
};

const DIMENSION_ORDER: DimensionId[] = [
  'emergencyFund', 'investmentRate', 'debtBurden', 'diversification', 'insurance', 'goalProgress',
];

const GRADE_BANDS: Array<{ grade: string; range: string; desc: string }> = [
  { grade: 'A', range: '85–100', desc: 'Excellent' },
  { grade: 'B', range: '70–84', desc: 'Good' },
  { grade: 'C', range: '55–69', desc: 'Fair' },
  { grade: 'D', range: '40–54', desc: 'Needs work' },
  { grade: 'F', range: '0–39', desc: 'At risk' },
];

const UNSCORED_TONE = { bar: 'bg-muted', text: 'text-muted-foreground', ring: 'ring-border' };

function scoreTone(score: number): { bar: string; text: string; ring: string } {
  if (score < 40) return { bar: 'bg-negative', text: 'text-negative', ring: 'ring-negative/30' };
  if (score < 70) return { bar: 'bg-orange-500', text: 'text-orange-600', ring: 'ring-orange-500/30' };
  return { bar: 'bg-positive', text: 'text-positive', ring: 'ring-positive/30' };
}

export function HealthScorePage() {
  const qc = useQueryClient();
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['intelligence', 'health-score'],
    queryFn: () => intelligenceApi.healthScore(),
  });

  const recalculate = async () => {
    await intelligenceApi.healthScore(true);
    qc.invalidateQueries({ queryKey: ['intelligence', 'health-score'] });
  };

  return (
    <div>
      <PageHeader
        eyebrow="Intelligence"
        title="Financial Health Score"
        description="One number summarizing six areas of your financial life — emergency readiness, investing discipline, debt load, diversification, insurance, and goal progress — each weighted by importance. Recalculated automatically every 24 hours."
        actions={
          <Button variant="outline" size="sm" onClick={recalculate} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Recalculate
          </Button>
        }
      />

      {isLoading && (
        <div className="py-10 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin inline" /> Loading…
        </div>
      )}

      {error || (!isLoading && !data) ? (
        <Card className="p-6 text-sm text-negative">Couldn't load your health score. Try again shortly.</Card>
      ) : null}

      {data && (
        <>
          <Card className="mb-6 flex flex-col items-center gap-8 p-6 sm:flex-row sm:items-center sm:justify-center">
            <div className="flex flex-col items-center gap-2">
              <HealthScoreGauge score={data.overallScore} grade={data.grade} size={200} />
              <p className="text-xs text-muted-foreground">
                Updated {formatDateTimeIST(data.computedAt)}
              </p>
            </div>
            <div className="w-full max-w-xs shrink-0">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
                Grade scale
              </p>
              <ul className="space-y-1">
                {GRADE_BANDS.map((b) => (
                  <li
                    key={b.grade}
                    className={cn(
                      'flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm',
                      b.grade === data.grade ? 'bg-accent/12 ring-1 ring-accent/40 font-medium text-accent-ink' : 'text-muted-foreground',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-4 shrink-0 font-display">{b.grade}</span>
                      <span>{b.desc}</span>
                    </span>
                    <span className="tabular-nums text-xs">{b.range}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {DIMENSION_ORDER.map((id) => (
              <DimensionDetailCard key={id} id={id} sub={data.subScores[id]} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DimensionDetailCard({ id, sub }: { id: DimensionId; sub: HealthSubScore }) {
  const meta = DIMENSION_META[id];
  const Icon = meta.icon;
  const scored = sub.score != null;
  const tone = scored ? scoreTone(sub.score!) : UNSCORED_TONE;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/60 ring-1', tone.ring)}>
              <Icon className={cn('h-4 w-4', tone.text)} strokeWidth={1.8} />
            </span>
            {meta.label}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="whitespace-nowrap text-[10px] text-muted-foreground">
              Weight {meta.weight}%
            </Badge>
            {scored ? (
              <span className={cn('numeric-display text-lg font-semibold', tone.text)}>{sub.score}</span>
            ) : (
              <span className="whitespace-nowrap text-xs text-muted-foreground">Not scored</span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
          {scored && <div className={cn('h-full transition-all', tone.bar)} style={{ width: `${sub.score}%` }} />}
        </div>

        <p className="text-[12.5px] leading-relaxed text-muted-foreground">{meta.explanation}</p>

        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">Where you stand</p>
          <p className="mt-1 text-[13px] text-foreground">{sub.insight}</p>
        </div>

        {sub.action && (
          <div className="rounded-lg border border-accent/25 bg-accent/[0.06] p-3">
            <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
              {scored ? 'Fix this' : 'To score this'}
            </p>
            <p className="mt-1 text-[13px] text-foreground">{sub.action}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
          {meta.links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent-ink hover:underline"
            >
              Go to {link.label} <ArrowUpRight className="h-3 w-3" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
