import { useMemo, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Siren,
  Target,
  Wallet,
} from 'lucide-react';
import { formatINR, formatQuantity } from '@portfolioos/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import { AutoFitText } from '@/components/ui/AutoFitText';
import { cn } from '@/lib/cn';
import { useThemeStore } from '@/stores/theme.store';
import { useAuthStore } from '@/stores/auth.store';
import { familiesApi } from '@/api/families.api';
import { ASSET_CLASS_LABEL, type AssetClassToken } from '@/lib/assetClasses';
import {
  familyDashboardApi,
  familyDashboardKeys,
  memberLabel,
  ATTENTION_TYPE_LABEL,
  FAMILY_GOAL_CATEGORY_LABEL,
  type AttentionItem,
  type FamilyGoal,
  type FamilyMemberProtection,
} from '@/api/familyDashboard.api';
import {
  NotSharedPanel,
  RestrictedChip,
  ScopeRestrictedNotice,
} from './widgets/RestrictedNotice';
import { isPositiveMoney, moneySign, moneyToNumber } from './widgets/money';

/**
 * ONE member of the household, in full — the page behind a name in the family
 * tree in the sidebar.
 *
 * Everything here comes from a single endpoint,
 * `/api/families/:familyId/members/:userId/detail`, which applies the caller's
 * visibility grant before it answers. That grant may be partial, and this page
 * exists as much to say WHAT IT COULD NOT SHOW as to show what it can:
 *
 *  - `assetClassesRestricted` — the allocation, the holdings and the net worth
 *    built from them cover only the classes shared with the caller. Labelled at
 *    the top and again on both of those cards, because a partial net worth read
 *    as a whole one is the single most misleading thing this page could do.
 *  - `hiddenCategories` — named, not omitted. An empty Protection card that
 *    says nothing means "they have no cover"; one that says "loans and
 *    insurance are not shared with you" means what is actually true.
 *  - `protection === null` — not shared. Never "no cover".
 *  - empty `goals` / `attention` — two different states, distinguished by
 *    whether GOAL (or the categories those items come from) is withheld.
 *
 * Money is a decimal STRING throughout the contract; it goes to `formatINR` /
 * `<Money>`, and through `moneyToNumber` only where a chart needs geometry.
 */

