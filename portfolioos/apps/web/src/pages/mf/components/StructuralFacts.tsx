import type { ReactNode } from 'react';
import { formatINR, type MfCurrentProfile, type MfSchemeMetaDto } from '@portfolioos/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { MetricStat, MetricValue, SectionUnavailable } from './MetricValue';
import {
  formatIsoDate,
  formatPct,
  formatPercentileOrdinal,
  formatRatio,
  resolveMetric,
} from '../mfFormat';

/**
 * The facts that do not come from the NAV series (`02 §8`): cost, size, the
 * people running it, and what it costs to leave.
 *
 * These are the numbers a reader can act on without a view on markets, and they
 * are also the numbers most often quoted as zero when they are simply unknown.
 * A TER of `null` rendered as `0.00%` tells a user their fund is free; an AUM of
 * `null` rendered as `₹0` tells them it is about to be wound up. Both go through
 * `MetricValue`, so neither can happen here.
 *
 * `minSip`, `exitLoadText` and `exitLoadRules` come from `MfSchemeMetaDto`
 * rather than the profile — they are scheme facts, not snapshot facts — which is
 * why this component takes both objects instead of pretending one contains the
 * other.
 */

export function StructuralFacts({
  meta,
  profile,
}: {
  meta: MfSchemeMetaDto;
  profile: MfCurrentProfile | null;
}) {
  return (
    <section data-testid="mf-structural-facts" className="space-y-4">
      <h2 className="font-display text-[22px] leading-none text-foreground">Fund facts</h2>

      {profile === null ? (
        <SectionUnavailable
          title="Cost, size and manager facts are not available"
          reason="No structural snapshot has been ingested for this scheme. The scheme-level facts below still apply."
        />
      ) : (
        <Card tone="flat">
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-3 lg:grid-cols-4">
            <MetricStat label="Expense ratio (TER)">
              <MetricValue
                {...resolveMetric(profile.terPct, 'terPct', profile)}
                format={(v) => formatPct(v, 2)}
              />
            </MetricStat>
            <MetricStat label="Category median TER">
              <MetricValue
                {...resolveMetric(profile.terCategoryMedianPct, 'terCategoryMedianPct', profile)}
                format={(v) => formatPct(v, 2)}
              />
            </MetricStat>
            <MetricStat label="TER percentile" hint="Higher is cheaper relative to the category">
              <MetricValue
                {...resolveMetric(profile.terPercentile, 'terPercentile', profile)}
                format={(v) => formatPercentileOrdinal(v)}
              />
            </MetricStat>
            <MetricStat label="AUM">
              {/* Money, not a Ratio: formatted through formatINR and rendered by
                  <Money> so the ₹ glyph and Indian grouping match every other
                  money figure in the product. */}
              <MetricValue
                {...resolveMetric(profile.aum, 'aum', profile)}
                format={(v) => formatINR(v, { compact: true })}
              />
            </MetricStat>
            <MetricStat label="AUM growth (12m)">
              <MetricValue
                {...resolveMetric(profile.aumGrowth12mPct, 'aumGrowth12mPct', profile)}
                format={(v) => formatPct(v, 1, true)}
              />
            </MetricStat>
            <MetricStat label="Size percentile in category">
              <MetricValue
                {...resolveMetric(profile.aumCategoryPercentile, 'aumCategoryPercentile', profile)}
                format={(v) => formatPercentileOrdinal(v)}
              />
            </MetricStat>
            <MetricStat label="Manager tenure">
              <MetricValue
                {...resolveMetric(profile.managerTenureYears, 'managerTenureYears', profile)}
                format={(v) => `${formatRatio(v, 1)} yrs`}
              />
            </MetricStat>
            <MetricStat label="Manager changes (3y)">
              {profile.managerChangesLast3y === null ? (
                <MetricValue
                  value={null}
                  status="INSUFFICIENT_DATA"
                  reason="we have no manager-change record for this scheme"
                  format={(v) => v}
                />
              ) : (
                <span data-metric-value data-status="OK" className="numeric tabular-nums">
                  {profile.managerChangesLast3y}
                </span>
              )}
            </MetricStat>
          </CardContent>
        </Card>
      )}

      {profile !== null && <Managers managers={profile.currentManagers} />}

      <Card tone="flat">
        <CardContent className="grid grid-cols-1 gap-x-6 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="AMC">{meta.amcName}</Fact>
          <Fact label="SEBI category">
            {meta.sebiCategory}
            {/* `UNMAPPED` is a real state: AMFI's category text did not resolve
                to a SEBI sub-category. Saying so beats printing the token. */}
            {meta.sebiSubCategory === 'UNMAPPED'
              ? ' — sub-category could not be mapped from the AMFI text'
              : ` / ${meta.sebiSubCategory}`}
          </Fact>
          <Fact label="Plan / option">
            {meta.planType} · {meta.optionType}
          </Fact>
          <Fact label="ISIN">{meta.isin ?? <Unknown reason="no ISIN on file" />}</Fact>
          <Fact label="Benchmark">
            {meta.benchmarkIndexCode ?? (
              <Unknown reason="no Total Return Index benchmark is mapped to this scheme" />
            )}
          </Fact>
          <Fact label="Inception">
            {formatIsoDate(meta.inceptionDate) ?? meta.inceptionDate}
          </Fact>
          <Fact label="Fund age">
            {meta.fundAgeYears === null ? (
              <Unknown reason="inception date could not be resolved" />
            ) : (
              <span className="numeric tabular-nums">{formatRatio(meta.fundAgeYears, 1)} yrs</span>
            )}
          </Fact>
          <Fact label="Minimum SIP">
            {meta.minSip === null ? (
              <Unknown reason="the AMC's minimum is not published in our feed" />
            ) : (
              <Money>{formatINR(meta.minSip)}</Money>
            )}
          </Fact>
          <Fact label="Scheme status">
            {meta.status}
            {meta.statusChangedAt ? ` since ${formatIsoDate(meta.statusChangedAt)}` : ''}
          </Fact>
          {/* Both are surfaced only when set, and both change how the numbers
              above should be read. A predecessor means this scheme absorbed
              another and its NAV history deliberately does NOT include the
              predecessor's (`01 §7`) — splicing it would rewrite the fund's risk
              record. A growth sibling means the rating lives on that scheme
              (`03 §1`), so a reader on an IDCW option knows where to look. */}
          {meta.predecessorSchemeCode && (
            <Fact label="Merged from">
              Scheme {meta.predecessorSchemeCode} — its NAV history is not spliced into this
              series, so the risk figures describe this scheme only
            </Fact>
          )}
          {meta.growthSiblingSchemeCode && (
            <Fact label="Scored on">
              Growth sibling {meta.growthSiblingSchemeCode} — IDCW options share its portfolio
            </Fact>
          )}
        </CardContent>
      </Card>

      <ExitLoad meta={meta} profile={profile} />
    </section>
  );
}

