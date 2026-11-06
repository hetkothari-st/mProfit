import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, Landmark, Loader2, X } from 'lucide-react';
import {
  BASKET_CATEGORIES,
  EXCLUDED_CATEGORIES,
  SPEND_CATEGORY_LABELS,
  Decimal,
  formatINR,
  type PersonalInflationSummary,
  type PirBankView,
  type SpendCategory,
} from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { apiErrorMessage } from '@/api/client';
import {
  personalInflationApi,
  PERSONAL_INFLATION_GOALS_KEY,
  PERSONAL_INFLATION_QUERY_KEY,
  UNCATEGORISED_PAYEES_KEY,
} from '@/api/personalInflation.api';
import { cn } from '@/lib/cn';
import { formatRatePct, methodLabel } from './personalInflationView';

const pct = (v: string) => `${new Decimal(v).times(100).toDecimalPlaces(0).toString()}%`;
const label = (c: string) => SPEND_CATEGORY_LABELS[c as SpendCategory] ?? c;
/** Payee keys are lower-cased for matching; show them as a name. */
const payeeName = (k: string) => k.replace(/(^|\s)(\p{L})/gu, (_m, sp: string, ch: string) => sp + ch.toUpperCase());

/**
 * Bank spending on the Personal Inflation page: the consent notice, then
 * either "building your picture" (what is still missing) or the categories
 * the rate now uses, plus the questions only the user can answer (big jumps,
 * unsorted payees). Every answer returns the fresh summary.
 */
export function BankSpendingCard({ data }: { data: PersonalInflationSummary }) {
  const qc = useQueryClient();
  const consent = data.spendingConsent;
  const onFresh = (s: PersonalInflationSummary) => {
    qc.setQueryData(PERSONAL_INFLATION_QUERY_KEY, s);
    void qc.invalidateQueries({ queryKey: PERSONAL_INFLATION_GOALS_KEY });
    void qc.invalidateQueries({ queryKey: UNCATEGORISED_PAYEES_KEY });
  };

  if (!consent.given) {
    return consent.askNow ? <ConsentNotice data={data} onFresh={onFresh} /> : null;
  }
  return <BankPicture data={data} bank={data.bank} onFresh={onFresh} />;
}

