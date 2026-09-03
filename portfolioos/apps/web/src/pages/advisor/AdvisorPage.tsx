import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Info, Loader2, Pencil, RefreshCw, ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LockedFeature } from '@/components/common/LockedFeature';
import { cn } from '@/lib/cn';
import { apiErrorMessage } from '@/api/client';
import {
  advisorApi,
  advisorKeys,
  RISK_CATEGORY_BLURB,
  RISK_CATEGORY_LABEL,
  type RiskCategory,
  type RiskProfile,
} from '@/api/advisor.api';
import { RiskQuestionnaire } from './RiskQuestionnaire';
import { AllocationDriftCard } from './widgets/AllocationDriftCard';
import { RecommendationFeed } from './widgets/RecommendationFeed';
import { ApprovedProductsPanel } from './ApprovedProductsPanel';

const CATEGORY_TONE: Record<RiskCategory, string> = {
  CONSERVATIVE: 'border-[hsl(210_75%_50%/0.4)] text-[hsl(210_75%_45%)] dark:text-[hsl(210_85%_70%)]',
  BALANCED: 'border-accent/45 text-accent-ink',
  GROWTH: 'border-positive/45 text-positive',
  AGGRESSIVE: 'border-negative/45 text-negative',
};

export function AdvisorPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Intelligence"
        title="Investment Advisor"
        description="A ranked, explained set of moves for your portfolio — built from your risk profile, your target allocation, and what you actually hold today. Every suggestion shows its reasoning, not just its conclusion."
        actions={<RefreshAction />}
      />

      <LockedFeature requiredTier="PLUS" featureName="Investment Advisor">
        <AdvisorContent />
      </LockedFeature>
    </div>
  );
}

/**
 * Lives outside `AdvisorContent` so the header action renders even while the
 * page body is loading. It's a no-op button until a profile exists — there is
 * nothing to regenerate from.
 */
function RefreshAction() {
  const qc = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: advisorKeys.riskProfile,
    queryFn: () => advisorApi.riskProfile(),
  });

  const regenerate = useMutation({
    mutationFn: () => advisorApi.regenerate(),
    onSuccess: (res) => {
      toast.success(
        res.recommendationCount === 1
          ? '1 recommendation ready'
          : `${res.recommendationCount} recommendations ready`,
      );
      qc.invalidateQueries({ queryKey: ['advisor', 'recommendations'] });
      qc.invalidateQueries({ queryKey: advisorKeys.allocation });
      qc.invalidateQueries({ queryKey: advisorKeys.runs });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not refresh your recommendations')),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => regenerate.mutate()}
      disabled={!profile || regenerate.isPending}
    >
      {regenerate.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      Refresh recommendations
    </Button>
  );
}

function AdvisorContent() {
  const [retaking, setRetaking] = useState(false);

  const profileQuery = useQuery({
    queryKey: advisorKeys.riskProfile,
    queryFn: () => advisorApi.riskProfile(),
  });

  const allocationQuery = useQuery({
    queryKey: advisorKeys.allocation,
    queryFn: () => advisorApi.allocation(),
    enabled: !!profileQuery.data,
  });

  // The prose button only exists when the backend says the model is available.
  const llmQuery = useQuery({
    queryKey: advisorKeys.llmStatus,
    queryFn: () => advisorApi.llmStatus(),
    staleTime: 5 * 60_000,
  });

  if (profileQuery.isLoading) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        <Loader2 className="inline h-5 w-5 animate-spin" /> Loading…
      </div>
    );
  }

  if (profileQuery.isError) {
    return (
      <Card className="p-6 text-sm text-negative">
        Couldn't load your advisor profile. Try again shortly.
      </Card>
    );
  }

  const profile = profileQuery.data ?? null;

  // No profile means no defensible advice — the questionnaire replaces the feed
  // entirely rather than sitting above it.
  if (!profile) {
    return (
      <div className="space-y-6">
        <Disclaimer />
        <RiskQuestionnaire />
      </div>
    );
  }

  if (retaking) {
    return (
      <div className="space-y-6">
        <Disclaimer />
        <RiskQuestionnaire
          existing={profile}
          onDone={() => setRetaking(false)}
          onCancel={() => setRetaking(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Disclaimer />

      <RiskProfileSummary profile={profile} onRetake={() => setRetaking(true)} />

      <AllocationDriftCard
        data={allocationQuery.data}
        isLoading={allocationQuery.isLoading}
        isError={allocationQuery.isError}
      />

      <RecommendationFeed llmEnabled={llmQuery.data?.enabled === true} />

      <ApprovedProductsPanel />
    </div>
  );
}

/** Permanent, non-dismissible. Nothing on this page places an order. */
function Disclaimer() {
  return (
    <p className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/25 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
      <Info className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
      <span>
        These are advisory recommendations, not executed trades. Nothing on this page places an
        order, moves money, or contacts your broker — acting on any suggestion is a separate,
        deliberate step you take yourself. Figures are estimates based on the data in your account.
      </span>
    </p>
  );
}

function RiskProfileSummary({
  profile,
  onRetake,
}: {
  profile: RiskProfile;
  onRetake: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
              Risk profile
            </p>
            <CardTitle className="mt-1 flex flex-wrap items-center gap-2.5">
              {RISK_CATEGORY_LABEL[profile.category]}
              <Badge
                variant="outline"
                className={cn('text-[10px] uppercase tracking-kerned', CATEGORY_TONE[profile.category])}
              >
                Score {profile.score}
              </Badge>
            </CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={onRetake}>
            <Pencil className="h-3.5 w-3.5" /> Retake assessment
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          {RISK_CATEGORY_BLURB[profile.category]}
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Category" value={RISK_CATEGORY_LABEL[profile.category]} />
          <Stat label="Score" value={String(profile.score)} numeric />
          <Stat label="Tax slab" value={`${profile.taxSlabPct}%`} numeric />
        </div>

        {profile.overrides.length > 0 && (
          <div className="rounded-lg border border-accent/25 bg-accent/[0.06] p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
              <ShieldAlert className="h-3 w-3" /> Adjustments we made
            </p>
            <ul className="mt-2 space-y-2">
              {profile.overrides.map((o, i) => (
                <li key={`${o.rule}-${i}`} className="text-[13px] leading-relaxed text-foreground">
                  <span className="text-muted-foreground">
                    {o.from} → <span className="font-medium text-foreground">{o.to}</span> —{' '}
                  </span>
                  {o.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Assessed{' '}
          {new Date(profile.assessedAt).toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </p>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <p className="text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-1 text-[15px] font-medium text-foreground', numeric && 'numeric-display')}>
        {value}
      </p>
    </div>
  );
}
