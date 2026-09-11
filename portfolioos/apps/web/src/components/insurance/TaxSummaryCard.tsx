/**
 * What the premiums recorded in a financial year are worth at tax time —
 * life under section 123, health under section 126 (who each health policy
 * covers is set right here), and whether life payouts will be tax-free under
 * Schedule II. Worked out on the server by the shared buildTaxSummary; every
 * rule links to the Act.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  TAX_RULES,
  TAX_RULES_CHECKED_ON,
  formatINR,
  taxYearOf,
  type HealthLine,
  type TaxBucket,
} from '@portfolioos/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Figure } from '@/components/receipt/Receipt';
import { apiErrorMessage } from '@/api/client';
import { insuranceApi, type UpdatePolicyInput } from '@/api/insurance.api';
import { formatDay, policyTitle, TONE_TEXT } from '@/lib/insurance';
import { SourceLink } from './SourceLink';

const YEARS_SHOWN = 3;
const inr = (v: string) => formatINR(v, { fractionDigits: 0 });
const name = (l: { insurer: string; planName: string | null; type: string }) => `${l.insurer} — ${policyTitle(l)}`;

const BUCKET_LABEL: Record<TaxBucket, string> = {
  SELF_FAMILY: 'You, spouse and children',
  PARENTS: 'Your parents',
};

function yearsUpTo(current: string): string[] {
  const start = Number.parseInt(current.slice(0, 4), 10);
  return Array.from({ length: YEARS_SHOWN }, (_, i) => taxYearOf(`${start - i}-06-01`));
}

export function TaxSummaryCard({ today = new Date().toISOString().slice(0, 10) }: { today?: string }) {
  const qc = useQueryClient();
  const current = taxYearOf(today);
  const [fy, setFy] = useState(current);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['insurance-tax-summary', fy],
    queryFn: () => insuranceApi.taxSummary(fy),
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePolicyInput }) => insuranceApi.updatePolicy(id, input),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['insurance-tax-summary'] });
      qc.invalidateQueries({ queryKey: ['insurance-policies'] });
      qc.invalidateQueries({ queryKey: ['insurance-policy', id] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not save that')),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <CardTitle className="font-display text-xl">Tax on your premiums</CardTitle>
          {data && (
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDay(data.from)} – {formatDay(data.to)}
            </p>
          )}
        </div>
        <Select
          aria-label="Financial year"
          value={fy}
          onChange={(e) => setFy(e.target.value)}
          className="h-9 w-auto shrink-0"
        >
          {yearsUpTo(current).map((y) => (
            <option key={y} value={y}>
              FY {y}
            </option>
          ))}
        </Select>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
          <span className="text-foreground">Only if you choose the old regime.</span> The new regime is the default and
          allows none of these deductions. <SourceLink source={TAX_RULES.regime[1]!.source} />
        </p>

        {isLoading && <p className="text-sm text-muted-foreground">Working it out…</p>}
        {isError && <p className="text-sm text-negative">Couldn’t load the tax summary.</p>}

        {data && !data.covered && <p className="text-sm text-muted-foreground">{data.notCoveredReason}</p>}

        {data?.covered && (
          <>
            <section className="space-y-3">
              <h3 className="text-sm font-medium">Life insurance · section 123</h3>
              {data.life.lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No life premiums recorded in this year.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <Figure label="Counts towards it">{inr(data.life.total)}</Figure>
                    <Figure label="You can claim" className="text-positive">
                      {inr(data.life.claimable)}
                    </Figure>
                    <Figure label="Yearly limit" hint="Shared with PF, PPF, ELSS and the rest of Schedule XV">
                      {inr(data.life.limit)}
                    </Figure>
                  </div>
                  <ul className="space-y-1.5 text-sm">
                    {data.life.lines.map((l) => (
                      <li key={l.policyId} className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="min-w-0">{name(l)}</span>
                        <span className="tabular-nums">{inr(l.paid)}</span>
                        {l.capped && (
                          <span className={`w-full text-xs ${TONE_TEXT.warn}`}>
                            Only {inr(l.eligible)} counts — {l.capPercent}% of the sum assured.
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    The limit is shared with provident fund, PPF, ELSS and more. <SourceLink source={TAX_RULES.life[0]!.source} />
                  </p>
                </>
              )}
            </section>

            <section className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-medium">Health insurance · section 126</h3>
              {[data.health.selfFamily, data.health.parents].every((b) => b.lines.length === 0) &&
              data.health.unassigned.length === 0 ? (
                <p className="text-sm text-muted-foreground">No health premiums recorded in this year.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {[data.health.selfFamily, data.health.parents].map((b) => (
                      <Figure
                        key={b.bucket}
                        label={BUCKET_LABEL[b.bucket]}
                        hint={b.senior ? 'Senior citizen limit' : undefined}
                      >
                        {inr(b.claimable)} <span className="text-xs text-muted-foreground">of {inr(b.limit)}</span>
                      </Figure>
                    ))}
                    <Figure label="You can claim" className="text-positive">
                      {inr(data.health.claimable)}
                    </Figure>
                  </div>
                  {data.health.unassigned.length > 0 && (
                    <p className={`text-xs ${TONE_TEXT.warn}`}>Say who each policy covers to count it.</p>
                  )}
                  <ul className="space-y-3">
                    {[...data.health.unassigned, ...data.health.selfFamily.lines, ...data.health.parents.lines].map((l) => (
                      <HealthRow
                        key={l.policyId}
                        line={l}
                        saving={update.isPending}
                        onChange={(input) => update.mutate({ id: l.policyId, input })}
                      />
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Premiums paid in cash don’t count; a check-up of up to ₹5,000 can be, within these limits.{' '}
                    <SourceLink source={TAX_RULES.health[5]!.source} />
                  </p>
                </>
              )}
            </section>
          </>
        )}

        {data && data.maturity.length > 0 && (
          <section className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-medium">Tax-free payout · Schedule II</h3>
            <ul className="space-y-2 text-sm">
              {data.maturity.map((m) => (
                <li key={m.policyId}>
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="min-w-0">{name(m)}</span>
                    <span className={TONE_TEXT[m.verdict === 'LIKELY_EXEMPT' ? 'ok' : 'warn']}>
                      {m.verdict === 'LIKELY_EXEMPT' ? 'Likely tax-free' : 'May be taxable'}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.limitPercent === null
                      ? 'Issued before April 2003 — no premium condition applies.'
                      : `Yearly premium is ${m.ratioPercent}% of the sum assured (limit ${m.limitPercent}%).`}
                    {m.aggregateLimit && m.aggregatePremium && (
                      <>
                        {' '}
                        Policies like it recorded here total {inr(m.aggregatePremium)} a year (limit {inr(m.aggregateLimit)}).
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              A payout on death is always tax-free. <SourceLink source={TAX_RULES.maturity[0]!.source} />
            </p>
          </section>
        )}

        <details className="border-t pt-4 text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">The rules we used</summary>
          <ul className="mt-3 space-y-2">
            {[...TAX_RULES.regime, ...TAX_RULES.life, ...TAX_RULES.health, ...TAX_RULES.maturity].map((r) => (
              <li key={r.text} className="text-xs text-muted-foreground">
                {r.text} <SourceLink source={r.source} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Checked on {formatDay(TAX_RULES_CHECKED_ON)}, from premiums recorded here. Your return has the final say.
          </p>
        </details>
      </CardContent>
    </Card>
  );
}

function HealthRow({
  line,
  saving,
  onChange,
}: {
  line: HealthLine;
  saving: boolean;
  onChange: (input: UpdatePolicyInput) => void;
}) {
  const label = name(line);
  return (
    <li className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate">{label}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {inr(line.paid)}
          {line.spread && ' — this year’s share of a premium paid for several years'}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Select
          aria-label={`Who ${label} covers`}
          value={line.taxBucket ?? ''}
          disabled={saving}
          onChange={(e) => onChange({ taxBucket: (e.target.value || null) as TaxBucket | null })}
          className="h-9 w-auto"
        >
          <option value="">Not set</option>
          <option value="SELF_FAMILY">{BUCKET_LABEL.SELF_FAMILY}</option>
          <option value="PARENTS">{BUCKET_LABEL.PARENTS}</option>
        </Select>
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={line.seniorCitizen === true}
            disabled={saving}
            onChange={(e) => onChange({ seniorCitizen: e.target.checked })}
            className="h-4 w-4 accent-[hsl(var(--accent))]"
          />
          Senior citizen (60+)
        </label>
      </div>
    </li>
  );
}
