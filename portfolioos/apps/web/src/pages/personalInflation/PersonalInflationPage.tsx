import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Pencil, Plus, Trash2, TrendingUp, Info } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  CPI_DIVISIONS,
  CPI_SECTORS,
  CPI_SECTOR_LABELS,
  CPI_STATES,
  Decimal,
  cpiDivisionLabel,
  cpiStateName,
  formatINR,
  type CpiSector,
  type InflationItemInput,
  type InflationItemView,
  type PersonalInflationSummary,
} from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/common/EmptyState';
import { apiErrorMessage } from '@/api/client';
import { personalInflationApi, PERSONAL_INFLATION_QUERY_KEY } from '@/api/personalInflation.api';
import { BasketItemDialog } from './BasketItemDialog';
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

  const { data, isLoading } = useQuery({
    queryKey: PERSONAL_INFLATION_QUERY_KEY,
    queryFn: () => personalInflationApi.summary(),
  });

  const onFresh = (s: PersonalInflationSummary) => qc.setQueryData(PERSONAL_INFLATION_QUERY_KEY, s);

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

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const headline = data.official.find((o) => o.divisionCode === '00');
  const asOf = formatCpiMonth(data.asOf);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Personal inflation"
        description="Your own inflation rate, worked out from what you spend and the government's latest price data."
        actions={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Add expense
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6 grid gap-4 sm:grid-cols-[1fr_1fr_2fr] items-end">
          <div>
            <Label htmlFor="pi-state">Where you live</Label>
            <Select id="pi-state" className="mt-1" value={data.profile.stateCode} disabled={profileMut.isPending}
              onChange={(e) => profileMut.mutate({ stateCode: Number.parseInt(e.target.value, 10), sector: data.profile.sector })}>
              {CPI_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="pi-sector">Area</Label>
            <Select id="pi-sector" className="mt-1" value={data.profile.sector} disabled={profileMut.isPending}
              onChange={(e) => profileMut.mutate({ stateCode: data.profile.stateCode, sector: e.target.value as CpiSector })}>
              {CPI_SECTORS.map((s) => <option key={s} value={s}>{CPI_SECTOR_LABELS[s]}</option>)}
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            {asOf
              ? <>Official figures: Consumer Price Index, Ministry of Statistics (MoSPI), latest month <strong>{asOf}</strong>. Checked daily.</>
              : <>Official figures haven&apos;t loaded yet. The app checks the Ministry of Statistics (MoSPI) every day at 7:00 IST.</>}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Your inflation rate"
          value={formatRatePct(data.personalRate)}
          hint={data.items.length ? 'Weighted by what you spend in each category' : 'Add expenses to see your own rate'}
        />
        <StatCard
          label={`Official CPI, ${cpiStateName(data.profile.stateCode)}`}
          value={formatRatePct(headline?.longRunRate)}
          hint={headline?.longRunRate ? `Yearly average over ${headline.yearsUsed} yr · latest ${formatRatePct(headline.latestYoy)}` : '—'}
        />
        <StatCard
          label="Your yearly spend → next year"
          value={data.items.length ? `${inr(data.totals.annualAmount)} → ${inr(data.totals.projections[0])}` : '—'}
          hint={data.items.length ? `In ${data.horizons.at(-1)} years: ${inr(data.totals.projections.at(-1))}` : 'Add expenses to project costs'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {data.items.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No expenses yet"
              description="Add the costs that matter to you, such as a school fee, rent or groceries. For each one we show what it will cost in 1, 3, 5 and 10 years."
              action={<Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add expense</Button>}
            />
          ) : (
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 px-2 font-medium">Expense</th>
                    <th className="py-2 px-2 font-medium text-right">Per year now</th>
                    <th className="py-2 px-2 font-medium text-right">Rises at</th>
                    {data.horizons.map((h) => (
                      <th key={h} className="py-2 px-2 font-medium text-right">In {h} yr</th>
                    ))}
                    <th className="py-2 px-2" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it) => (
                    <tr key={it.id} className="border-b last:border-0 align-top">
                      <td className="py-2 px-2">
                        <div className="font-medium">{it.name}</div>
                        <div className="text-xs text-muted-foreground">{cpiDivisionLabel(it.divisionCode)}</div>
                      </td>
                      <td className="py-2 px-2 text-right numeric">{inr(it.annualAmount)}</td>
                      <td className="py-2 px-2 text-right">
                        <div className="numeric font-medium">{formatRatePct(it.resolvedRate)}</div>
                        <Badge variant="outline" className="mt-0.5 text-[10px] whitespace-nowrap">{SOURCE_LABEL[it.rateSource]}</Badge>
                        {it.rateNote && (
                          <div className="text-[10px] text-amber-600 mt-0.5 max-w-[140px] ml-auto">{NOTE_LABEL[it.rateNote]}</div>
                        )}
                        {it.historyRate && it.rateSource !== 'HISTORY' && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">History: {formatRatePct(it.historyRate)}</div>
                        )}
                      </td>
                      {it.projections.map((p, i) => (
                        <td key={i} className="py-2 px-2 text-right numeric">{inr(p)}</td>
                      ))}
                      <td className="py-2 px-2 text-right whitespace-nowrap">
                        <Button variant="ghost" size="icon" aria-label={`Edit ${it.name}`}
                          onClick={() => { setEditing(it); setDialogOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Remove ${it.name}`} disabled={deleteMut.isPending}
                          onClick={() => deleteMut.mutate(it.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  <tr className="font-medium border-t">
                    <td className="py-2 px-2">Total</td>
                    <td className="py-2 px-2 text-right numeric">{inr(data.totals.annualAmount)}</td>
                    <td className="py-2 px-2 text-right numeric">{formatRatePct(data.personalRate)}</td>
                    {data.totals.projections.map((p, i) => (
                      <td key={i} className="py-2 px-2 text-right numeric">{inr(p)}</td>
                    ))}
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {data.byDivision.length > 0 && data.asOf && <CompareChart data={data} />}

      <OfficialRatesCard data={data} />

      <BasketItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        existing={editing}
        saving={saveMut.isPending}
        onSave={(input) => saveMut.mutate(input)}
      />
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold numeric mt-1 break-words">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{hint}</div>
      </CardContent>
    </Card>
  );
}

function CompareChart({ data }: { data: PersonalInflationSummary }) {
  const pct = (v: string | null | undefined) => (v == null ? null : new Decimal(v).times(100).toDecimalPlaces(2).toNumber());
  const rows = data.byDivision.map((d) => ({
    name: cpiDivisionLabel(d.divisionCode),
    yours: pct(d.rate),
    official: pct(data.official.find((o) => o.divisionCode === d.divisionCode)?.longRunRate),
  }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your rate vs official, by category</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 56)}>
          <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis type="number" unit="%" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <Tooltip
              formatter={(v: number) => `${v}%`}
              contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="yours" name="Yours" fill="hsl(var(--foreground))" radius={[0, 3, 3, 0]} />
            <Bar dataKey="official" name="Official (yearly avg)" fill="hsl(var(--muted-foreground))" fillOpacity={0.45} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function OfficialRatesCard({ data }: { data: PersonalInflationSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Official inflation by category</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-2 px-2 font-medium">Category</th>
                <th className="py-2 px-2 font-medium text-right">Latest year-on-year</th>
                <th className="py-2 px-2 font-medium text-right">Yearly average (used)</th>
              </tr>
            </thead>
            <tbody>
              {CPI_DIVISIONS.map((d) => {
                const o = data.official.find((x) => x.divisionCode === d.code);
                return (
                  <tr key={d.code} className="border-b last:border-0">
                    <td className="py-2 px-2">
                      {d.shortLabel}
                      {o?.source === 'ALL_INDIA' && data.profile.stateCode !== 1 && (
                        <span className="text-[10px] text-muted-foreground ml-1">(All India)</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right numeric">{formatRatePct(o?.latestYoy, 2)}</td>
                    <td className="py-2 px-2 text-right numeric">
                      {formatRatePct(o?.longRunRate, 2)}
                      {o && o.yearsUsed > 0 && <span className="text-[10px] text-muted-foreground ml-1">{o.yearsUsed} yr</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-3 flex gap-1.5">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            Projections use the yearly average: the same month&apos;s year-on-year change over up to 5 years, compounded.
            Years before 2026 come from MoSPI&apos;s older CPI series (base 2012), matched to today&apos;s categories as closely as
            that series allows. A single month&apos;s figure swings too much to project from. Past inflation is no guarantee of future prices.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
