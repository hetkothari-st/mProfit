import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import type { PlanTierValue } from '@portfolioos/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { billingApi } from '@/api/billing.api';
import { apiErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/cn';

interface TierDef {
  tier: PlanTierValue;
  name: string;
  price: string;
  priceNote?: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
}

// Prices are placeholders pending real business-side confirmation — flagged
// here and in the checkout-intent stub. Feature copy is pulled directly
// from the tier descriptions in the pricing-tiers-gating task, not
// reinvented.
const TIERS: TierDef[] = [
  {
    tier: 'FREE',
    name: 'Free',
    price: '₹0',
    tagline: 'Get your net worth in one place.',
    features: [
      'Net worth + dashboard',
      'Manual entry across all asset classes',
      '1 portfolio',
      'Basic reports (holdings summary, XIRR, cash flow)',
    ],
  },
  {
    tier: 'PLUS',
    name: 'Plus',
    price: '₹499',
    priceNote: '/month · ₹4,999/year (placeholder)',
    tagline: 'Automate ingestion, unlock the full report catalog.',
    features: [
      'Everything in Free',
      'Full 30+ tax/CA report catalog',
      'AA/Finvu auto-import — bank, MF, stocks',
      'Multiple portfolios',
      'AI insights (rule-based + LLM)',
      'Goal projections',
    ],
    highlight: true,
  },
  {
    tier: 'FAMILY',
    name: 'Family',
    price: '₹899',
    priceNote: '/month · 3 members included, +₹199/month per extra member (placeholder)',
    tagline: 'One consolidated view for the whole household.',
    features: [
      'Everything in Plus',
      'Family portfolio sharing (3 seats included)',
      'Consolidated family net worth',
      'Consolidated family reports',
    ],
  },
  {
    tier: 'PRO_ADVISOR',
    name: 'Pro/Advisor',
    price: '₹1,999',
    priceNote: '/month (placeholder)',
    tagline: 'For CAs and advisors running client books.',
    features: [
      'Everything in Family',
      'Full accounting module — Trial Balance, P&L, Balance Sheet',
      'Unlimited portfolios / clients',
      'F&O-heavy reports (Schedule 43)',
      'Priority AA refresh frequency',
      'PDF/ITR exports',
    ],
  },
];

export function PricingPage() {
  const user = useAuthStore((s) => s.user);
  const [pending, setPending] = useState<PlanTierValue | null>(null);

  const handleUpgrade = async (tier: PlanTierValue) => {
    setPending(tier);
    try {
      const res = await billingApi.checkoutIntent(tier);
      toast(res.message, { icon: '🚧' });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not start checkout'));
    } finally {
      setPending(null);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Pricing"
        title="Plans for every stage of your portfolio"
        description="Free forever for a single portfolio and the essentials. Upgrade as your needs grow — every tier includes everything in the tier below it."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {TIERS.map((t) => {
          const isCurrent = user?.plan === t.tier;
          return (
            <Card
              key={t.tier}
              tone={t.highlight ? 'hero' : 'default'}
              className={cn('flex flex-col', t.highlight && 'ring-1 ring-accent/40')}
            >
              <CardHeader className="pb-2">
                {t.highlight && (
                  <Badge className="w-fit mb-2">
                    <Sparkles className="h-3 w-3 mr-1" /> Most popular
                  </Badge>
                )}
                <CardTitle>{t.name}</CardTitle>
                <div className="mt-1">
                  <span className="font-display text-[28px] leading-none">{t.price}</span>
                  {t.priceNote && (
                    <p className="mt-1 text-[11px] text-muted-foreground">{t.priceNote}</p>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t.tagline}</p>
              </CardHeader>
              <CardContent className="flex flex-col flex-1">
                <ul className="space-y-2 flex-1">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-foreground">
                      <Check className="h-3.5 w-3.5 mt-0.5 text-accent shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-5 w-full"
                  variant={isCurrent ? 'outline' : t.highlight ? 'default' : 'outline'}
                  disabled={isCurrent || pending === t.tier || t.tier === 'FREE'}
                  onClick={() => handleUpgrade(t.tier)}
                >
                  {isCurrent
                    ? 'Current plan'
                    : t.tier === 'FREE'
                    ? 'Included'
                    : pending === t.tier
                    ? 'Starting checkout…'
                    : `Upgrade to ${t.name}`}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
