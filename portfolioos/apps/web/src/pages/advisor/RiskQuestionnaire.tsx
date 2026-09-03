import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, ShieldQuestion } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/cn';
import { apiErrorMessage } from '@/api/client';
import {
  advisorApi,
  advisorKeys,
  type DrawdownReaction,
  type InvestableShare,
  type RiskHorizon,
  type RiskObjective,
  type RiskProfile,
  type RiskQuestionnaireInput,
  type TaxSlab,
} from '@/api/advisor.api';

interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

const HORIZON_CHOICES: Choice<RiskHorizon>[] = [
  { value: 'LT_3Y', label: 'Under 3 years', hint: 'I will need this money soon' },
  { value: 'Y3_7', label: '3 to 7 years' },
  { value: 'Y7_15', label: '7 to 15 years' },
  { value: 'GT_15Y', label: 'More than 15 years', hint: 'Retirement-distance money' },
];

const DRAWDOWN_CHOICES: Choice<DrawdownReaction>[] = [
  { value: 'SELL_ALL', label: 'Sell everything', hint: 'I could not sleep through it' },
  { value: 'SELL_SOME', label: 'Sell some of it', hint: 'Trim the risk and wait' },
  { value: 'HOLD', label: 'Hold and do nothing', hint: 'Ride it out' },
  { value: 'BUY_MORE', label: 'Buy more', hint: 'A 20% discount is an opportunity' },
];

const INVESTABLE_CHOICES: Choice<InvestableShare>[] = [
  { value: 'LT_10', label: 'Under 10%' },
  { value: 'PCT_10_20', label: '10–20%' },
  { value: 'PCT_20_35', label: '20–35%' },
  { value: 'GT_35', label: 'Over 35%' },
];

const OBJECTIVE_CHOICES: Choice<RiskObjective>[] = [
  { value: 'PRESERVE', label: 'Protect what I have', hint: 'Beat inflation, nothing more' },
  { value: 'INCOME', label: 'Generate regular income' },
  { value: 'BALANCED_GROWTH', label: 'Grow steadily with some safety' },
  { value: 'MAX_GROWTH', label: 'Grow as fast as possible', hint: 'I accept sharp falls' },
];

const TAX_SLAB_CHOICES: Choice<TaxSlab>[] = [
  { value: 'PCT_5', label: '5%' },
  { value: 'PCT_20', label: '20%' },
  { value: 'PCT_30', label: '30%' },
  { value: 'UNSURE', label: 'Not sure' },
];

const EMERGENCY_CHOICES: Choice<'yes' | 'no'>[] = [
  { value: 'yes', label: 'Yes', hint: 'At least 6 months of expenses set aside' },
  { value: 'no', label: 'No, not yet' },
];

interface QuestionProps {
  index: number;
  question: string;
  help?: string;
  children: ReactNode;
}

