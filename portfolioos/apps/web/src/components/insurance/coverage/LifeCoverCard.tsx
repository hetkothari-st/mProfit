import { RULES_OF_THUMB, type CoverageAssumptions, type CoverageFacts, type LifeCheck, type NextStep } from '@everypaisa/shared';
import { Figure } from '@/components/receipt/Receipt';
import { plural } from '@/lib/insurance';
import { AreaCard } from './AreaCard';
import { CheckRow, MoneyField, YearsField } from './fields';
import { inr } from './verdict';

function Row({ label, value, sign, strong = false }: { label: string; value: string; sign: '+' | '−' | '='; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? 'border-t border-border/60 pt-1.5 font-medium' : ''}`}>
      <dt className={strong ? '' : 'text-muted-foreground'}>{label}</dt>
      <dd className="shrink-0 tabular-nums">
        <span aria-hidden className="mr-1 text-muted-foreground">
          {sign}
        </span>
        {inr(value)}
      </dd>
    </div>
  );
}

/** Life cover: the rule of thumb and a needs-based estimate side by side, and the figures behind them. */
export function LifeCoverCard({
  facts,
  check,
  assumptions,
  onChange,
  onAddPolicy,
}: {
  facts: CoverageFacts;
  check: LifeCheck;
  assumptions: CoverageAssumptions;
  onChange: (patch: Partial<CoverageAssumptions>) => void;
  onAddPolicy: (step: NextStep) => void;
}) {
  const rot = check.ruleOfThumb;
  const nb = check.needsBased;
  const years = plural(assumptions.supportYears, 'year');
  const spending = nb.basis === 'INCOME' ? `Your income for ${years}` : `Household spending for ${years}`;
  const toggleGoal = (id: string, on: boolean) =>
    onChange({ goalIds: on ? [...assumptions.goalIds, id] : assumptions.goalIds.filter((g) => g !== id) });

  return (
    <AreaCard id="coverage-life" title="Life cover" check={check} onAddPolicy={onAddPolicy}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border/70 p-4">
          <h3 className="text-sm font-medium">Rule of thumb</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Figure label={`${rot.multiple}× your yearly income`}>{rot.need ? inr(rot.need) : 'Add your income'}</Figure>
            <Figure label="Gap">{rot.gap ? inr(rot.gap) : '—'}</Figure>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{RULES_OF_THUMB.lifeMultiple}</p>
        </div>

        <div className="rounded-lg border border-border/70 p-4">
          <h3 className="text-sm font-medium">Based on your needs</h3>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label={spending} value={nb.support} sign="+" />
            <Row label="Loans" value={nb.loans} sign="+" />
            <Row label="Goals to fund" value={nb.goals} sign="+" />
            <Row label="Savings you count" value={nb.liquidAssets} sign="−" />
            <Row label="Investments you count" value={nb.investments} sign="−" />
            <Row label="Your family would need" value={nb.need} sign="=" strong />
            <Row label="Your life cover" value={nb.existingCover} sign="−" />
            <Row label="Gap" value={nb.gap} sign="=" strong />
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            {RULES_OF_THUMB.needsBased}
            {nb.basis === 'INCOME' && ' We’ve used your income because we don’t know your yearly spending — add it below for a closer figure.'}
          </p>
        </div>
      </div>

      <div className="border-t border-border/60 pt-4">
        <h3 className="text-sm font-medium">Your figures</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Filled in from what you’ve recorded. Changes here update the check but aren’t saved.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <MoneyField id="cov-income" label="Yearly income" value={assumptions.annualIncome} onChange={(v) => onChange({ annualIncome: v })} />
          <MoneyField
            id="cov-expenses"
            label="Yearly household expenses"
            value={assumptions.annualExpenses ?? ''}
            blankNote="Blank: we’ll use your income instead"
            onChange={(v) => onChange({ annualExpenses: v.trim() === '' ? null : v })}
          />
          <YearsField
            id="cov-years"
            label="Years your family would need support"
            value={assumptions.supportYears}
            note={RULES_OF_THUMB.supportYears}
            onChange={(v) => onChange({ supportYears: v })}
          />
          <MoneyField id="cov-loans" label="Loans outstanding" value={assumptions.loans} onChange={(v) => onChange({ loans: v })} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {facts.goals.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Goals your cover should pay for</legend>
              {facts.goals.map((g) => (
                <CheckRow key={g.id} checked={assumptions.goalIds.includes(g.id)} onChange={(on) => toggleGoal(g.id, on)}>
                  {g.name} <span className="text-muted-foreground">— {inr(g.remaining)} to go</span>
                </CheckRow>
              ))}
            </fieldset>
          )}
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Savings to set against the need</legend>
            <CheckRow checked={assumptions.countLiquidAssets} onChange={(v) => onChange({ countLiquidAssets: v })}>
              Savings and deposits <span className="text-muted-foreground">— {inr(facts.figures.liquidAssets)}</span>
            </CheckRow>
            <CheckRow checked={assumptions.countInvestments} onChange={(v) => onChange({ countInvestments: v })}>
              Other investments <span className="text-muted-foreground">— {inr(facts.figures.otherInvestments)}</span>
            </CheckRow>
          </fieldset>
        </div>
      </div>
    </AreaCard>
  );
}
