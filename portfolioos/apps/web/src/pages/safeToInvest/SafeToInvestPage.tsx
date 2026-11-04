import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, ChevronDown, Loader2, Pencil, RotateCcw } from 'lucide-react';
import { Decimal, type SafeToInvestMonthView, type SafeToInvestSummary } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { apiErrorMessage } from '@/api/client';
import { safeToInvestApi, SAFE_TO_INVEST_QUERY_KEY } from '@/api/safeToInvest.api';
import { cn } from '@/lib/cn';
import { InflowChart } from './InflowChart';
import { MonthDialog } from './MonthDialog';
import { STABILITY_TEXT, TOP_UP_SHARES, lakh, monthLabel, rupees, sipAdvice } from './safeToInvestView';

const MONEY_RE = /^\d+(\.\d{1,2})?$/;

export function SafeToInvestPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: SAFE_TO_INVEST_QUERY_KEY,
    queryFn: () => safeToInvestApi.summary(),
  });
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const onFresh = (s: SafeToInvestSummary) => qc.setQueryData(SAFE_TO_INVEST_QUERY_KEY, s);

  const planMut = useMutation({
    mutationFn: safeToInvestApi.updatePlan,
    onSuccess: onFresh,
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const saveMut = useMutation({
    mutationFn: safeToInvestApi.savePlan,
    onSuccess: (s) => {
      onFresh(s);
      toast.success(`Saved ${rupees(s.plan.savedAmount)} a month as your SIP plan`);
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const month: SafeToInvestMonthView | null = data.months.find((m) => m.month === pickedMonth) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Planning"
        title="Safe to invest"
        description="A monthly SIP sized on your leanest normal month, so you never have to pause it."
      />

      <Hero data={data} saving={saveMut.isPending} onSave={() => saveMut.mutate()} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start">
        <section className="rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="sti-income">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="sti-income" className="font-display text-2xl">Your income, last 12 months</h2>
              <p className="text-xs text-muted-foreground mt-1">
                From your bank alerts. Click a month to see its credits or type its total.
              </p>
            </div>
            <StabilityMeter data={data} />
          </div>
          <DataNotice data={data} />
          {data.monthsUsed === 0 ? (
            <NoBankData data={data} onPickMonth={setPickedMonth} />
          ) : (
            <>
              <div className="mt-4">
                <InflowChart data={data} onPickMonth={setPickedMonth} />
              </div>
              <Legend data={data} />
            </>
          )}
        </section>

        <div className="space-y-6">
          <Working data={data} saving={planMut.isPending} onBuffer={(v) => planMut.mutate({ bufferOverride: v })} />
          <ThisMonth data={data} saving={planMut.isPending} onShare={(v) => planMut.mutate({ topUpShare: v })} />
        </div>
      </div>

      <MonthDialog month={month} onClose={() => setPickedMonth(null)} onFresh={onFresh} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Hero({ data, saving, onSave }: { data: SafeToInvestSummary; saving: boolean; onSave: () => void }) {
  const advice = sipAdvice(data);
  const savedMatches = data.plan.savedAmount && data.safeAmount && new Decimal(data.plan.savedAmount).equals(data.safeAmount);

  const basisText =
    data.basis === 'BANK'
      ? `Based on ${data.monthsUsed} months of your bank credits.`
      : data.basis !== 'DECLARED'
        ? ''
        : data.monthsUsed === 0
          ? 'Based on the income you declared, trimmed for safety. There is no bank data yet, so this is an estimate; see below for how to add it.'
          : `Based on the income you declared, trimmed for safety: ${data.monthsUsed} ${data.monthsUsed === 1 ? 'month' : 'months'} of bank data is not enough yet (6 needed).`;

  return (
    <section className="rounded-xl border bg-card p-5 sm:p-7 reveal" aria-label="Your safe-to-invest amount">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">You can safely invest</h2>
      {data.safeAmount ? (
        <>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span className="font-display numeric text-[clamp(52px,13vw,84px)] leading-none tracking-[-0.02em] text-positive">
              {rupees(data.safeAmount)}
            </span>
            <span className="text-lg text-muted-foreground">a month</span>
          </p>
          <p className="mt-3 text-sm text-muted-foreground max-w-2xl">{basisText}</p>
          {advice.tone !== 'none' && (
            <p
              className={cn(
                'mt-4 max-w-2xl rounded-lg border px-4 py-3 text-sm leading-relaxed',
                advice.tone === 'over' ? 'border-warning/40 bg-warning/10' : 'border-positive/30 bg-positive/10',
              )}
            >
              {advice.text}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {savedMatches ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-positive">
                <Check className="h-4 w-4" /> Saved as your SIP plan
              </span>
            ) : (
              <Button onClick={onSave} disabled={saving}>
                {saving ? 'Saving…' : `Save ${rupees(data.safeAmount)} as my SIP plan`}
              </Button>
            )}
            {data.plan.savedAmount && !savedMatches && (
              <span className="text-xs text-muted-foreground">
                Your saved plan is {rupees(data.plan.savedAmount)}; your numbers have changed since.
              </span>
            )}
          </div>
        </>
      ) : (
        <div className="mt-2 max-w-2xl">
          <p className="font-display text-[clamp(22px,5vw,30px)] leading-[1.15]">We need your income to size a safe SIP.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Add your income on the <Link to="/income" className="underline">Income page</Link>, connect Gmail so bank alerts come in,
            or type what you earned for past months below.
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * No bank data at all: say exactly which step is missing instead of drawing
 * twelve empty months. Months can still be typed in by hand.
 */
function NoBankData({ data, onPickMonth }: { data: SafeToInvestSummary; onPickMonth: (m: string) => void }) {
  const s = data.dataStatus;
  const steps = [
    {
      done: s.gmailConnected,
      title: s.gmailConnected ? 'Gmail is connected' : 'Connect Gmail',
      body: 'Your bank emails a short alert for every credit and debit. We read those.',
      link: s.gmailConnected ? null : { to: '/ingestion', label: 'Connect Gmail' },
    },
    {
      done: s.monitoredSenders > 0,
      title: s.monitoredSenders > 0
        ? `${s.monitoredSenders} ${s.monitoredSenders === 1 ? 'sender is' : 'senders are'} being watched`
        : "Add your bank's alert address",
      body: s.monitoredSenders > 0
        ? 'Make sure your bank is one of them, e.g. alerts@hdfcbank.net. Up to 2 years of its alerts are fetched in the background.'
        : 'Nothing is fetched until you pick senders. Scan your inbox and choose your bank, e.g. alerts@hdfcbank.net. Up to 2 years of its alerts are then fetched.',
      link: { to: '/ingestion', label: s.monitoredSenders > 0 ? 'Check senders' : 'Add senders' },
    },
    {
      done: s.monitoredSenders > 0 && s.awaitingReview === 0,
      title: s.awaitingReview > 0 ? `Approve ${s.awaitingReview} bank alerts` : 'Approve the alerts',
      body: 'Alerts from a new sender wait for your approval before they count. You can approve all from one sender at once.',
      link: { to: '/ingestion/review', label: 'Open review' },
    },
  ];
  // Months a user may type: the twelve on the chart, newest first.
  const months = [...data.months].reverse();

  return (
    <div className="mt-5 space-y-5">
      <ol className="space-y-3">
        {steps.map((st, i) => (
          <li key={st.title} className="flex gap-3">
            <span
              className={cn(
                'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                st.done ? 'bg-positive/20 text-positive' : 'bg-muted text-foreground',
              )}
            >
              {st.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <div className="min-w-0 text-sm">
              <div className="font-medium">{st.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{st.body}</div>
              {st.link && !st.done && (
                <Link to={st.link.to} className="mt-1 inline-block text-xs font-medium text-accent-ink underline">
                  {st.link.label}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="border-t pt-4">
        <p className="text-xs text-muted-foreground">Or type what you earned, month by month:</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {months.map((m) => (
            <Button key={m.month} type="button" variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => onPickMonth(m.month)}>
              {monthLabel(m.month, true)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Bank data exists but some of it is not counted yet. */
function DataNotice({ data }: { data: SafeToInvestSummary }) {
  const { awaitingReview, overBudget } = data.dataStatus;
  if (data.monthsUsed === 0 || (awaitingReview === 0 && overBudget === 0)) return null;
  return (
    <div className="mt-4 space-y-1 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed">
      {awaitingReview > 0 && (
        <p>
          {awaitingReview} bank {awaitingReview === 1 ? 'alert is' : 'alerts are'} waiting for your approval and not counted yet.{' '}
          <Link to="/ingestion/review" className="underline font-medium">Review them</Link>
        </p>
      )}
      {overBudget > 0 && (
        <p>
          {overBudget} {overBudget === 1 ? 'email was' : 'emails were'} set aside unread because this month&apos;s reading budget ran out.
          They are read when it resets.
        </p>
      )}
    </div>
  );
}

function StabilityMeter({ data }: { data: SafeToInvestSummary }) {
  if (data.stabilityScore === null || !data.stabilityLabel) {
    return <p className="text-xs text-muted-foreground sm:max-w-[180px] sm:text-right">Stability score shows after 6 months of data.</p>;
  }
  const tone = data.stabilityLabel === 'STABLE' ? 'bg-positive' : data.stabilityLabel === 'VARIABLE' ? 'bg-warning' : 'bg-primary';
  return (
    <div className="w-full sm:w-auto sm:min-w-[170px] sm:text-right">
      <div className="text-xs text-muted-foreground">Income stability</div>
      <div className="numeric text-2xl font-semibold leading-tight">
        {data.stabilityScore}
        <span className="text-sm font-normal text-muted-foreground"> / 100</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden" aria-hidden>
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${data.stabilityScore}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{STABILITY_TEXT[data.stabilityLabel]}</div>
    </div>
  );
}

function Legend({ data }: { data: SafeToInvestSummary }) {
  const gaps = data.months.filter((m) => m.source === 'GAP').length;
  return (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/55" /> Income</span>
      {data.basis === 'BANK' && (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-warning" /> Lean month {lakh(data.leanInflow)}
          </span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-warning" /> Below it</span>
        </>
      )}
      {gaps > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-muted-foreground" /> No data ({gaps}), left out of the maths
        </span>
      )}
    </div>
  );
}

function Working({ data, saving, onBuffer }: { data: SafeToInvestSummary; saving: boolean; onBuffer: (v: string | null) => void }) {
  const [showFixed, setShowFixed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  if (!data.leanInflow) return null;

  const leanNote =
    data.basis === 'BANK'
      ? `Your 20th-percentile month: 1 in 5 months brings in less`
      : 'Your declared income, trimmed for safety';
  const bufferNote =
    data.buffer.source === 'OVERRIDE'
      ? 'Set by you'
      : data.buffer.source === 'DEBITS'
        ? 'A heavy-but-normal month of card and UPI spending'
        : 'Estimated at 30% of your lean month until there is spending data';

  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="sti-working">
      <h2 id="sti-working" className="font-display text-2xl">The working</h2>
      <dl className="mt-4 text-sm">
        <div className="flex items-baseline justify-between gap-3 py-2">
          <dt>
            Lean-month income
            <span className="block text-[11px] text-muted-foreground">{leanNote}</span>
          </dt>
          <dd className="numeric font-medium">{rupees(data.leanInflow)}</dd>
        </div>

        <div className="border-t py-2">
          <div className="flex items-baseline justify-between gap-3">
            <dt>
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-foreground"
                aria-expanded={showFixed}
                onClick={() => setShowFixed(!showFixed)}
              >
                − Fixed costs
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showFixed && 'rotate-180')} />
              </button>
              <span className="block text-[11px] text-muted-foreground">
                {data.fixed.items.length} {data.fixed.items.length === 1 ? 'item' : 'items'}: EMIs, premiums, maintenance and fixed expenses
              </span>
            </dt>
            <dd className="numeric font-medium">{rupees(data.fixed.total)}</dd>
          </div>
          {showFixed && (
            <ul className="mt-2 space-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs">
              {data.fixed.items.length === 0 && <li className="text-muted-foreground">None recorded.</li>}
              {data.fixed.items.map((i) => (
                <li key={`${i.kind}-${i.label}`} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{i.label}</span>
                  <span className="numeric shrink-0">{rupees(i.monthly)}</span>
                </li>
              ))}
              <li className="pt-1 text-muted-foreground">
                Rent or school fees missing? Mark them as fixed on <Link to="/personal-inflation" className="underline">Personal inflation</Link>.
              </li>
            </ul>
          )}
        </div>

        <div className="border-t py-2">
          <div className="flex items-baseline justify-between gap-3">
            <dt>
              − Everyday spending buffer
              <span className="block text-[11px] text-muted-foreground">{bufferNote}</span>
            </dt>
            <dd className="flex items-center gap-1">
              <span className="numeric font-medium">{rupees(data.buffer.monthly)}</span>
              {!editing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="Change the spending buffer"
                  onClick={() => { setDraft(new Decimal(data.buffer.monthly).toFixed(0)); setEditing(true); }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </dd>
          </div>
          {data.buffer.source === 'ESTIMATE' && !editing && (
            <div className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed">
              This is a guess: 30% of your lean month, because there is no spending data yet. Your real monthly spend on
              groceries, shopping and eating out makes the amount far more accurate.{' '}
              <button
                type="button"
                className="font-medium underline"
                onClick={() => { setDraft(''); setEditing(true); }}
              >
                Type your monthly spend
              </button>
            </div>
          )}
          {editing && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                aria-label="Monthly spending buffer in rupees"
                inputMode="decimal"
                className="h-9 w-36"
                value={draft}
                onChange={(e) => setDraft(e.target.value.replace(/[,\s₹]/g, ''))}
              />
              <Button size="sm" disabled={!MONEY_RE.test(draft) || saving} onClick={() => { onBuffer(draft); setEditing(false); }}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              {data.buffer.source === 'OVERRIDE' && (
                <Button size="sm" variant="ghost" onClick={() => { onBuffer(null); setEditing(false); }}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Work it out for me
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-baseline justify-between gap-3 border-t-2 border-foreground/25 pt-3 mt-1">
          <dt className="font-semibold">= Safe to invest</dt>
          <dd className="numeric text-lg font-semibold text-positive">{rupees(data.safeAmount)}</dd>
        </div>
      </dl>
    </section>
  );
}

function ThisMonth({ data, saving, onShare }: { data: SafeToInvestSummary; saving: boolean; onShare: (v: string) => void }) {
  if (!data.leanInflow) return null;
  const surplus = new Decimal(data.thisMonth.surplus);
  const name = monthLabel(data.thisMonth.month, true);
  return (
    <section className="rounded-xl border bg-card p-5 sm:p-6" aria-labelledby="sti-month">
      <h2 id="sti-month" className="font-display text-2xl">Good-month top-up</h2>
      <p className="mt-3 text-sm leading-relaxed">
        {name} so far: <span className="numeric font-medium">{rupees(data.thisMonth.inflowSoFar)}</span> in.
        {surplus.greaterThan(0) ? (
          <>
            {' '}That&apos;s <span className="numeric">{lakh(surplus)}</span> above your lean month, so top up{' '}
            <span className="numeric font-semibold text-positive">{rupees(data.thisMonth.topUp)}</span> on top of your SIP.
          </>
        ) : (
          <> Not above your lean month yet, so just the regular SIP this month.</>
        )}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="sti-share" className="text-muted-foreground">In a good month, invest</label>
        <Select
          id="sti-share"
          className="h-9 w-24"
          value={data.plan.topUpShare}
          disabled={saving}
          onChange={(e) => onShare(e.target.value)}
        >
          {TOP_UP_SHARES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <span className="text-muted-foreground">of the extra.</span>
      </div>
    </section>
  );
}
