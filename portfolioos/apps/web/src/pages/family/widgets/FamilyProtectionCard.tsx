import { useMemo, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, CalendarClock, Loader2, ShieldCheck, ShieldX } from 'lucide-react';
import { formatINR } from '@portfolioos/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { cn } from '@/lib/cn';
import { useThemeStore } from '@/stores/theme.store';
import { memberLabel, type FamilyProtection } from '@/api/familyDashboard.api';
import { PartialDataNotice } from './RestrictedNotice';
import { isPositiveMoney, moneyToNumber, pluralMembers } from './money';

/**
 * Protection — life cover against what the household actually needs, plus the
 * liabilities that drive that need and the premiums about to fall due.
 *
 * The loudest thing on this card is a member with NO cover. Under-covered is a
 * gap you close over time; uncovered is a single event away from wiping the
 * household's balance sheet, so it gets its own block above the chart rather
 * than a red cell in row seven of a table.
 */

const CHART_DARK = {
  cover: 'hsl(70 95% 65%)',
  recommended: 'hsl(0 0% 55%)',
};

const CHART_LIGHT = {
  cover: 'hsl(70 80% 34%)',
  recommended: 'hsl(0 0% 45%)',
};

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

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export interface FamilyProtectionCardProps {
  data: FamilyProtection | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function FamilyProtectionCard({ data, isLoading, isError }: FamilyProtectionCardProps) {
  const dark = useThemeStore((s) => s.dark);
  const C = dark ? CHART_DARK : CHART_LIGHT;

  // The protection payload reports its own hidden-member count — members whose
  // cover, premiums and liabilities are all withheld from the caller. Without
  // it a household with no visible cover is indistinguishable from one that is
  // genuinely uninsured.
  const hiddenMemberCount = data?.hiddenMemberCount ?? 0;

  const members = useMemo(
    () =>
      (data?.members ?? [])
        .map((m) => ({
          ...m,
          label: memberLabel(m),
          cover: moneyToNumber(m.lifeCover),
          recommended: moneyToNumber(m.requiredLifeCover),
          gap: moneyToNumber(m.lifeCoverGap),
        }))
        // Biggest gap first — the row that needs a decision leads.
        .sort((a, b) => b.gap - a.gap),
    [data],
  );

  // `hasNoCover` is null when the caller cannot see this member's INSURANCE
  // category. "We are not allowed to look" is not "they have no cover", so
  // only an explicit `true` puts a member in this list.
  const uncovered = members.filter((m) => m.hasNoCover === true);

  // Renewals hang off each member on the contract; the card shows one
  // household-wide list, so they are flattened back out with the owner's name
  // attached — an unattributed "premium due" is not actionable.
  const renewals = useMemo(
    () =>
      (data?.members ?? [])
        .flatMap((m) =>
          m.upcomingRenewals.map((r) => ({ ...r, memberName: memberLabel(m) })),
        )
        .sort((a, b) => a.daysUntil - b.daysUntil),
    [data],
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
              Protection
            </p>
            <CardTitle className="mt-1">Cover, gaps and what falls due</CardTitle>
          </div>
          {data && (
            <div className="text-right">
              <p className="text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
                Household cover gap
              </p>
              <Money
                className={cn(
                  'numeric-display text-[17px] font-medium',
                  isPositiveMoney(data.totals.protectionGap)
                    ? 'text-negative'
                    : 'text-positive',
                )}
              >
                {formatINR(data.totals.protectionGap)}
              </Money>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {isLoading && (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {isError && !isLoading && (
          <p className="py-6 text-sm text-negative">
            Couldn&apos;t load the household&apos;s protection. Try again shortly.
          </p>
        )}

        {!isLoading && !isError && (
          <PartialDataNotice
            hiddenCount={hiddenMemberCount}
            what="The cover, gaps and renewals below"
          />
        )}

        {!isLoading && !isError && members.length === 0 && (
          <div className="grid h-40 place-items-center rounded-md border border-dashed text-center text-sm text-muted-foreground">
            <span className="max-w-sm px-4">
              <ShieldCheck className="mx-auto mb-2 h-5 w-5" strokeWidth={1.6} />
              {hiddenMemberCount > 0
                ? `No member's policies are shared with you — ${pluralMembers(hiddenMemberCount)} in this family, all restricted.`
                : 'No policies recorded. Add life and health cover to see the household against what it needs.'}
            </span>
          </div>
        )}

        {!isLoading && !isError && members.length > 0 && (
          <>
            {/* ── Uncovered members, called out ahead of everything else ── */}
            {uncovered.length > 0 && (
              <div className="rounded-lg border border-negative/45 bg-negative/[0.07] p-3.5">
                <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-kerned text-negative">
                  <ShieldX className="h-3.5 w-3.5" strokeWidth={2} />
                  {uncovered.length === 1
                    ? '1 member has no life cover at all'
                    : `${uncovered.length} members have no life cover at all`}
                </p>
                <ul className="mt-2.5 space-y-2">
                  {uncovered.map((m) => (
                    <li
                      key={m.userId}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5"
                    >
                      <span className="text-[14px] font-medium text-foreground">{m.label}</span>
                      <span className="text-[12px] text-muted-foreground">
                        Recommended{' '}
                        <Money className="font-medium text-foreground">
                          {formatINR(m.requiredLifeCover)}
                        </Money>
                        {isPositiveMoney(m.liabilities.totalLiabilities) && (
                          <>
                            {' · carries '}
                            <Money className="font-medium text-negative">
                              {formatINR(m.liabilities.totalLiabilities)}
                            </Money>
                            {' of debt'}
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
                  An uncovered earner with outstanding loans transfers that debt to the rest of
                  the household. This is the first gap to close.
                </p>
              </div>
            )}

            {/* ── Cover vs recommended ─────────────────────────────────── */}
            <ResponsiveContainer width="100%" height={Math.max(180, members.length * 52)}>
              <BarChart
                data={members}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
                barGap={2}
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
                    name: string,
                    p: {
                      payload?: { lifeCover?: string; requiredLifeCover?: string };
                    },
                  ) => [
                    formatINR(
                      (name === 'cover'
                        ? p.payload?.lifeCover
                        : p.payload?.requiredLifeCover) ?? '0',
                    ),
                    name === 'cover' ? 'Current cover' : 'Recommended',
                  ]}
                />
                <Legend
                  verticalAlign="bottom"
                  height={28}
                  iconType="circle"
                  iconSize={8}
                  formatter={(name: string) => (
                    <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>
                      {name === 'cover' ? 'Current cover' : 'Recommended'}
                    </span>
                  )}
                />
                <Bar dataKey="cover" fill={C.cover} radius={[0, 3, 3, 0]} barSize={9} />
                <Bar
                  dataKey="recommended"
                  fill={C.recommended}
                  radius={[0, 3, 3, 0]}
                  barSize={9}
                  fillOpacity={0.55}
                />
              </BarChart>
            </ResponsiveContainer>

            {/* ── Ledger ───────────────────────────────────────────────── */}
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border/70">
                    <Th align="left">Member</Th>
                    <Th align="right">Life cover</Th>
                    <Th align="right">Recommended</Th>
                    <Th align="right">Gap</Th>
                    <Th align="right">Health cover</Th>
                    <Th align="right">Annual premium</Th>
                    <Th align="right">Debt outstanding</Th>
                    <Th align="right">Monthly EMI</Th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const l = m.liabilities;
                    return (
                      <tr key={m.userId} className="border-b border-border/40 last:border-0">
                        <td className="px-1 py-2">
                          <span className="inline-flex items-center gap-2">
                            <span className="text-foreground">{m.label}</span>
                            {m.hasNoCover === true && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-negative/45 bg-negative/10 px-1.5 py-px text-[9.5px] font-medium uppercase tracking-kerned text-negative">
                                <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2.2} />
                                No cover
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-1 py-2 text-right">
                          {m.hasNoCover === true ? (
                            <span className="text-negative">None</span>
                          ) : (
                            <Money className="font-medium">{formatINR(m.lifeCover)}</Money>
                          )}
                        </td>
                        <td className="px-1 py-2 text-right text-muted-foreground">
                          <Money>{formatINR(m.requiredLifeCover)}</Money>
                        </td>
                        <td
                          className={cn(
                            'px-1 py-2 text-right font-medium',
                            isPositiveMoney(m.lifeCoverGap)
                              ? 'text-negative'
                              : 'text-muted-foreground',
                          )}
                        >
                          <Money>{formatINR(m.lifeCoverGap)}</Money>
                        </td>
                        <td className="px-1 py-2 text-right text-muted-foreground">
                          {isPositiveMoney(m.healthCover) ? (
                            <Money>{formatINR(m.healthCover)}</Money>
                          ) : (
                            <span className="text-negative/80">None</span>
                          )}
                        </td>
                        <td className="px-1 py-2 text-right text-muted-foreground">
                          <Money>{formatINR(m.annualPremiumTotal)}</Money>
                        </td>
                        <td className="px-1 py-2 text-right text-muted-foreground">
                          <Money>{formatINR(l.totalLiabilities)}</Money>
                          <span className="ml-1.5 text-[10px] uppercase tracking-kerned text-muted-foreground/70">
                            {l.loanCount} loan{l.loanCount === 1 ? '' : 's'}
                          </span>
                        </td>
                        <td className="px-1 py-2 text-right text-muted-foreground">
                          <Money>{formatINR(l.monthlyEmi)}</Money>
                          {isPositiveMoney(l.creditCardOutstanding) && (
                            <div className="text-[10.5px] text-negative/85">
                              + <Money>{formatINR(l.creditCardOutstanding)}</Money> on cards
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Renewals ─────────────────────────────────────────────── */}
            <div>
              <p className="text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
                Upcoming renewals
              </p>
              {renewals.length === 0 ? (
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                  Nothing falls due in the window we track.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-border/40">
                  {renewals.map((r) => {
                    const soon = r.daysUntil <= 14;
                    return (
                      <li
                        key={r.policyId}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2"
                      >
                        <span className="min-w-0">
                          <span className="text-[13px] text-foreground">
                            {r.planName ?? r.insurer}
                          </span>
                          <span className="text-[11.5px] text-muted-foreground">
                            {' · '}
                            {r.memberName}
                          </span>
                        </span>
                        <span className="flex items-baseline gap-3 text-[12px]">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1',
                              soon ? 'text-negative' : 'text-muted-foreground',
                            )}
                          >
                            <CalendarClock className="h-3 w-3" strokeWidth={1.8} />
                            <span className="numeric">{formatDate(r.dueDate)}</span>
                          </span>
                          <Money className="font-medium text-foreground">
                            {formatINR(r.amount)}
                          </Money>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Recommended cover is an estimate from income, dependants and outstanding debt.
              The household gap is the sum of every member&apos;s shortfall — closing it usually
              costs far less than the number suggests, because term cover is cheap.
            </p>
          </>
        )}
      </CardContent>
    </Card>
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
