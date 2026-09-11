/**
 * Surrender value for a savings policy (whole life, endowment, ULIP): the
 * insurer's quote, entered by the user, against the premiums recorded as
 * paid — money lost or kept — plus when a surrender would pay out and
 * IRDAI's rules on it, each with its source. Renders nothing for other
 * policy types.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Decimal,
  SURRENDER_RULES_CHECKED_ON,
  buildPremiumSchedule,
  compareSurrender,
  formatINR,
  hasSurrenderValue,
  surrenderRulesFor,
  surrenderTiming,
} from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Figure } from '@/components/receipt/Receipt';
import { apiErrorMessage } from '@/api/client';
import { insuranceApi, type InsurancePolicyDTO, type UpdatePolicyInput } from '@/api/insurance.api';
import { formatDay, plural, TONE_TEXT } from '@/lib/insurance';
import { SourceLink } from './SourceLink';

const MONEY = /^\d+(\.\d{1,2})?$/;
const inr = (v: string) => formatINR(v, { fractionDigits: 0 });

export function SurrenderValueCard({ policy, today }: { policy: InsurancePolicyDTO; today?: string }) {
  if (!hasSurrenderValue(policy.type)) return null;
  return <SurrenderValueBody policy={policy} today={today ?? new Date().toISOString().slice(0, 10)} />;
}

function SurrenderValueBody({ policy, today }: { policy: InsurancePolicyDTO; today: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(policy.surrenderValue ?? '');
  const [asOf, setAsOf] = useState(policy.surrenderValueAsOf?.slice(0, 10) ?? today);

  const history = useMemo(() => policy.premiumHistory ?? [], [policy.premiumHistory]);
  const paid = history.reduce((s, p) => s.plus(new Decimal(p.amount)), new Decimal(0)).toString();
  const untracked = useMemo(
    () =>
      buildPremiumSchedule(
        { startDate: policy.startDate, premiumFrequency: policy.premiumFrequency, maturityDate: policy.maturityDate },
        history,
        { today, untrackedBefore: policy.premiumsTrackedFrom },
      ).filter((r) => r.status === 'UNTRACKED').length,
    [policy.startDate, policy.premiumFrequency, policy.maturityDate, policy.premiumsTrackedFrom, history, today],
  );
  const comparison = policy.surrenderValue ? compareSurrender(paid, policy.surrenderValue) : null;
  const timing = surrenderTiming(policy, today);
  const rules = surrenderRulesFor(policy.type);

  const save = useMutation({
    mutationFn: (input: UpdatePolicyInput) => insuranceApi.updatePolicy(policy.id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insurance-policy', policy.id] });
      qc.invalidateQueries({ queryKey: ['insurance-policies'] });
      setEditing(false);
      toast.success('Surrender value saved');
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not save the surrender value')),
  });

  const submit = () => {
    const v = value.trim().replace(/,/g, '');
    if (!MONEY.test(v)) {
      toast.error('Enter the amount the insurer quoted, like 185000');
      return;
    }
    if (asOf > today) {
      toast.error('The quote can’t be dated in the future');
      return;
    }
    save.mutate({ surrenderValue: v, surrenderValueAsOf: asOf });
  };

  const outcome =
    comparison?.outcome === 'LOSS'
      ? { label: 'You’d lose', tone: TONE_TEXT.danger }
      : comparison?.outcome === 'GAIN'
        ? { label: 'You’d get back more by', tone: TONE_TEXT.ok }
        : { label: 'Difference', tone: TONE_TEXT.neutral };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <CardTitle className="font-display text-xl">Surrender value</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {policy.surrenderValue
              ? `As quoted by ${policy.insurer} on ${formatDay(policy.surrenderValueAsOf)}`
              : `Ask ${policy.insurer} for a surrender quote and note it here.`}
          </p>
        </div>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            {policy.surrenderValue ? 'Update quote' : 'Add quote'}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {editing && (
          <form
            className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor={`sv-${policy.id}`}>Quoted value (₹)</Label>
              <Input
                id={`sv-${policy.id}`}
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="185000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`sv-on-${policy.id}`}>Quoted on</Label>
              <Input id={`sv-on-${policy.id}`} type="date" max={today} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={save.isPending}>
                Save
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              {policy.surrenderValue && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-negative"
                  disabled={save.isPending}
                  onClick={() => save.mutate({ surrenderValue: null })}
                >
                  Remove
                </Button>
              )}
            </div>
          </form>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Figure label="Premiums recorded">{inr(paid)}</Figure>
          <Figure label="Surrender value">{policy.surrenderValue ? inr(policy.surrenderValue) : '—'}</Figure>
          {comparison && (
            <Figure
              label={outcome.label}
              className={outcome.tone}
              hint={comparison.percent ? `${comparison.percent}% of what you’ve paid` : undefined}
            >
              {inr(new Decimal(comparison.difference).abs().toString())}
              {comparison.percent && comparison.outcome !== 'EVEN' && (
                <span className="text-xs"> ({comparison.percent}%)</span>
              )}
            </Figure>
          )}
        </div>

        {untracked > 0 && (
          <p className="text-xs text-muted-foreground">
            {plural(untracked, 'earlier premium')} {untracked === 1 ? 'isn’t' : 'aren’t'} recorded here, so you’ve paid
            more than this shows.
          </p>
        )}

        {timing.state === 'ULIP_LOCK_IN' && (
          <p className={`text-sm ${TONE_TEXT.warn}`}>
            In its lock-in until {formatDay(timing.lockInEndsOn)}. Surrender now and the life cover stops; the money is
            paid out when the lock-in ends.
          </p>
        )}
        {timing.state === 'FIRST_YEAR' && (
          <p className={`text-sm ${TONE_TEXT.warn}`}>
            The special surrender value is payable from {formatDay(timing.payableFrom)}, once a full year’s premium is
            paid — sooner if premiums are payable for under 5 years.
          </p>
        )}

        <div className="border-t pt-3">
          <p className="mb-2 text-xs text-muted-foreground">Your rights when you surrender</p>
          <ul className="space-y-2">
            {rules.map((r) => (
              <li key={r.text} className="text-xs text-muted-foreground">
                {r.text} <SourceLink source={r.source} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Checked on {formatDay(SURRENDER_RULES_CHECKED_ON)}.</p>
        </div>
      </CardContent>
    </Card>
  );
}