function Managers({ managers }: { managers: MfCurrentProfile['currentManagers'] }) {
  if (managers.length === 0) {
    return (
      <p
        data-metric-value
        data-status="INSUFFICIENT_DATA"
        className="text-[12px] text-muted-foreground"
      >
        Not available — no current fund manager is recorded for this scheme
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2" data-testid="mf-managers">
      {managers.map((m) => (
        <span
          key={`${m.name}-${m.fromDate}`}
          className="inline-flex items-baseline gap-2 rounded-full border border-border/70 bg-muted/40 px-3 py-1 text-[12px]"
        >
          <span className="font-medium text-foreground">{m.name}</span>
          {m.role && <span className="text-muted-foreground">{m.role}</span>}
          <span className="text-muted-foreground">
            since {formatIsoDate(m.fromDate) ?? m.fromDate}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * Exit load. `exitLoadRules` is the parsed ladder and `exitLoadText` the raw
 * factsheet sentence; the ladder is preferred and the raw text kept as the
 * fallback, because a load we could not parse is still a load the investor pays.
 * Both absent is stated explicitly — "no exit load" and "we do not know the exit
 * load" are different claims and only the AMC can make the first one.
 */
function ExitLoad({
  meta,
  profile,
}: {
  meta: MfSchemeMetaDto;
  profile: MfCurrentProfile | null;
}) {
  const rules = meta.exitLoadRules;
  return (
    <Card tone="flat">
      <CardContent className="p-5">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Exit load</p>
        {rules && rules.length > 0 ? (
          <ul className="mt-2 space-y-1 text-[13px]">
            {rules.map((r) => (
              <li key={`${r.daysUpTo}-${r.pct}`} className="text-foreground">
                <span className="numeric tabular-nums font-medium">{formatPct(r.pct, 2)}</span> if
                redeemed within <span className="numeric tabular-nums">{r.daysUpTo}</span> days
              </li>
            ))}
          </ul>
        ) : meta.exitLoadText ? (
          <p className="mt-2 text-[13px] text-foreground">{meta.exitLoadText}</p>
        ) : (
          <p
            data-metric-value
            data-status="INSUFFICIENT_DATA"
            className="mt-2 text-[12px] text-muted-foreground"
          >
            Not available — the exit load is not published in our feed. Do not read this as a fund
            with no exit load.
          </p>
        )}
        {profile?.exitLoadMaxDays !== null && profile?.exitLoadMaxDays !== undefined && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Load applies for up to{' '}
            <span className="numeric tabular-nums">{profile.exitLoadMaxDays}</span> days from
            purchase.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-[13px] text-foreground">{children}</p>
    </div>
  );
}

function Unknown({ reason }: { reason: string }) {
  return (
    <span data-metric-value data-status="INSUFFICIENT_DATA" className="text-[12px] text-muted-foreground">
      Not available — {reason}
    </span>
  );
}
