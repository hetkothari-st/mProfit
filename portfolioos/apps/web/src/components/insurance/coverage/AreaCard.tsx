import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Decimal, type AreaCheck, type NextStep } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TONE_DOT, TONE_TEXT } from '@/lib/insurance';
import { CoverageBar } from './CoverageBar';
import { inr, verdictLabel, verdictTone } from './verdict';

/** A next step: open the add-policy form, or go to the page that fixes it. */
export function NextStepButton({
  step,
  onAddPolicy,
  variant = 'outline',
}: {
  step: NextStep;
  onAddPolicy: (step: NextStep) => void;
  variant?: 'outline' | 'ghost' | 'default';
}) {
  if (step.kind === 'ADD_POLICY') {
    return (
      <Button size="sm" variant={variant} onClick={() => onAddPolicy(step)}>
        {step.label}
      </Button>
    );
  }
  return (
    <Button size="sm" variant={variant} asChild>
      <Link to={step.to}>{step.label}</Link>
    </Button>
  );
}

/** One area of the check: verdict, cover against need, why, and what to do. */
export function AreaCard({
  id,
  title,
  check,
  onAddPolicy,
  hideNext = false,
  children,
}: {
  id: string;
  title: string;
  check: AreaCheck;
  onAddPolicy: (step: NextStep) => void;
  /** When the card lists its own per-item steps. */
  hideNext?: boolean;
  children?: ReactNode;
}) {
  const tone = verdictTone(check);
  const showBar = check.cover !== null && check.need !== null && (check.verdict === 'COVERED' || check.verdict === 'SHORT' || check.verdict === 'MISSING');
  const hasGap = check.gap !== null && new Decimal(check.gap).greaterThan(0);

  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20">
      <Card className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id={`${id}-title`} className="font-display text-xl">
            {title}
          </h2>
          <p className={`flex items-center gap-1.5 text-sm font-medium ${TONE_TEXT[tone]}`}>
            <span aria-hidden className={`h-2 w-2 rounded-full ${TONE_DOT[tone]}`} />
            {verdictLabel(check)}
          </p>
        </div>

        <p className="mt-2 text-sm text-muted-foreground">{check.reason}</p>

        {showBar && (
          <div className="mt-4">
            <CoverageBar cover={check.cover!} need={check.need!} tone={tone} />
          </div>
        )}

        {(hasGap || (!hideNext && check.next)) && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            {hasGap ? (
              <p className="text-sm">
                Gap <span className={`font-display text-2xl tabular-nums ${TONE_TEXT[tone]}`}>{inr(check.gap!)}</span>
              </p>
            ) : (
              <span />
            )}
            {!hideNext && check.next && <NextStepButton step={check.next} onAddPolicy={onAddPolicy} />}
          </div>
        )}

        {children && <div className="mt-5 space-y-5">{children}</div>}
      </Card>
    </section>
  );
}
