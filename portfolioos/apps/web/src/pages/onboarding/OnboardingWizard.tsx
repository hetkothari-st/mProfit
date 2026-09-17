import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { portfoliosApi } from '@/api/portfolios.api';
import { apiErrorMessage } from '@/api/client';
import { cn } from '@/lib/cn';
import { BrandMark, BrandWordmark } from '@/components/brand/BrandLogo';
import { useAuthStore } from '@/stores/auth.store';
import { markOnboardingFinished, markOnboardingStarted } from '@/lib/onboardingProgress';
import {
  ONBOARDING_GROUPS,
  ONBOARDING_ITEMS,
  onboardingItem,
  type OnboardingItemId,
} from './onboardingItems';
import { QuickAddForm } from './QuickAddForms';

interface Props {
  onComplete: () => void;
}

type Phase = 'pick' | 'add' | 'done';

/**
 * New-account setup: pick what you own, add each with a few fields, land on
 * a dashboard that already has numbers. Every step can be skipped.
 */
export function OnboardingWizard({ onComplete }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>('pick');
  const [selected, setSelected] = useState<OnboardingItemId[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [added, setAdded] = useState<Partial<Record<OnboardingItemId, string[]>>>({});
  const userId = useAuthStore((s) => s.user?.id);

  // Remember that this account is mid-setup, so signing in again resumes it.
  useEffect(() => {
    if (userId) markOnboardingStarted(userId);
  }, [userId]);

  // Every holding needs a portfolio, so one is created up front instead of
  // asking the user to name it. `onboarding: true` makes this idempotent
  // server-side: an account that already has a portfolio gets that one back.
  const portfolioQuery = useQuery({
    // Per account: never reuse another account's portfolio id from the cache.
    queryKey: ['onboarding', 'portfolio', userId],
    queryFn: () =>
      portfoliosApi.create({ name: 'My Portfolio', type: 'INVESTMENT', onboarding: true }),
    enabled: Boolean(userId),
    staleTime: Infinity,
    retry: 1,
  });

  const finish = () => {
    if (userId) markOnboardingFinished(userId);
    onComplete();
    // Everything added here feeds the dashboard; make sure it refetches.
    // Not the onboarding portfolio query itself — refetching that would POST
    // the create again.
    void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'onboarding' });
    navigate('/dashboard', { replace: true });
  };

  const toggle = (id: OnboardingItemId) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Keep the steps in the order the picker shows them, not tap order.
  const steps = ONBOARDING_ITEMS.map((i) => i.id).filter((id) => selected.includes(id));
  const currentId = steps[stepIndex];
  const totalAdded = Object.values(added).reduce((n, list) => n + (list?.length ?? 0), 0);

  const next = () => {
    if (stepIndex + 1 < steps.length) setStepIndex(stepIndex + 1);
    else setPhase('done');
  };

  const back = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
    else setPhase('pick');
  };

  let body: JSX.Element;

  if (portfolioQuery.isLoading) {
    body = (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  } else if (portfolioQuery.isError || !portfolioQuery.data) {
    body = (
      <div className="text-center py-8">
        <p className="text-sm text-negative mb-4">
          {apiErrorMessage(portfolioQuery.error, 'Could not set up your account')}
        </p>
        <Button variant="outline" onClick={() => void portfolioQuery.refetch()}>
          Try again
        </Button>
      </div>
    );
  } else if (phase === 'pick') {
    body = (
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold mb-1">What do you have?</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Pick everything that applies. You&apos;ll add each one with just a few details — rough
          numbers are fine.
        </p>
        <div className="space-y-5">
          {ONBOARDING_GROUPS.map((group) => (
            <div key={group.heading}>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                {group.heading}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {group.items.map((item) => {
                  const on = selected.includes(item.id);
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(item.id)}
                      className={cn(
                        'relative flex items-center gap-2 rounded-lg border px-3 py-3 text-left text-sm transition-colors',
                        on
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border hover:border-foreground/30',
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0',
                          on ? 'text-primary' : 'text-muted-foreground',
                        )}
                      />
                      <span className="leading-tight">{item.label}</span>
                      {on && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <Button
          className="w-full mt-8"
          disabled={selected.length === 0}
          onClick={() => {
            setStepIndex(0);
            setPhase('add');
          }}
        >
          Continue
          <ChevronRight className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={finish}
          className="mt-3 w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          Skip — I&apos;ll add things later
        </button>
      </div>
    );
  } else if (phase === 'add' && currentId) {
    const item = onboardingItem(currentId);
    const addedHere = added[currentId] ?? [];
    const Icon = item.icon;
    body = (
      <div>
        <div className="flex items-center justify-between mb-4 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={back}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <span>
            {stepIndex + 1} of {steps.length}
          </span>
        </div>
        <div className="h-1 rounded-full bg-muted mb-6 overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-5 w-5 text-primary" />
          <h1 className="text-xl sm:text-2xl font-semibold">{item.label}</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-5">{item.prompt}</p>

        {addedHere.length > 0 && (
          <ul className="mb-4 space-y-1.5">
            {addedHere.map((line, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-md bg-positive/10 px-3 py-2 text-sm"
              >
                <Check className="h-4 w-4 shrink-0 text-positive" />
                <span className="truncate">{line}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Keyed per item so switching steps starts each form clean. */}
        <QuickAddForm
          key={currentId}
          item={currentId}
          portfolioId={portfolioQuery.data.id}
          onSaved={(summary) =>
            setAdded((prev) => ({ ...prev, [currentId]: [...(prev[currentId] ?? []), summary] }))
          }
        />

        <Button
          className="w-full mt-3"
          variant={addedHere.length > 0 ? 'default' : 'ghost'}
          onClick={next}
        >
          {addedHere.length > 0 ? (stepIndex + 1 < steps.length ? 'Next' : 'Finish') : 'Skip'}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="text-center">
        <div className="h-14 w-14 rounded-full bg-primary/15 grid place-items-center mx-auto mb-4">
          <Check className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-xl sm:text-2xl font-semibold mb-2">
          {totalAdded > 0 ? "You're all set" : 'Nothing added yet'}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {totalAdded > 0
            ? `${totalAdded} ${totalAdded === 1 ? 'entry' : 'entries'} added. Your dashboard is ready — you can refine any of them from its own page.`
            : 'No problem — you can add investments any time from the sidebar.'}
        </p>
        {totalAdded > 0 && (
          <ul className="mb-6 space-y-1.5 text-left">
            {steps
              .filter((id) => (added[id]?.length ?? 0) > 0)
              .map((id) => (
                <li
                  key={id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span>{onboardingItem(id).label}</span>
                  <span className="text-muted-foreground">{added[id]!.length}</span>
                </li>
              ))}
          </ul>
        )}
        <Button onClick={finish} className="w-full" size="lg">
          Go to dashboard
          <ChevronRight className="h-4 w-4" />
        </Button>
        {steps.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setStepIndex(steps.length - 1);
              setPhase('add');
            }}
            className="mt-3 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Go back and add more
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-start sm:items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-center gap-4 mb-8">
          <BrandMark />
          <BrandWordmark />
        </div>
        <div className="rounded-xl border bg-card shadow-sm p-5 sm:p-8">{body}</div>
      </div>
    </div>
  );
}
