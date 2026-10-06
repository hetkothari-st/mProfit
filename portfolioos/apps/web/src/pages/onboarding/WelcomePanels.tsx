import { useState } from 'react';
import { ChevronRight, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { PRIVACY_PROMISE } from '@/lib/privacyPromise';
import { WELCOME_FEATURES, WELCOME_LINES } from './welcomeContent';

/**
 * The first thing a new account sees: what this is for, what it does, and
 * what becomes of what they put in it — then straight into setting up.
 *
 * Three panels, each skippable, none of them asking for anything. Somebody
 * who wants to get on with entering their fixed deposits can be past all of
 * it in one tap; somebody deciding whether to trust a stranger with their net
 * worth has the answer before they are asked for a single number.
 */

interface Props {
  name?: string | null;
  onDone: () => void;
}

type Panel = 'hello' | 'features' | 'privacy';
const ORDER: Panel[] = ['hello', 'features', 'privacy'];

export function WelcomePanels({ name, onDone }: Props) {
  const [panel, setPanel] = useState<Panel>('hello');
  const index = ORDER.indexOf(panel);
  const advance = () => {
    const next = ORDER[index + 1];
    if (next) setPanel(next);
    else onDone();
  };
  const firstName = (name ?? '').trim().split(/\s+/)[0];

  return (
    <div>
      {panel === 'hello' && <Hello firstName={firstName} />}
      {panel === 'features' && <Features />}
      {panel === 'privacy' && <Privacy />}

      <Button className="mt-7 w-full" size="lg" onClick={advance}>
        {panel === 'privacy' ? 'Set up my account' : 'Continue'}
        <ChevronRight className="h-4 w-4" />
      </Button>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-1.5" aria-hidden>
          {ORDER.map((p) => (
            <span
              key={p}
              className={cn(
                'h-1.5 rounded-full transition-all',
                p === panel ? 'w-5 bg-accent' : 'w-1.5 bg-border',
              )}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onDone}
          className="text-[12.5px] text-muted-foreground transition-colors hover:text-foreground focus-ring rounded-md px-1"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function Hello({ firstName }: { firstName?: string }) {
  // One line, chosen per mount so the same account is not greeted the same
  // way twice if they come back to set up again.
  const [line] = useState(() => WELCOME_LINES[Math.floor(Math.random() * WELCOME_LINES.length)]!);
  return (
    <div>
      <p className="text-[11px] uppercase tracking-kerned text-accent-ink/80">Welcome</p>
      <h1 className="mt-1.5 font-display text-2xl leading-tight sm:text-[28px]">
        {firstName
          ? `Let's get your books in order, ${firstName}.`
          : "Let's get your books in order."}
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
        Most people keep their money in a dozen places and their picture of it in none. This is
        where the dozen becomes one page — worth, returns, what is due, and what the tax on it would
        be.
      </p>
      <blockquote className="mt-6 border-l-2 border-accent/50 pl-4 text-[14.5px] font-medium italic leading-relaxed text-foreground/90">
        {line}
      </blockquote>
      <p className="mt-6 text-[13px] text-muted-foreground">
        Setting up takes a few minutes. Rough numbers are fine — everything can be corrected later,
        and nothing here is ever shown to anyone else.
      </p>
    </div>
  );
}

function Features() {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-kerned text-accent-ink/80">What you get</p>
      <h1 className="mt-1.5 font-display text-2xl leading-tight">
        Built for everything you actually own
      </h1>
      <ul className="mt-5 space-y-3.5">
        {WELCOME_FEATURES.map((f) => (
          <li key={f.title} className="flex gap-3">
            <span className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-lg bg-accent/12 text-accent-ink">
              <f.icon className="h-4 w-4" strokeWidth={1.9} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold leading-tight text-foreground">
                {f.title}
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted-foreground">
                {f.body}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Privacy() {
  const promise = PRIVACY_PROMISE;
  return (
    <div>
      <p className="text-[11px] uppercase tracking-kerned text-accent-ink/80">Privacy</p>
      <h1 className="mt-1.5 flex items-center gap-2 font-display text-2xl leading-tight">
        <ShieldCheck className="h-6 w-6 flex-none text-accent-ink" strokeWidth={1.8} />
        {promise.headline}
      </h1>
      <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">{promise.body}</p>
      <ul className="mt-5 space-y-2.5">
        {promise.points.map((point) => (
          <li key={point} className="flex gap-2.5">
            <Lock
              className="mt-[3px] h-3.5 w-3.5 flex-none text-accent-ink"
              strokeWidth={2.2}
              aria-hidden
            />
            <span className="text-[12.5px] leading-relaxed text-foreground/90">{point}</span>
          </li>
        ))}
      </ul>
      <p className="mt-5 rounded-lg border border-border/70 bg-muted/30 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
        {promise.footer}
      </p>
    </div>
  );
}
