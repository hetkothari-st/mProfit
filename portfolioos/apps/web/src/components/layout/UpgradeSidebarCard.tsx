import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

const NEXT_TIER_COPY: Record<string, { label: string; blurb: string }> = {
  FREE: { label: 'Go Plus', blurb: 'Full reports, AI insights, more portfolios' },
  PLUS: { label: 'Go Family', blurb: 'Share your portfolio with family' },
  FAMILY: { label: 'Go Pro/Advisor', blurb: 'Full accounting module, unlimited clients' },
};

/**
 * Pinned above BudgetGauge in the sidebar footer — stays visible
 * regardless of nav scroll position, unlike a plain list entry. Hidden
 * only for PRO_ADVISOR (nothing above it to upgrade to). Shown for ADMIN
 * too, keyed off their `plan` value — admin bypasses actual feature
 * gates, but still wants to see/QA the upgrade path per tier.
 */
export function UpgradeSidebarCard({ collapsed }: { collapsed: boolean }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  const copy = NEXT_TIER_COPY[user.plan];
  if (!copy) return null;

  if (collapsed) {
    return (
      <Link
        to="/pricing"
        title={copy.label}
        className="flex justify-center py-2 text-accent hover:text-accent-ink transition-colors"
      >
        <Sparkles className="h-4 w-4" />
      </Link>
    );
  }

  return (
    <Link
      to="/pricing"
      className="mx-3 mb-2 block rounded-md border border-accent/25 bg-accent/10 hover:bg-accent/15 px-3 py-2.5 transition-colors"
    >
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-accent-ink">
        <Sparkles className="h-3.5 w-3.5" /> {copy.label}
      </div>
      <p className="mt-0.5 text-[10.5px] text-sidebar-foreground/70">{copy.blurb}</p>
    </Link>
  );
}
