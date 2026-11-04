import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ChevronDown, Info, Loader2, Pencil, Plus, Trash2, TrendingUp } from 'lucide-react';
import {
  CPI_DIVISIONS,
  CPI_SECTOR_LABELS,
  Decimal,
  cpiDivisionLabel,
  cpiStateName,
  formatINR,
  type InflationItemInput,
  type InflationItemView,
  type PersonalInflationSummary,
} from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { apiErrorMessage } from '@/api/client';
import {
  personalInflationApi,
  PERSONAL_INFLATION_QUERY_KEY,
  PERSONAL_INFLATION_SOURCES_KEY,
} from '@/api/personalInflation.api';
import { cn } from '@/lib/cn';
import { BasketItemDialog } from './BasketItemDialog';
import { AddExpensePicker } from './AddExpensePicker';
import { DrivingCard } from './DrivingCard';
import { GoalImpactCard } from './GoalImpactCard';
import { InflationHero } from './InflationHero';
import { formatCpiMonth, formatRatePct } from './personalInflationView';

const SOURCE_LABEL: Record<InflationItemView['rateSource'], string> = {
  OFFICIAL: 'Official',
  CUSTOM: 'Your rate',
  HISTORY: 'Your history',
};

const NOTE_LABEL: Record<NonNullable<InflationItemView['rateNote']>, string> = {
  insufficient_history: 'Not enough price history yet, so the official rate is used',
  division_unavailable: 'No official figure for this category, so overall CPI is used',
};

const inr = (v: string | null | undefined) => (v == null ? '—' : formatINR(v, { fractionDigits: 0 }));