// Same hue families as FamilyWealthCard's pie, so a member's mix and the
// household's read as one system when you move between them.
const SLICE_COLORS_DARK = [
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

const SLICE_COLORS_LIGHT = [
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

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function assetClassLabel(token: string): string {
  return ASSET_CLASS_LABEL[token as AssetClassToken] ?? token;
}

export function FamilyMemberPage() {
  const { userId = '' } = useParams<{ userId: string }>();
  const [searchParams] = useSearchParams();
  const dark = useThemeStore((s) => s.dark);
  const palette = dark ? SLICE_COLORS_DARK : SLICE_COLORS_LIGHT;
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  /**
   * The route is /family/members/:userId but the endpoint is scoped to a
   * family, so the family has to come from somewhere. The sidebar link carries
   * it (`?familyId=`); a bookmarked or hand-typed URL doesn't, and for that
   * case we look the person up across the caller's families. Two paths, one
   * result — the URL stays clean and shareable either way.
   */
  const hintedFamilyId = searchParams.get('familyId');

  const familiesQuery = useQuery({
    queryKey: ['families', 'mine'],
    queryFn: () => familiesApi.list(),
    staleTime: 60_000,
  });
  const families = useMemo(() => familiesQuery.data ?? [], [familiesQuery.data]);

  const memberListQueries = useQueries({
    queries: families.map((f) => ({
      queryKey: ['families', f.id, 'members'],
      queryFn: () => familiesApi.members(f.id),
      staleTime: 60_000,
      enabled: !hintedFamilyId,
    })),
  });

  const discoveredFamilyId =
    families.find((f, i) =>
      (memberListQueries[i]?.data ?? []).some(
        (m) => m.userId === userId && m.status === 'ACTIVE',
      ),
    )?.id ?? null;

  const familyId = hintedFamilyId ?? discoveredFamilyId;
  const familyName = families.find((f) => f.id === familyId)?.name ?? null;

  const stillResolving =
    !familyId &&
    (familiesQuery.isLoading || memberListQueries.some((q) => q.isLoading));

  const detailQuery = useQuery({
    queryKey: familyDashboardKeys.memberDetail(familyId ?? 'none', userId),
    queryFn: () => familyDashboardApi.memberDetail(familyId!, userId),
    enabled: Boolean(familyId && userId),
    staleTime: 30_000,
  });

  const detail = detailQuery.data;

  const allocation = useMemo(
    () =>
      (detail?.allocation ?? [])
        // `value` stays the decimal string the contract sent; the chart plots a
        // separate numeric `amount` so money is never overwritten by its own
        // float approximation.
        .map((s) => ({ ...s, amount: moneyToNumber(s.value) }))
        .filter((s) => s.amount > 0),
    [detail],
  );

  const hidden = detail?.hiddenCategories ?? [];
  const acRestricted = detail?.assetClassesRestricted ?? false;
  const goalsHidden = hidden.includes('GOAL');
  // Both halves of "liabilities" withheld means the ₹0 on the contract is an
  // absence of permission, not an absence of debt.
  const liabilitiesHidden = hidden.includes('LOAN') && hidden.includes('CREDIT_CARD');

  const isSelf = Boolean(detail?.member.isSelf ?? (userId && userId === currentUserId));
  const name = detail ? memberLabel(detail.member) : null;

  // ── Resolution / load states ────────────────────────────────────────────
  if (stillResolving || (familyId && detailQuery.isLoading)) {
    return (
      <div className="grid h-64 place-items-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!familyId) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            We couldn&apos;t find that person in any family you belong to. They may have
            left, or their membership may have been revoked.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (detailQuery.isError || !detail) {
    return (
      <div className="space-y-6">
        <BackLink />
        <Card>
          <CardContent className="py-10 text-center text-sm text-negative">
            Couldn&apos;t load this member. You may no longer have permission to see them.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />

      <PageHeader
        eyebrow={familyName ? `${familyName} · Member` : 'Family member'}
        title={
          <span className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span>{isSelf ? 'You' : name}</span>
            {detail.member.restricted && <RestrictedChip className="translate-y-[-0.35em]" />}
          </span>
        }
        description={
          isSelf
            ? 'Your own slice of the household, exactly as it is counted into the family totals. Your data is never filtered from you.'
            : `${name}'s wealth, goals, protection and open items — everything their permissions share with you, and an explicit note wherever something isn't shared.`
        }
      />

      {/* The single most important thing on the page when a grant is partial:
          said once, up top, before any number is read. */}
      <ScopeRestrictedNotice
        assetClassesRestricted={acRestricted}
        hiddenCategories={hidden}
        what="The net worth, allocation and holdings below"
      />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <Card tone="hero" className="reveal">
        <div className="relative px-4 py-5 sm:px-7 sm:py-7">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
                Net worth · after liabilities
                {acRestricted && (
                  <span className="ml-2 align-middle text-[11px] font-normal normal-case tracking-kerned text-amber-600 dark:text-amber-400">
                    Partial · shared asset classes only
                  </span>
                )}
              </p>
              <Money
                hero
                className="numeric-display-lg text-[clamp(1.7rem,5.2vw,3.6rem)] leading-[1.02] text-foreground break-words"
                symbolClassName="text-[0.6em] -translate-y-[0.18em] text-accent-ink"
              >
                {formatINR(detail.netWorthAfterLiabilities)}
              </Money>
              <p className="mt-4 text-[11px] text-muted-foreground">
                As of <span className="numeric">{formatDate(detail.asOf)}</span>
              </p>
            </div>

            <div className="hidden max-w-[260px] flex-col items-end gap-2 text-right md:flex">
              <span className="text-[10px] uppercase tracking-kerned text-muted-foreground">
                {isSelf ? 'Your position' : 'One member'}
              </span>
              <p className="font-display-italic text-[17px] leading-[1.25] text-foreground/85">
                &ldquo;A household is only as clear as its least visible member.&rdquo;
              </p>
            </div>
          </div>

          <div className="my-6 rule-ornament">
            <span />
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-5 md:grid-cols-4 md:gap-x-0">
            <Stat label="Gross assets" color="hsl(70 95% 65%)" value={detail.netWorth} />
            <Stat label="Invested" color="hsl(185 70% 55%)" value={detail.invested} />
            <Stat
              label="Unrealised P&L"
              color="hsl(265 70% 72%)"
              value={detail.unrealisedPnL}
              showSign
              tone={
                moneySign(detail.unrealisedPnL) > 0
                  ? 'text-positive'
                  : moneySign(detail.unrealisedPnL) < 0
                    ? 'text-negative'
                    : undefined
              }
            />
            <Stat
              label="Liabilities"
              color="hsl(4 85% 66%)"
              value={detail.totalLiabilities}
              last
              // Withheld debt is not zero debt. Saying "₹0" here would turn a
              // permission boundary into a solvency claim.
              notShared={liabilitiesHidden}
            />
          </div>

          {liabilitiesHidden && (
            <p className="mt-5 text-[12px] leading-relaxed text-amber-700 dark:text-amber-300">
              Loans and credit cards are not shared with you, so the net worth above is not
              reduced by any debt this member may carry.
            </p>
          )}
        </div>
      </Card>

      {/* ── Allocation ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
            Allocation
          </p>
          <CardTitle className="mt-1">
            What {isSelf ? 'you own' : 'they own'}
            {acRestricted && (
              <span className="ml-2 align-middle text-[11px] font-normal uppercase tracking-kerned text-amber-600 dark:text-amber-400">
                Shared classes only
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allocation.length === 0 ? (
            <div className="grid h-40 place-items-center rounded-md border border-dashed text-center text-sm text-muted-foreground">
              <span className="max-w-sm px-4">
                <Wallet className="mx-auto mb-2 h-5 w-5" strokeWidth={1.6} />
                {acRestricted
                  ? 'Nothing in the asset classes shared with you. They may well hold assets in the classes you cannot see.'
                  : 'No holdings recorded yet.'}
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

          {acRestricted && allocation.length > 0 && (
            <p className="mt-4 text-[12px] leading-relaxed text-amber-700 dark:text-amber-300">
              This mix is drawn only from the asset classes {isSelf ? 'you' : 'they'} share
              with you. Classes outside that grant are absent from both the amounts and the
              percentages, so the percentages describe the visible slice — not the whole
              portfolio.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Holdings ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
                Holdings
              </p>
              <CardTitle className="mt-1">Position by position</CardTitle>
            </div>
            <p className="text-[12.5px] text-muted-foreground">
              <span className="numeric">{detail.holdings.length}</span>{' '}
              {detail.holdings.length === 1 ? 'position' : 'positions'}
              {acRestricted && (
                <span className="text-amber-600 dark:text-amber-400"> · shared classes only</span>
              )}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {detail.holdings.length === 0 ? (
            <div className="grid h-36 place-items-center rounded-md border border-dashed text-center text-sm text-muted-foreground">
              <span className="max-w-sm px-4">
                {acRestricted
                  ? 'No positions in the asset classes shared with you. Positions in the classes you cannot see are not listed, and not counted above.'
                  : 'No positions recorded yet.'}
              </span>
            </div>
          ) : (
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border/70">
                    <Th align="left">Asset</Th>
                    <Th align="left">Class</Th>
                    <Th align="right">Quantity</Th>
                    <Th align="right">Invested</Th>
                    <Th align="right">Current value</Th>
                    <Th align="right">Unrealised P&amp;L</Th>
                  </tr>
                </thead>
                <tbody>
                  {detail.holdings.map((h) => (
                    <tr
                      key={`${h.assetClass}:${h.assetKey}`}
                      className="border-b border-border/40 last:border-0"
                    >
                      <td className="px-1 py-2">
                        <span className="block truncate text-foreground">{h.assetName}</span>
                      </td>
                      <td className="px-1 py-2">
                        <Badge variant="outline" className="text-[9.5px] uppercase tracking-kerned">
                          {assetClassLabel(h.assetClass)}
                        </Badge>
                      </td>
                      <td className="numeric px-1 py-2 text-right tabular-nums text-muted-foreground">
                        {formatQuantity(h.quantity)}
                      </td>
                      <td className="px-1 py-2 text-right text-muted-foreground">
                        <Money>{formatINR(h.totalCost)}</Money>
                      </td>
                      <td className="px-1 py-2 text-right">
                        <Money className="font-medium">{formatINR(h.currentValue)}</Money>
                      </td>
                      <td
                        className={cn(
                          'px-1 py-2 text-right font-medium',
                          moneySign(h.unrealisedPnL) > 0
                            ? 'text-positive'
                            : moneySign(h.unrealisedPnL) < 0
                              ? 'text-negative'
                              : 'text-muted-foreground',
                        )}
                      >
                        <Money>{formatINR(h.unrealisedPnL, { showSign: true })}</Money>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Goals ────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
            Goals
          </p>
          <CardTitle className="mt-1">
            What {isSelf ? 'you are' : 'they are'} saving for
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {detail.goals.length === 0 ? (
            // Two different empty states, and they must not look alike: one
            // says the person has no goals, the other says we aren't allowed
            // to know whether they do.
            goalsHidden ? (
              <NotSharedPanel
                title="Goals aren't shared with you"
                detail="This member's permissions withhold the Goals category. They may have goals — this page simply cannot see them, so nothing here should be read as an absence."
              />
            ) : (
              <div className="grid h-36 place-items-center rounded-md border border-dashed text-center text-sm text-muted-foreground">
                <span className="max-w-sm px-4">
                  <Target className="mx-auto mb-2 h-5 w-5" strokeWidth={1.6} />
                  No goals yet. Once {isSelf ? 'you create' : 'they create'} one it shows here
                  with its shortfall and the monthly SIP it needs.
                </span>
              </div>
            )
          ) : (
            <ul className="divide-y divide-border/50">
              {detail.goals.map((g) => (
                <GoalRow key={g.id} goal={g} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Protection ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
            Protection
          </p>
          <CardTitle className="mt-1">Cover against what is at stake</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {detail.protection === null ? (
            // `null` is a permission boundary, not a finding. "No cover" is a
            // dangerous thing to imply about someone whose policies you were
            // simply not shown.
            <NotSharedPanel
              title="Protection isn't shared with you"
              detail="Insurance and liabilities sit outside the permissions you've been granted for this member. This does not mean they hold no cover — it means we can't tell you either way."
            />
          ) : (
            <ProtectionBlock
              protection={detail.protection}
              hiddenCategories={hidden}
              isSelf={isSelf}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Attention ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
            Needs attention
          </p>
          <CardTitle className="mt-1">What is open right now</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.attention.length === 0 ? (
            hidden.length > 0 ? (
              <NotSharedPanel
                title="Nothing open in what's shared with you"
                detail={`Alerts come from the categories a member shares. Because some of theirs aren't shared with you, an empty list here means "nothing you may see" rather than "nothing to do".`}
              />
            ) : (
              <div className="grid h-36 place-items-center rounded-md border border-dashed text-center text-sm text-muted-foreground">
                <span className="max-w-sm px-4">
                  <CheckCircle2
                    className="mx-auto mb-2 h-5 w-5 text-positive"
                    strokeWidth={1.6}
                  />
                  Nothing needs attention right now.
                </span>
              </div>
            )
          ) : (
            <>
              <ul className="-mx-1 divide-y divide-border/50">
                {detail.attention.map((item) => (
                  <AttentionRow key={item.id} item={item} />
                ))}
              </ul>
              {hidden.length > 0 && (
                <p className="mt-3 text-[12px] leading-relaxed text-amber-700 dark:text-amber-300">
                  <Siren className="mr-1 inline h-3.5 w-3.5 align-[-2px]" strokeWidth={1.8} />
                  Items from the categories not shared with you never reach this list, so it is
                  a floor rather than everything that is open.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Pieces ────────────────────────────────────────────────────────────────

function BackLink() {
  return (
    <Link
      to="/family"
      className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground focus-ring rounded"
    >
      <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
      Back to the household
    </Link>
  );
}

function Stat({
  label,
  value,
  color,
  showSign,
  tone,
  last,
  notShared,
}: {
  label: string;
  value: string;
  color: string;
  showSign?: boolean;
  tone?: string;
  last?: boolean;
  /** Render "Not shared" instead of the figure — see the liabilities case. */
  notShared?: boolean;
}) {
  return (
    <div className={cn('min-w-0 md:px-5', !last && 'md:border-r md:border-border/60')}>
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 flex-shrink-0 rotate-45 rounded-[1px]"
          style={{ background: color }}
        />
        <span className="text-[10px] uppercase tracking-kerned text-muted-foreground">
          {label}
        </span>
      </div>
      {notShared ? (
        <p className="mt-0.5 text-[15px] leading-[19px] text-amber-700 dark:text-amber-300">
          Not shared
        </p>
      ) : (
        <AutoFitText className="mt-0.5">
          <Money className={cn('numeric-display text-[19px] text-foreground', tone)}>
            {formatINR(value, showSign ? { showSign: true } : {})}
          </Money>
        </AutoFitText>
      )}
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

function GoalRow({ goal }: { goal: FamilyGoal }) {
  const pct = Math.max(0, Math.min(100, goal.progressPct ?? 0));

  return (
    <li className="py-3.5 first:pt-1">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-medium text-foreground">{goal.name}</span>
            <Badge variant="outline" className="text-[9.5px] uppercase tracking-kerned">
              {FAMILY_GOAL_CATEGORY_LABEL[goal.category]}
            </Badge>
            {goal.isOnTrack === false && (
              <Badge
                variant="outline"
                className="border-negative/45 text-[9.5px] uppercase tracking-kerned text-negative"
              >
                Off track
              </Badge>
            )}
          </div>
          <p className="mt-1 inline-flex flex-wrap items-center gap-1 text-[11.5px] text-muted-foreground">
            <CalendarClock className="h-3 w-3" strokeWidth={1.8} />
            <span className="numeric">{formatDate(goal.targetDate)}</span>
            <span>
              · <span className="numeric">{goal.yearsRemaining.toFixed(1)}</span> years out
            </span>
          </p>
        </div>

        <div className="text-right">
          <Money className="numeric-display text-[15px] font-medium text-foreground">
            {formatINR(goal.currentValue)}
          </Money>
          <p className="text-[11px] text-muted-foreground">
            of <Money>{formatINR(goal.targetAmount)}</Money>
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full transition-all',
              goal.isOnTrack === false ? 'bg-negative/80' : 'bg-accent',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="numeric w-12 shrink-0 text-right text-[12px] font-medium tabular-nums">
          {pct.toFixed(0)}%
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-muted-foreground">
        <span>
          Shortfall{' '}
          <Money
            className={cn(
              'font-medium',
              isPositiveMoney(goal.shortfall) ? 'text-foreground' : 'text-positive',
            )}
          >
            {formatINR(goal.shortfall)}
          </Money>
        </span>
        {goal.requiredMonthlySip !== null && isPositiveMoney(goal.requiredMonthlySip) && (
          <span>
            Needs monthly{' '}
            <Money className="font-medium text-foreground">
              {formatINR(goal.requiredMonthlySip)}
            </Money>
          </span>
        )}
      </div>
    </li>
  );
}

function ProtectionBlock({
  protection,
  hiddenCategories,
  isSelf,
}: {
  protection: FamilyMemberProtection;
  hiddenCategories: string[];
  isSelf: boolean;
}) {
  const insuranceHidden = hiddenCategories.includes('INSURANCE');
  const loansHidden = hiddenCategories.includes('LOAN');
  const cardsHidden = hiddenCategories.includes('CREDIT_CARD');
  const { liabilities } = protection;

  // `requiredLifeCover` is null when there is no income on file — ten times an
  // unknown income is not zero, and "₹0 required" reads as "needs no cover".
  const unsized = protection.requiredLifeCover === null;

  return (
    <div className="space-y-5">
      {/* Cover status leads: uncovered is a different kind of fact from
          under-covered, and "we can't tell" is a third. */}
      <div
        className={cn(
          'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12.5px] leading-relaxed',
          protection.hasNoCover === null
            ? 'border-amber-300/70 bg-amber-50/70 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
            : protection.hasNoCover
              ? 'border-negative/40 bg-negative/5 text-foreground'
              : 'border-border/70 bg-muted/30 text-muted-foreground',
        )}
      >
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
        <span>
          {protection.hasNoCover === null ? (
            <>
              <strong className="font-medium">
                Whether {isSelf ? 'you hold' : 'they hold'} any policy is not shared with you.
              </strong>{' '}
              The insurance category is withheld, so the cover figures below are blank for want
              of permission, not for want of a policy.
            </>
          ) : protection.hasNoCover ? (
            <>
              <strong className="font-medium">No active policy on file.</strong> Nothing stands
              between this member&apos;s dependants and the liabilities listed below.
            </>
          ) : (
            <>
              <span className="numeric font-medium text-foreground">
                {protection.policyCount}
              </span>{' '}
              active {protection.policyCount === 1 ? 'policy' : 'policies'} · adequacy score{' '}
              <span className="numeric font-medium text-foreground">
                {protection.coverAdequacyScore}
              </span>
              /100
            </>
          )}
        </span>
      </div>

      {/* Cover vs required */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Life cover" value={protection.lifeCover} notShared={insuranceHidden} />
        <Figure
          label="Recommended"
          value={protection.requiredLifeCover}
          fallback={unsized ? 'Income not on file' : undefined}
        />
        <Figure
          label="Gap"
          value={protection.lifeCoverGap}
          fallback={unsized ? "Can't be sized yet" : undefined}
          tone={
            protection.lifeCoverGap && isPositiveMoney(protection.lifeCoverGap)
              ? 'text-negative'
              : 'text-positive'
          }
        />
        <Figure
          label="Health cover"
          value={protection.healthCover}
          notShared={insuranceHidden}
        />
      </div>

      {unsized && (
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Recommended cover is ten times annual income. With no income on file for this member
          it cannot be sized — which is not the same as needing none.
        </p>
      )}

      {/* Liabilities */}
      <div>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
          Liabilities
        </p>
        {loansHidden && cardsHidden ? (
          <NotSharedPanel
            title="Debt isn't shared with you"
            detail="Neither loans nor credit cards are within your grant for this member, so no debt figure here can be trusted as a total — or as a zero."
          />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Figure
                label="Loans outstanding"
                value={liabilities.loanOutstanding}
                notShared={loansHidden}
                sub={loansHidden ? undefined : `${liabilities.loanCount} open`}
              />
              <Figure label="Monthly EMI" value={liabilities.monthlyEmi} notShared={loansHidden} />
              <Figure
                label="Card balances"
                value={liabilities.creditCardOutstanding}
                notShared={cardsHidden}
                sub={cardsHidden ? undefined : `${liabilities.creditCardCount} cards`}
              />
              <Figure label="Total debt" value={liabilities.totalLiabilities} />
            </div>
            {(loansHidden || cardsHidden) && (
              <p className="mt-3 text-[12px] leading-relaxed text-amber-700 dark:text-amber-300">
                {loansHidden ? 'Loans are' : 'Credit cards are'} not shared with you, so the
                total debt shown counts only the half you may see.
              </p>
            )}
          </>
        )}
      </div>

      {/* Renewals */}
      {protection.upcomingRenewals.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
            Renewals due
          </p>
          <ul className="divide-y divide-border/50">
            {protection.upcomingRenewals.map((r) => (
              <li
                key={r.policyId}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2"
              >
                <span className="text-[13.5px] text-foreground">
                  {r.planName ?? r.type} · <span className="text-muted-foreground">{r.insurer}</span>
                </span>
                <span className="text-[12px] text-muted-foreground">
                  <span className="numeric">{formatDate(r.dueDate)}</span>
                  {' · '}
                  <span className={cn('numeric', r.daysUntil < 0 && 'text-negative')}>
                    {r.daysUntil < 0 ? `${Math.abs(r.daysUntil)}d late` : `in ${r.daysUntil}d`}
                  </span>
                  {' · '}
                  <Money className="font-medium text-foreground">{formatINR(r.amount)}</Money>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  sub,
  tone,
  notShared,
  fallback,
}: {
  label: string;
  value: string | null;
  sub?: string;
  tone?: string;
  /** The caller's grant withholds this figure — say so instead of showing ₹0. */
  notShared?: boolean;
  /** Shown when the figure is null for a reason other than permission. */
  fallback?: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/25 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-kerned text-muted-foreground">{label}</p>
      {notShared ? (
        <p className="mt-1 text-[13px] text-amber-700 dark:text-amber-300">Not shared</p>
      ) : value === null ? (
        <p className="mt-1 text-[13px] text-muted-foreground">{fallback ?? 'Unknown'}</p>
      ) : (
        <Money className={cn('numeric-display mt-1 block text-[16px] text-foreground', tone)}>
          {formatINR(value)}
        </Money>
      )}
      {sub && !notShared && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
      )}
    </div>
  );
}

const URGENCY_TONE: Record<string, string> = {
  HIGH: 'text-negative',
  MEDIUM: 'text-amber-600 dark:text-amber-400',
  LOW: 'text-muted-foreground',
};

function AttentionRow({ item }: { item: AttentionItem }) {
  const overdue = (item.daysUntil ?? 1) < 0;
  const when =
    item.daysUntil === null
      ? null
      : overdue
        ? `${Math.abs(item.daysUntil)}d late`
        : item.daysUntil === 0
          ? 'today'
          : `in ${item.daysUntil}d`;

  return (
    <li className="flex items-baseline gap-4 px-1 py-3">
      <div className="w-[4.75rem] shrink-0 text-right">
        {when ? (
          <>
            <span
              className={cn(
                'numeric block text-[13px] font-medium leading-tight',
                overdue ? 'text-negative' : URGENCY_TONE[item.urgency],
              )}
            >
              {when}
            </span>
            <span className="numeric block text-[10.5px] leading-tight text-muted-foreground/70">
              {formatDate(item.dueDate)}
            </span>
          </>
        ) : (
          <span className="text-[13px] leading-tight text-muted-foreground/50">—</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium leading-snug text-foreground">{item.title}</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
          {ATTENTION_TYPE_LABEL[item.type]}
          {item.description && <span> · {item.description}</span>}
        </p>
      </div>

      <div className="shrink-0 text-right">
        {item.amountInr ? (
          <Money className="numeric text-[14px] font-medium text-foreground">
            {formatINR(item.amountInr)}
          </Money>
        ) : (
          <span className="text-[13px] text-muted-foreground/40">—</span>
        )}
      </div>
    </li>
  );
}
