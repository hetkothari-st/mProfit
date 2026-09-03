import { useMemo, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Loader2, Users, Wallet } from 'lucide-react';
import { formatINR } from '@portfolioos/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { AutoFitText } from '@/components/ui/AutoFitText';
import { cn } from '@/lib/cn';
import { useThemeStore } from '@/stores/theme.store';
import { memberLabel, type FamilyWealth } from '@/api/familyDashboard.api';
import { PartialDataNotice, PartialSuffix, RestrictedChip } from './RestrictedNotice';
import { isPositiveMoney, moneySign, moneyToNumber, pluralMembers } from './money';

/**
 * Household wealth — the one number the family opens this page for, plus the
 * two questions that immediately follow it: who does it come from, and what
 * is it made of.
 *
 * Every total here can be partial (see ./restricted). The hero carries a
 * "Partial" suffix, the contribution strip carries an explicit unknown-width
 * block for hidden members, and restricted members are chipped in the table.
 */

// Same hue families as DashboardPage's net-worth pie so the two surfaces read
// as one system; ordered so adjacent members never collide.
const MEMBER_COLORS_DARK = [
  'hsl(70 95% 65%)',
  'hsl(185 70% 55%)',
  'hsl(330 70% 68%)',
  'hsl(40 90% 62%)',
  'hsl(210 85% 65%)',
  'hsl(265 70% 72%)',
  'hsl(150 55% 55%)',
  'hsl(25 80% 60%)',
  'hsl(0 0% 88%)',
  'hsl(190 60% 60%)',
];

const MEMBER_COLORS_LIGHT = [
  'hsl(70 80% 38%)',
  'hsl(185 65% 35%)',
  'hsl(330 55% 45%)',
  'hsl(40 85% 40%)',
  'hsl(210 75% 45%)',
  'hsl(265 55% 45%)',
  'hsl(150 55% 32%)',
  'hsl(25 75% 42%)',
  'hsl(0 0% 25%)',
  'hsl(190 60% 34%)',
];

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: 12,
  padding: '10px 12px',
  boxShadow: '0 12px 28px -16px hsl(var(--shadow-color) / 0.35)',
} as const;

const TOOLTIP_LABEL_STYLE = {
  color: 'hsl(var(--muted-foreground))',
  marginBottom: 4,
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
} as const;

