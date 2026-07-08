import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight, X } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';

function dismissKey(userId: string): string {
  return `portfolioos.dismissedUpgradeBanner.${userId}`;
}

/**
 * Free-tier upsell on the Dashboard. Dismissible — persists per-account
 * in localStorage so closing it sticks across reloads, but stays scoped
 * to this one placement (the header pill and sidebar card remain
 * always-on, since this banner is the most visually heavy of the three).
 */
export function UpgradeBanner() {
  const user = useAuthStore((s) => s.user);
  const [dismissed, setDismissed] = useState(
    () => user != null && localStorage.getItem(dismissKey(user.id)) === '1',
  );

  if (!user || user.plan !== 'FREE' || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(dismissKey(user.id), '1');
    setDismissed(true);
  };

  return (
    <div className="relative rounded-lg border border-accent/25 bg-gradient-to-r from-accent/10 via-accent/5 to-transparent px-4 py-3.5 sm:px-6 sm:py-4 flex items-center justify-between gap-4 flex-wrap reveal">
      <div className="flex items-center gap-3 min-w-0">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-accent/15 text-accent shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">You're on the Free plan</p>
          <p className="text-[12px] text-muted-foreground">
            Upgrade to Plus for the full tax report catalog, AA auto-import, multiple portfolios, and AI insights.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button asChild size="sm">
          <Link to="/pricing">
            See plans <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          title="Dismiss"
          className="h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors focus-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