export function PersonalInflationPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<InflationItemView | null>(null);
  const [preset, setPreset] = useState<Partial<InflationItemInput> | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: PERSONAL_INFLATION_QUERY_KEY,
    queryFn: () => personalInflationApi.summary(),
  });

  const onFresh = (s: PersonalInflationSummary) => {
    qc.setQueryData(PERSONAL_INFLATION_QUERY_KEY, s);
    // Adding or removing an item changes which loans/policies show as already added.
    void qc.invalidateQueries({ queryKey: PERSONAL_INFLATION_SOURCES_KEY });
  };

  const profileMut = useMutation({
    mutationFn: personalInflationApi.setProfile,
    onSuccess: onFresh,
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const saveMut = useMutation({
    mutationFn: (input: InflationItemInput) =>
      editing ? personalInflationApi.updateItem(editing.id, input) : personalInflationApi.createItem(input),
    onSuccess: (s) => {
      onFresh(s);
      setDialogOpen(false);
      toast.success(editing ? 'Expense updated' : 'Expense added');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });
  const deleteMut = useMutation({
    mutationFn: personalInflationApi.deleteItem,
    onSuccess: (s) => {
      onFresh(s);
      toast.success('Expense removed');
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  });

  const openNew = () => setPickerOpen(true);
  const compose = (p: Partial<InflationItemInput> | null) => {
    setPickerOpen(false);
    setEditing(null);
    setPreset(p);
    setDialogOpen(true);
  };

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Goal suggestions move with the basket and the state; refetch them when either changes.
  const basketVersion = [data.asOf, data.personalRate, data.profile.stateCode, data.profile.sector,
    ...data.byDivision.map((d) => `${d.divisionCode}:${d.rate}`)].join('|');
  const headlineRate = data.official.find((o) => o.divisionCode === '00')?.longRunRate ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Planning"
        title="Personal inflation"
        description="How fast your own costs rise, from what you spend and the government's latest price data."
        actions={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Add expense
          </Button>
        }
      />

      <InflationHero data={data} saving={profileMut.isPending} onProfile={(p) => profileMut.mutate(p)} />

      <section className="rounded-xl border bg-card" aria-labelledby="pi-expenses">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 sm:px-6">
          <h2 id="pi-expenses" className="font-display text-2xl">Your expenses</h2>
          {data.items.length > 0 && (
            <p className="text-xs text-muted-foreground">Yearly cost now, and what it grows to</p>
          )}
        </div>
        {data.items.length === 0 ? (
          <div className="p-5 sm:p-6">
            <EmptyState
              icon={TrendingUp}
              title="No expenses yet"
              description="Add the costs that matter to you, such as a school fee, rent or groceries, or pick loans and premiums you already track here. Each one shows what it will cost in 1, 3, 5 and 10 years."
              action={<Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add expense</Button>}
            />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm min-w-[780px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2 pl-5 sm:pl-6 pr-3 font-normal">Expense</th>
                  <th className="py-2 px-3 font-normal text-right">Per year now</th>
                  <th className="py-2 px-3 font-normal text-right">Rises at</th>
                  {data.horizons.map((h) => (
                    <th key={h} className="py-2 px-3 font-normal text-right">In {h} yr</th>
                  ))}
                  <th className="py-2 pr-5 sm:pr-6"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it) => {
                  const hot = headlineRate != null && it.resolvedRate != null && new Decimal(it.resolvedRate).greaterThan(headlineRate);
                  const last = it.projections.length - 1;
                  return (
                    <tr key={it.id} className="group border-t align-top transition-colors hover:bg-muted/30">
                      <td className="py-3 pl-5 sm:pl-6 pr-3">
                        <div className="font-medium">{it.name}</div>
                        <div className="text-xs text-muted-foreground">{cpiDivisionLabel(it.divisionCode)}</div>
                        {it.notes && <div className="text-[11px] text-muted-foreground/80 mt-1 max-w-[280px] leading-snug">{it.notes}</div>}
                      </td>
                      <td className="py-3 px-3 text-right numeric">{inr(it.annualAmount)}</td>
                      <td className="py-3 px-3 text-right">
                        <div className={cn('numeric font-semibold', hot && 'text-warning')}>{formatRatePct(it.resolvedRate)}</div>
                        <div className="text-[11px] text-muted-foreground whitespace-nowrap">{SOURCE_LABEL[it.rateSource]}</div>
                        {it.rateNote && (
                          <div className="text-[11px] text-warning mt-0.5 max-w-[150px] ml-auto leading-snug">{NOTE_LABEL[it.rateNote]}</div>
                        )}
                        {it.historyRate && it.rateSource !== 'HISTORY' && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">History: {formatRatePct(it.historyRate)}</div>
                        )}
                      </td>
                      {it.projections.map((p, i) => (
                        <td key={i} className={cn('py-3 px-3 text-right numeric', i === last ? 'text-foreground' : 'text-muted-foreground')}>
                          {inr(p)}
                        </td>
                      ))}
                      <td className="py-2 pr-4 sm:pr-5 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" aria-label={`Edit ${it.name}`}
                          className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={() => { setEditing(it); setPreset(null); setDialogOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Remove ${it.name}`} disabled={deleteMut.isPending}
                          className="opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={() => deleteMut.mutate(it.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-foreground/25 bg-muted/60 font-semibold">
                  <th scope="row" className="py-3.5 pl-5 sm:pl-6 pr-3 text-left font-semibold">
                    Total
                    <div className="text-[11px] font-normal text-muted-foreground">
                      {data.items.length} {data.items.length === 1 ? 'expense' : 'expenses'}
                    </div>
                  </th>
                  <td className="py-3.5 px-3 text-right numeric">{inr(data.totals.annualAmount)}</td>
                  <td className="py-3.5 px-3 text-right">
                    <div className="numeric text-accent-ink">{formatRatePct(data.personalRate)}</div>
                    <div className="text-[11px] font-normal text-muted-foreground">Your rate</div>
                  </td>
                  {data.totals.projections.map((p, i) => (
                    <td key={i} className="py-3.5 px-3 text-right numeric">{inr(p)}</td>
                  ))}
                  <td className="pr-5 sm:pr-6" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        {data.asOf && (data.byDivision.length > 0 || data.fixedPayments) && <DrivingCard data={data} />}
        <GoalImpactCard basketVersion={basketVersion} />
      </div>

      <OfficialRatesCard data={data} />

      <AddExpensePicker open={pickerOpen} onOpenChange={setPickerOpen} onImported={onFresh} onCompose={compose} />

      <BasketItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        existing={editing}
        preset={preset}
        saving={saveMut.isPending}
        onSave={(input) => saveMut.mutate(input)}
      />
    </div>
  );
}

/** Reference table, folded away: the hero already shows the headline figure. */
function OfficialRatesCard({ data }: { data: PersonalInflationSummary }) {
  const asOf = formatCpiMonth(data.asOf);
  const rows = CPI_DIVISIONS.map((d) => ({ d, o: data.official.find((x) => x.divisionCode === d.code) }));
  const max = Decimal.max(
    new Decimal('0.01'),
    ...rows.map((r) => (r.o?.longRunRate ? new Decimal(r.o.longRunRate) : new Decimal(0))),
  );
  const barWidth = (rate: string | null | undefined) =>
    rate ? `${Decimal.max(0, new Decimal(rate)).dividedBy(max).times(100).toDecimalPlaces(1).toString()}%` : '0%';

  return (
    <details className="group rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-4 sm:px-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span>
          <span className="font-display text-xl">Official rates by category</span>
          <span className="block text-xs text-muted-foreground mt-0.5">
            {cpiStateName(data.profile.stateCode)}, {CPI_SECTOR_LABELS[data.profile.sector].toLowerCase()}
            {asOf && `, ${asOf}`}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t px-5 pb-5 sm:px-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-normal">Category</th>
              <th className="py-2 px-3 font-normal text-right">Latest year</th>
              <th className="py-2 pl-3 font-normal text-right">Yearly average (used)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ d, o }) => (
              <tr key={d.code} className={cn('border-t', d.code === '00' && 'font-medium')}>
                <td className="py-2.5 pr-3">
                  {d.shortLabel}
                  {o?.source === 'ALL_INDIA' && data.profile.stateCode !== 1 && (
                    <span className="text-[11px] text-muted-foreground ml-1">(All India)</span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-right numeric text-muted-foreground">{formatRatePct(o?.latestYoy, 2)}</td>
                <td className="py-2.5 pl-3 text-right">
                  <span className="inline-flex items-center gap-2">
                    <span className="hidden sm:block h-1 w-16 rounded-full bg-muted overflow-hidden" aria-hidden>
                      <span className="block h-full bg-muted-foreground/60" style={{ width: barWidth(o?.longRunRate) }} />
                    </span>
                    <span className="numeric">{formatRatePct(o?.longRunRate, 2)}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground mt-4 flex gap-1.5 leading-relaxed">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Projections use the yearly average: the same month&apos;s year-on-year change over up to 5 years, compounded.
            Years before 2026 come from MoSPI&apos;s older CPI series (base 2012), matched to today&apos;s categories as closely as
            that series allows. Past inflation is no guarantee of future prices.
          </span>
        </p>
      </div>
    </details>
  );
}
