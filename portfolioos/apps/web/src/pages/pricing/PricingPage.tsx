import { useState } from 'react';
import { Check, Sparkles, FlaskConical } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatPaiseAsRupees, planPriceFor, type BillingCycle, type PlanTierValue } from '@portfolioos/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { billingApi } from '@/api/billing.api';
import { apiErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/auth.store';
import { openRazorpayCheckout } from '@/lib/razorpay';
import { cn } from '@/lib/cn';

interface TierDef {
  tier: PlanTierValue;
  name: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
}

// Feature copy is pulled directly from the tier descriptions in the
// pricing-tiers-gating task, not reinvented. Prices come from
// @portfolioos/shared's PLAN_PRICING (also what Razorpay actually
// charges) — never hardcoded here.
const TIERS: TierDef[] = [
  {
    tier: 'FREE',
    name: 'Free',
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
    tagline: 'Automate ingestion, unlock the full report catalog.',
    features: [
      'Everything in Free',
      'Full 30+ tax/CA report catalog',
      'AA/Finvu auto-import — bank, MF, stocks',
      'Multiple portfolios',
      'AI insights (rule-based + LLM)',
      'AI Assistant — ask it your XIRR, tax exposure, or "am I overweight in IT?" in plain English',
      'Goal projections',
    ],
    highlight: true,
  },
  {
    tier: 'FAMILY',
    name: 'Family',
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

function priceDisplay(tier: PlanTierValue, cycle: BillingCycle): { price: string; note?: string } {
  if (tier === 'FREE') return { price: '₹0' };
  const price = planPriceFor(tier, cycle);
  if (!price) return { price: '—', note: `No ${cycle.toLowerCase()} plan yet` };
  const note =
    tier === 'FAMILY'
      ? '3 members included, +₹199/month per extra member (placeholder)'
      : cycle === 'ANNUAL'
      ? 'billed yearly (placeholder)'
      : 'placeholder';
  return { price: `${formatPaiseAsRupees(price.amountPaise)}/${cycle === 'ANNUAL' ? 'year' : 'month'}`, note };
}

export function PricingPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [pending, setPending] = useState<PlanTierValue | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>('MONTHLY');
  const isAdmin = user?.role === 'ADMIN';

  const handleDevSetPlan = async (tier: PlanTierValue) => {
    setPending(tier);
    try {
      const { user: updatedUser } = await billingApi.devSetPlan(tier);
      setUser(updatedUser);
      toast.success(`Plan set to ${tier} (no payment — ADMIN dev switch)`, { icon: '🧪' });
    } catch (err) {
      toast.error(apiErrorMessage(err, 'Could not switch plan'));
    } finally {
      setPending(null);
    }
  };

  const handleUpgrade = async (tier: PlanTierValue) => {
    setPending(tier);
    try {
      const intent = await billingApi.checkoutIntent(tier, cycle);
      if (intent.status === 'not_implemented') {
        toast(intent.message, { icon: '🚧' });
        return;
      }

      const payment = await openRazorpayCheckout({
        key: intent.keyId,
        amount: intent.amount,
        currency: intent.currency,
        name: 'PortfolioOS',
        description: `${tier} plan — ${cycle === 'ANNUAL' ? 'annual' : 'monthly'}`,
        order_id: intent.orderId,
        prefill: { name: user?.name, email: user?.email },
      });

      const { user: updatedUser } = await billingApi.verifyPayment({
        razorpayOrderId: payment.razorpay_order_id,
        razorpayPaymentId: payment.razorpay_payment_id,
        razorpaySignature: payment.razorpay_signature,
      });
      setUser(updatedUser);
      toast.success(`Upgraded to ${tier === 'PRO_ADVISOR' ? 'Pro/Advisor' : tier}`);
    } catch (err) {
      if (err instanceof Error && err.message === 'dismissed') {
        // User closed the checkout modal — no error toast needed.
      } else {
        toast.error(apiErrorMessage(err, 'Payment failed'));
      }
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
        actions={
          <div className="flex gap-0.5 rounded-md border border-border/70 bg-background/40 p-0.5">
            {(['MONTHLY', 'ANNUAL'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={cn(
                  'px-2.5 py-1 rounded-[5px] text-[11px] font-medium tracking-wide transition-all',
                  cycle === c
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {c === 'MONTHLY' ? 'Monthly' : 'Annual'}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {TIERS.map((t) => {
          const isCurrent = user?.plan === t.tier;
          const { price, note } = priceDisplay(t.tier, cycle);
          const priceUnavailable = t.tier !== 'FREE' && !planPriceFor(t.tier, cycle);
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
                  <span className="font-display text-[28px] leading-none">{price}</span>
                  {note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}
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
                  disabled={isCurrent || pending === t.tier || t.tier === 'FREE' || priceUnavailable}
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
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-1.5 w-full text-[11px] text-muted-foreground hover:text-foreground"
                    disabled={pending === t.tier}
                    onClick={() => handleDevSetPlan(t.tier)}
                  >
                    <FlaskConical className="h-3 w-3" /> Set (no payment — dev)
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