function Question({ index, question, help, children }: QuestionProps) {
  return (
    <div className="border-t border-border/60 pt-5 first:border-0 first:pt-0">
      <div className="flex items-baseline gap-3">
        <span className="numeric text-[11px] font-medium text-accent-ink/70">
          {String(index).padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium leading-snug text-foreground">{question}</p>
          {help && <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{help}</p>}
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

function ChoiceGroup<T extends string>({
  name,
  choices,
  value,
  onChange,
}: {
  name: string;
  choices: Choice<T>[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="grid gap-2 sm:grid-cols-2">
      {choices.map((c) => {
        const selected = value === c.value;
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(c.value)}
            className={cn(
              'rounded-lg border px-3.5 py-2.5 text-left transition-all',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
              selected
                ? 'border-accent/50 bg-accent/[0.08] ring-1 ring-accent/30'
                : 'border-border/70 bg-card hover:border-accent/40 hover:bg-muted/40',
            )}
          >
            <span
              className={cn(
                'block text-[13.5px] font-medium',
                selected ? 'text-accent-ink' : 'text-foreground',
              )}
            >
              {c.label}
            </span>
            {c.hint && (
              <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                {c.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface RiskQuestionnaireProps {
  /** The current profile, if any. Its `answers` are echoed back by the API, so
   *  a retake starts from what was said last time rather than a blank form. */
  existing?: RiskProfile | null;
  onDone?: (profile: RiskProfile) => void;
  onCancel?: () => void;
}

export function RiskQuestionnaire({ existing, onDone, onCancel }: RiskQuestionnaireProps) {
  const qc = useQueryClient();

  // Prefill from the previous submission on a retake. Re-answering seven
  // questions from scratch to change one is the kind of friction that stops
  // people keeping their profile current.
  const prior = existing?.answers ?? null;

  const [age, setAge] = useState(prior?.age != null ? String(prior.age) : '');
  const [horizon, setHorizon] = useState<RiskHorizon | null>(prior?.horizon ?? null);
  const [drawdownReaction, setDrawdownReaction] = useState<DrawdownReaction | null>(
    prior?.drawdownReaction ?? null,
  );
  const [investableShareOfIncome, setInvestableShare] = useState<InvestableShare | null>(
    prior?.investableShareOfIncome ?? null,
  );
  const [objective, setObjective] = useState<RiskObjective | null>(prior?.objective ?? null);
  const [hasEmergencyFund, setHasEmergencyFund] = useState<'yes' | 'no' | null>(
    prior == null ? null : prior.hasEmergencyFund ? 'yes' : 'no',
  );
  const [taxSlab, setTaxSlab] = useState<TaxSlab | null>(prior?.taxSlab ?? null);
  const [touched, setTouched] = useState(false);

  // Age is a plain count, not money — parseInt is the explicit, lint-approved route.
  const ageNum = Number.parseInt(age.trim(), 10);
  const ageValid = age.trim() !== '' && Number.isFinite(ageNum) && ageNum >= 18 && ageNum <= 100;

  const complete =
    ageValid &&
    horizon !== null &&
    drawdownReaction !== null &&
    investableShareOfIncome !== null &&
    objective !== null &&
    hasEmergencyFund !== null &&
    taxSlab !== null;

  const submitMut = useMutation({
    mutationFn: (input: RiskQuestionnaireInput) => advisorApi.submitRiskProfile(input),
    onSuccess: (profile) => {
      toast.success('Risk profile saved');
      qc.invalidateQueries({ queryKey: advisorKeys.riskProfile });
      qc.invalidateQueries({ queryKey: advisorKeys.allocation });
      qc.invalidateQueries({ queryKey: ['advisor', 'recommendations'] });
      onDone?.(profile);
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not save your risk profile')),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!complete) return;
    submitMut.mutate({
      age: ageNum,
      horizon,
      drawdownReaction,
      investableShareOfIncome,
      objective,
      hasEmergencyFund: hasEmergencyFund === 'yes',
      taxSlab,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent-ink">
            <ShieldQuestion className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
              Step one
            </p>
            <CardTitle className="mt-1">
              {existing ? 'Retake your risk assessment' : 'Tell us how you invest'}
            </CardTitle>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              Seven questions. Your answers set the target allocation every recommendation is
              measured against — without them, advice would be a guess. Nothing here is shared
              outside your account.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={submit} className="space-y-5">
          <Question index={1} question="How old are you?" help="Age anchors how long your money can stay invested.">
            <div className="max-w-[180px]">
              <Label htmlFor="advisor-age" className="sr-only">
                Age
              </Label>
              <Input
                id="advisor-age"
                type="number"
                inputMode="numeric"
                min={18}
                max={100}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="e.g. 34"
                className="numeric"
              />
              {touched && !ageValid && (
                <p className="mt-1.5 text-[12px] text-negative">Enter an age between 18 and 100.</p>
              )}
            </div>
          </Question>

          <Question
            index={2}
            question="When will you need most of this money?"
            help="The longer the runway, the more short-term volatility you can afford to ignore."
          >
            <ChoiceGroup name="Investment horizon" choices={HORIZON_CHOICES} value={horizon} onChange={setHorizon} />
          </Question>

          <Question
            index={3}
            question="Your portfolio drops 20% in three months. What do you actually do?"
            help="Answer honestly — the plan only works if you can stick to it in a bad year."
          >
            <ChoiceGroup
              name="Drawdown reaction"
              choices={DRAWDOWN_CHOICES}
              value={drawdownReaction}
              onChange={setDrawdownReaction}
            />
          </Question>

          <Question
            index={4}
            question="Roughly what share of your take-home income do you invest each month?"
          >
            <ChoiceGroup
              name="Investable share of income"
              choices={INVESTABLE_CHOICES}
              value={investableShareOfIncome}
              onChange={setInvestableShare}
            />
          </Question>

          <Question index={5} question="What is this portfolio mainly for?">
            <ChoiceGroup name="Objective" choices={OBJECTIVE_CHOICES} value={objective} onChange={setObjective} />
          </Question>

          <Question
            index={6}
            question="Do you have an emergency fund you could live on for six months?"
            help="Without one, a market fall forces you to sell at the worst possible time — so we cap risk until it exists."
          >
            <ChoiceGroup
              name="Emergency fund"
              choices={EMERGENCY_CHOICES}
              value={hasEmergencyFund}
              onChange={setHasEmergencyFund}
            />
          </Question>

          <Question
            index={7}
            question="Which income-tax slab are you in?"
            help="This decides whether debt funds, arbitrage, or plain deposits are the cheaper route after tax."
          >
            <ChoiceGroup name="Tax slab" choices={TAX_SLAB_CHOICES} value={taxSlab} onChange={setTaxSlab} />
          </Question>

          <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-5">
            <Button type="submit" disabled={submitMut.isPending}>
              {submitMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {existing ? 'Save new profile' : 'Get my recommendations'}
            </Button>
            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={submitMut.isPending}>
                Cancel
              </Button>
            )}
            {touched && !complete && (
              <span className="text-[12.5px] text-muted-foreground">
                Answer every question to continue.
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