export interface FamilyWealthCardProps {
  data: FamilyWealth | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function FamilyWealthCard({ data, isLoading, isError }: FamilyWealthCardProps) {
  const dark = useThemeStore((s) => s.dark);
  const palette = dark ? MEMBER_COLORS_DARK : MEMBER_COLORS_LIGHT;

  const hiddenMembers = data?.hiddenMemberCount ?? 0;

  // Biggest contributor first — the household's centre of gravity leads.
  const members = useMemo(() => {
    const rows = (data?.members ?? []).map((m, i) => ({
      ...m,
      // `name` is nullable on the contract; memberLabel falls back to email so
      // no bar, legend chip or table row is ever unattributed.
      label: memberLabel(m),
      value: moneyToNumber(m.netWorth),
      color: palette[i % palette.length]!,
    }));
    return rows.sort((a, b) => b.value - a.value);
  }, [data, palette]);

  const allocation = useMemo(
    () =>
      (data?.allocation ?? [])
        // `value` stays the decimal STRING the contract sends; the chart
        // gets a separate numeric `amount`, so the money field is never
        // overwritten by its own float approximation.
        .map((s) => ({ ...s, amount: moneyToNumber(s.value) }))
        .filter((s) => s.amount > 0),
    [data],
  );

  const restrictedCount = members.filter((m) => m.restricted).length;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-negative">
          Couldn&apos;t load the household&apos;s wealth. Try again shortly.
        </CardContent>
      </Card>
    );
  }

  const nothingVisible = members.length === 0 && !isPositiveMoney(data.totals.netWorth);

  return (
    <div className="space-y-4">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <Card tone="hero" className="reveal">
        <div className="relative px-4 py-5 sm:px-7 sm:py-7">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <p
                className="mb-2 text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85"
                title="Everything the household owns that you're permitted to see, less its loans and card balances."
              >
                Household net worth · after liabilities
                <PartialSuffix hiddenCount={hiddenMembers} />
              </p>
              <Money
                hero
                className="numeric-display-lg text-[clamp(1.7rem,5.2vw,3.6rem)] leading-[1.02] text-foreground break-words"
                symbolClassName="text-[0.6em] -translate-y-[0.18em] text-accent-ink"
              >
                {formatINR(data.totals.netWorthAfterLiabilities)}
              </Money>
              <div className="mt-5 flex flex-wrap items-stretch gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-accent-ink/70" strokeWidth={1.7} />
                  <span className="numeric text-[12px] font-medium tabular-nums text-foreground/90">
                    {members.length}
                  </span>
                  <span className="uppercase tracking-kerned text-[9.5px]">
                    {members.length === 1 ? 'Member counted' : 'Members counted'}
                  </span>
                </span>
                {hiddenMembers > 0 && (
                  <>
                    <span className="w-px self-stretch bg-border/80" />
                    <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                      <span className="numeric text-[12px] font-medium tabular-nums">
                        {hiddenMembers}
                      </span>
                      <span className="uppercase tracking-kerned text-[9.5px]">
                        Not shared with you
                      </span>
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="hidden max-w-[260px] flex-col items-end gap-2 text-right md:flex">
              <span className="text-[10px] uppercase tracking-kerned text-muted-foreground">
                Household
              </span>
              <p className="font-display-italic text-[17px] leading-[1.25] text-foreground/85">
                &ldquo;A family&rsquo;s balance sheet is one balance sheet.&rdquo;
              </p>
            </div>
          </div>

          <div className="my-6 rule-ornament">
            <span />
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-5 md:grid-cols-3 md:gap-x-0">
            {[
              {
                label: 'Gross assets',
                value: data.totals.netWorth,
                color: 'hsl(70 95% 65%)',
              },
              {
                label: 'Liabilities',
                value: data.totals.totalLiabilities,
                color: 'hsl(4 85% 66%)',
              },
              {
                label: 'Net of liabilities',
                value: data.totals.netWorthAfterLiabilities,
                color: 'hsl(185 70% 55%)',
              },
            ].map((item, i, arr) => (
              <div
                key={item.label}
                className={cn(
                  'min-w-0 md:px-5',
                  i === 0 && 'md:pl-0',
                  i < arr.length - 1 && 'md:border-r md:border-border/60',
                )}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 flex-shrink-0 rotate-45 rounded-[1px]"
                    style={{ background: item.color }}
                  />
                  <span className="text-[10px] uppercase tracking-kerned text-muted-foreground">
                    {item.label}
                  </span>
                </div>
                <AutoFitText className="mt-0.5">
                  <Money className="numeric-display text-[19px] text-foreground">
                    {formatINR(item.value)}
                  </Money>
                </AutoFitText>
              </div>
            ))}
          </div>

          {hiddenMembers > 0 && (
            <PartialDataNotice
              className="mt-6"
              hiddenCount={hiddenMembers}
              what="Every figure on this card"
            />
          )}
        </div>
      </Card>

      {/* ── Contribution ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
            Contribution
          </p>
          <CardTitle className="mt-1">Who the household&apos;s wealth sits with</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {nothingVisible ? (
            <div className="grid h-36 place-items-center rounded-md border border-dashed text-center text-sm text-muted-foreground">
              <span className="max-w-sm px-4">
                {hiddenMembers > 0
                  ? `No member's holdings are shared with you. ${pluralMembers(hiddenMembers)} in this family, all restricted.`
                  : 'No holdings recorded yet. Once members add portfolios, their share of the household shows up here.'}
              </span>
            </div>
          ) : (
            <>
              {/* Proportional strip. When members are hidden we append a block
                  of deliberately unknown width — we cannot draw a share we
                  were never told, and a 100%-wide strip of visible members
                  would be a lie. */}
              <div>
                <div className="flex h-3 w-full overflow-hidden rounded-full border border-border/60">
                  {members.map((m) => (
                    <div
                      key={m.userId}
                      title={`${m.label} — ${formatINR(m.netWorth)} (${(m.sharePct ?? 0).toFixed(1)}%)`}
                      style={{ background: m.color, flexGrow: Math.max(m.sharePct ?? 0, 0.4), flexBasis: 0 }}
                      className="h-full"
                    />
                  ))}
                  {hiddenMembers > 0 && (
                    <div
                      title={`${pluralMembers(hiddenMembers)}' data is not shared with you — their share of the household is unknown.`}
                      className="h-full w-16 shrink-0 border-l border-border/60 bg-[repeating-linear-gradient(45deg,hsl(var(--muted-foreground)/0.35)_0_4px,transparent_4px_8px)]"
                    />
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
                  {members.map((m) => (
                    <span key={m.userId} className="inline-flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: m.color }}
                      />
                      <span className="text-muted-foreground">{m.label}</span>
                      <span className="numeric font-medium tabular-nums">
                        {(m.sharePct ?? 0).toFixed(1)}%
                      </span>
                      {m.restricted && <RestrictedChip />}
                    </span>
                  ))}
                  {hiddenMembers > 0 && (
                    <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                      <span className="inline-block h-2.5 w-2.5 rounded-full bg-[repeating-linear-gradient(45deg,currentColor_0_2px,transparent_2px_4px)]" />
                      <span>{pluralMembers(hiddenMembers)} — share unknown</span>
                    </span>
                  )}
                </div>
              </div>

              <ResponsiveContainer width="100%" height={Math.max(140, members.length * 40)}>
                <BarChart
                  data={members}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="2 4"
                    stroke="hsl(var(--border))"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{
                      fontSize: 10,
                      fill: 'hsl(var(--muted-foreground))',
                      fontFamily: 'JetBrains Mono',
                    }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => formatINR(v.toFixed(2), { compact: true })}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={120}
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted) / 0.35)' }}
                    contentStyle={TOOLTIP_STYLE}
                    itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    formatter={(
                      _v: number,
                      _n: string,
                      p: { payload?: { netWorth?: string; restricted?: boolean } },
                    ) => [
                      // Format the original decimal string, not the float the
                      // chart plots — the tooltip must agree with the table.
                      `${formatINR(p.payload?.netWorth ?? '0')}${p.payload?.restricted ? ' (partial)' : ''}`,
                      'Net worth',
                    ]}
                  />
                  <Bar dataKey="value" radius={[0, 3, 3, 0]} barSize={14}>
                    {members.map((m) => (
                      <Cell key={m.userId} fill={m.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* The chart shows shape; the ledger carries the numbers. */}
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-border/70">
                      <Th align="left">Member</Th>
                      <Th align="right">Net worth</Th>
                      <Th align="right">Invested</Th>
                      <Th align="right">Unrealised P&amp;L</Th>
                      <Th align="right">Share</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.userId} className="border-b border-border/40 last:border-0">
                        <td className="px-1 py-2">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ background: m.color }}
                            />
                            <span className="text-foreground">{m.label}</span>
                            {m.restricted && <RestrictedChip />}
                          </span>
                        </td>
                        <td className="px-1 py-2 text-right">
                          <Money className="font-medium">{formatINR(m.netWorth)}</Money>
                        </td>
                        <td className="px-1 py-2 text-right text-muted-foreground">
                          <Money>{formatINR(m.invested)}</Money>
                        </td>
                        <td
                          className={cn(
                            'px-1 py-2 text-right font-medium',
                            moneySign(m.unrealisedPnL) > 0
                              ? 'text-positive'
                              : moneySign(m.unrealisedPnL) < 0
                                ? 'text-negative'
                                : 'text-muted-foreground',
                          )}
                        >
                          <Money>{formatINR(m.unrealisedPnL, { showSign: true })}</Money>
                        </td>
                        <td className="numeric px-1 py-2 text-right tabular-nums text-muted-foreground">
                          {(m.sharePct ?? 0).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                    {hiddenMembers > 0 && (
                      <tr className="border-t border-dashed border-amber-400/50">
                        <td
                          colSpan={5}
                          className="px-1 py-2 text-[12px] text-amber-700 dark:text-amber-300"
                        >
                          {pluralMembers(hiddenMembers)}
                          {hiddenMembers === 1 ? "'s" : "'"} data is not shared with you —
                          not in any row above, and not in the household total.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {restrictedCount > 0 && (
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  {restrictedCount === 1 ? 'One member is' : `${restrictedCount} members are`}{' '}
                  marked <span className="font-medium text-foreground">Partial</span> — their
                  permissions hide some asset classes or categories from you, so their row is a
                  floor, not a total.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Allocation ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
            Allocation
          </p>
          <CardTitle className="mt-1">What the household owns, combined</CardTitle>
        </CardHeader>
        <CardContent>
          {allocation.length === 0 ? (
            <div className="grid h-40 place-items-center rounded-md border border-dashed text-center text-sm text-muted-foreground">
              <span className="max-w-sm px-4">
                <Wallet className="mx-auto mb-2 h-5 w-5" strokeWidth={1.6} />
                No allocation visible yet.
              </span>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] md:items-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={allocation}
                    dataKey="amount"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={86}
                    paddingAngle={2}
                  >
                    {allocation.map((s, i) => (
                      <Cell key={s.key} fill={palette[i % palette.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    formatter={(
                      _v: number,
                      _n: string,
                      p: { payload?: { value?: string; percent?: number; label?: string } },
                    ) => [
                      `${formatINR(p.payload?.value ?? '0')} (${(p.payload?.percent ?? 0).toFixed(1)}%)`,
                      p.payload?.label ?? _n,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
                {allocation.map((s, i) => (
                  <div key={s.key} className="flex items-center justify-between text-xs">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                        style={{ background: palette[i % palette.length] }}
                      />
                      <span className="truncate text-muted-foreground">{s.label}</span>
                    </div>
                    <div className="ml-2 flex flex-shrink-0 items-center gap-2">
                      <Money className="tabular-nums text-muted-foreground">
                        {formatINR(s.value)}
                      </Money>
                      <span className="w-12 text-right font-medium tabular-nums">
                        {(s.percent ?? 0).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hiddenMembers > 0 && allocation.length > 0 && (
            <p className="mt-4 text-[12px] leading-relaxed text-amber-700 dark:text-amber-300">
              This mix is built only from the {pluralMembers(members.length)} you can see.
              Adding the {hiddenMembers === 1 ? 'hidden member' : `${hiddenMembers} hidden members`}{' '}
              would change both the amounts and the percentages.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Th({ children, align }: { children: ReactNode; align: 'left' | 'right' }) {
  return (
    <th
      className={cn(
        'px-1 py-2 text-[10px] font-medium uppercase tracking-kerned text-muted-foreground',
        align === 'left' ? 'text-left' : 'text-right',
      )}
    >
      {children}
    </th>
  );
}