function ConsentNotice({ data, onFresh }: { data: PersonalInflationSummary; onFresh: (s: PersonalInflationSummary) => void }) {
  const [agree, setAgree] = useState(false);
  const c = data.spendingConsent;
  const mut = useMutation({
    mutationFn: () => personalInflationApi.giveSpendingConsent(c.version),
    onSuccess: (s) => {
      onFresh(s);
      toast.success('Reading your bank spending. This takes a minute or two.');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="pi-consent">
      <div className="flex items-start gap-3">
        <Landmark className="h-5 w-5 mt-1 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 space-y-3 text-sm leading-relaxed">
          <h2 id="pi-consent" className="font-display text-xl">Use your bank spending to work out your own inflation</h2>
          <p>
            To show how fast <em>your</em> costs are rising, EveryPaisa can read the transactions in the bank alert
            emails from senders you&apos;ve chosen in Email ingestion, and in statements you upload.
          </p>
          <p>
            <strong>What we use:</strong> the date, amount, payee and description of each transaction, only to sort
            your spending into categories, work out your personal inflation rate and Safe to Invest amount, and plan
            your goals.
          </p>
          <p>
            <strong>What we keep:</strong> the categorised transactions and monthly totals, until you turn this off or
            delete your account. Uploaded files are deleted once they are read. A statement password is kept only if you choose to save it, and is stored encrypted.
          </p>
          <p>
            <strong>Automated reading:</strong> payees we can&apos;t place ourselves are sorted by an AI model
            (Anthropic), with your name, PAN, account and card numbers masked first.
            {c.aiZeroRetention && ' The provider does not keep or train on this data.'}
          </p>
          <p>
            <strong>Your choices:</strong> correct any category, or turn this off here at any time. Turning it off stops
            the reading and deletes what was worked out from it. Your typed expenses are never changed.
            {c.grievanceContact && <> Questions or complaints: {c.grievanceContact}, under the Digital Personal Data Protection Act, 2023.</>}
          </p>
          <label className="flex items-start gap-2 pt-1 cursor-pointer">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I agree to EveryPaisa using my bank alert emails and statements for these purposes.</span>
          </label>
          <Button disabled={!agree || mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Agree and continue
          </Button>
        </div>
      </div>
    </section>
  );
}

function BankPicture({ data, bank, onFresh }: { data: PersonalInflationSummary; bank: PirBankView | null; onFresh: (s: PersonalInflationSummary) => void }) {
  const [confirmOff, setConfirmOff] = useState(false);
  const offMut = useMutation({
    mutationFn: () => personalInflationApi.withdrawSpendingConsent(),
    onSuccess: (s) => {
      onFresh(s);
      setConfirmOff(false);
      toast.success('Turned off. Bank spending data deleted.');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const stepMut = useMutation({
    mutationFn: (a: { seriesId: string; realRise: boolean }) => personalInflationApi.answerStepChange(a.seriesId, a.realRise),
    onSuccess: onFresh,
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const ready = bank?.state === 'ready';
  return (
    <section className="rounded-xl border bg-card" aria-labelledby="pi-bank">
      <div className="px-5 pt-5 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="pi-bank" className="font-display text-2xl">{ready ? 'From your bank spending' : 'Building your picture'}</h2>
          {bank && (
            <p className="text-xs text-muted-foreground">
              Confidence <span className="numeric">{pct(bank.confidence)}</span> · needs {pct(bank.minConfidence)}
            </p>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {!bank
            ? 'No bank spending in the last 12 months yet. New alerts are read every night.'
            : ready
              ? `Your rate uses ${bank.monthsOfHistory} months of bank spending, plus expenses you added that the bank doesn't show.`
              : bank.state === 'low_confidence'
                ? "Not enough bank data yet, so your rate still comes from the expenses you've added."
                : "Not enough bank data yet to work out your rate. Here's what's missing."}
        </p>
      </div>

      {bank && !ready && <Missing bank={bank} />}

      {bank && bank.stepChanges.length > 0 && (
        <div className="mx-5 mt-4 space-y-2 sm:mx-6">
          {bank.stepChanges.map((s) => (
            <div key={s.seriesId} className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
              <p>
                Your <strong>{label(s.category).toLowerCase()}</strong> payment to <strong>{payeeName(s.payeeKey)}</strong> changed by{' '}
                <span className="numeric">{formatRatePct(s.rate)}</span> from last year. Did you move home or change school?
              </p>
              <p className="text-xs text-muted-foreground mt-1">Until you answer, this uses the official rate instead of your own.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={stepMut.isPending}
                  onClick={() => stepMut.mutate({ seriesId: s.seriesId, realRise: false })}>
                  Yes, I moved or changed
                </Button>
                <Button size="sm" variant="outline" disabled={stepMut.isPending}
                  onClick={() => stepMut.mutate({ seriesId: s.seriesId, realRise: true })}>
                  No, the price went up
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {ready && bank && (
        <ul className="mt-4 divide-y border-t">
          {bank.categories.map((c) => (
            <li key={c.category} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm sm:px-6">
              <span className="min-w-0">
                <span className="font-medium">{label(c.category)}</span>
                <span className="text-muted-foreground"> · {pct(c.share)} of spending</span>
              </span>
              <span className="flex items-center gap-2 whitespace-nowrap">
                <SourceChip method={c.method} />
                <span className="numeric font-semibold w-14 text-right">{formatRatePct(c.rate)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {bank?.cashHeavy && (
        <p className="mx-5 mt-3 text-xs text-muted-foreground sm:mx-6">
          A lot of your spending is cash withdrawals, which the bank can&apos;t break down, so your rate may miss some costs.
          Add big cash costs (a cook, rent paid in cash) as expenses.
        </p>
      )}
      {bank?.cardBillsCounted && (
        <p className="mx-5 mt-2 text-xs text-muted-foreground sm:mx-6">
          Card bills count as &ldquo;Other spending&rdquo; because we can&apos;t see what the card was used for.
        </p>
      )}

      <PayeePrompt onFresh={onFresh} />

      <div className="mt-4 border-t px-5 py-3 sm:px-6 text-xs text-muted-foreground flex flex-wrap items-center gap-2">
        {confirmOff ? (
          <>
            <span>Stop reading bank spending and delete what was worked out from it?</span>
            <Button size="sm" variant="destructive" disabled={offMut.isPending} onClick={() => offMut.mutate()}>Turn off and delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmOff(false)}>Keep it</Button>
          </>
        ) : (
          <>
            <span>You agreed {data.spendingConsent.givenAt ? new Date(data.spendingConsent.givenAt).toLocaleDateString('en-IN') : ''}.</span>
            <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setConfirmOff(true)}>
              Turn off
            </button>
          </>
        )}
      </div>
    </section>
  );
}

export function SourceChip({ method }: { method: 'cpi' | 'own_price' | 'blend' }) {
  return (
    <span className={cn(
      'rounded-full border px-2 py-0.5 text-[11px]',
      method === 'cpi' ? 'text-muted-foreground' : 'border-accent-ink/30 text-accent-ink',
    )}>
      {methodLabel(method)}
    </span>
  );
}

function Missing({ bank }: { bank: PirBankView }) {
  const rows = [
    { ok: bank.monthsOfHistory >= bank.windowMonths, text: `${bank.monthsOfHistory} of ${bank.windowMonths} months of spending` },
    { ok: new Decimal(bank.categorisedShare).greaterThanOrEqualTo('0.9'), text: `${pct(bank.categorisedShare)} of spending sorted into categories` },
    { ok: new Decimal(bank.accountCoverage).greaterThanOrEqualTo(1), text: new Decimal(bank.accountCoverage).greaterThanOrEqualTo(1) ? 'Salary account seen' : 'No salary credits seen yet: add the bank your salary comes into in Email ingestion' },
  ];
  return (
    <ul className="mx-5 mt-3 space-y-1.5 text-sm sm:mx-6">
      {rows.map((r) => (
        <li key={r.text} className="flex items-start gap-2">
          {r.ok
            ? <Check className="h-4 w-4 mt-0.5 shrink-0 text-positive" aria-label="Done" />
            : <X className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" aria-label="Missing" />}
          <span className={cn(!r.ok && 'text-muted-foreground')}>{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

const TAG_CHOICES = [...BASKET_CATEGORIES, ...EXCLUDED_CATEGORIES];

/** Spec §5: ask the user to sort the top five unsorted payees by money spent. */
function PayeePrompt({ onFresh }: { onFresh: (s: PersonalInflationSummary) => void }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const { data: payees } = useQuery({
    queryKey: UNCATEGORISED_PAYEES_KEY,
    queryFn: () => personalInflationApi.uncategorisedPayees(),
  });
  const mut = useMutation({
    mutationFn: (a: { payeeKey: string; category: string }) => personalInflationApi.tagPayee(a.payeeKey, a.category),
    onSuccess: async (r) => {
      qc.setQueryData(UNCATEGORISED_PAYEES_KEY, r.uncategorised);
      onFresh(await personalInflationApi.summary());
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  if (!payees || payees.length === 0) return null;
  return (
    <div className="mx-5 mt-4 sm:mx-6">
      <h3 className="text-sm font-medium">Help sort these payees</h3>
      <p className="text-xs text-muted-foreground">Your biggest unsorted payments this year. Each answer applies to every payment to that payee.</p>
      <ul className="mt-2 divide-y">
        {payees.map((p) => (
          <li key={p.payeeKey} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="min-w-0">
              <span className="font-medium break-words">{p.label}</span>
              <span className="text-muted-foreground"> · {p.count} {p.count === 1 ? 'payment' : 'payments'}, <span className="numeric">{formatINR(p.total, { fractionDigits: 0 })}</span></span>
            </span>
            <span className="flex items-center gap-2">
              <Select aria-label={`Category for ${p.label}`} className="h-9 w-48 py-1" value={picked[p.payeeKey] ?? ''}
                onChange={(e) => setPicked((s) => ({ ...s, [p.payeeKey]: e.target.value }))}>
                <option value="" disabled>Pick a category</option>
                {TAG_CHOICES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
              </Select>
              <Button size="sm" disabled={!picked[p.payeeKey] || mut.isPending}
                onClick={() => mut.mutate({ payeeKey: p.payeeKey, category: picked[p.payeeKey]! })}>
                Save
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
