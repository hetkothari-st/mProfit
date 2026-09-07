import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import type {
  MfCreditQualitySplit,
  MfCurrentProfile,
  MfMarketCapSplit,
  Pct,
} from '@portfolioos/shared';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { MetricStat, MetricValue, SectionUnavailable } from './MetricValue';
import {
  HOLDINGS_STALE_AFTER_DAYS,
  daysSince,
  formatIsoDate,
  formatPct,
  formatRatio,
  ratioToChartNumber,
  resolveMetric,
  statusReasonText,
} from '../mfFormat';

/**
 * What the fund actually holds, from the latest monthly portfolio disclosure
 * (`02 §7`, the horizon-0 row).
 *
 * The staleness badge at the top is the point of the section as much as the
 * numbers are. AMCs disclose monthly and the file reaches us late, so
 * `snapshotAsOf` routinely trails `asOf` by 30-45 days — normal, and badging
 * that would train the reader to ignore the badge. Past
 * `HOLDINGS_STALE_AFTER_DAYS` a disclosure has genuinely been missed and every
 * sector weight, holding and credit bucket below describes a portfolio the fund
 * may no longer hold, so `06 §6` requires the amber "Portfolio as of {date}".
 *
 * `turnoverIsEstimated` and `durationIsApproximated` are surfaced next to their
 * own numbers rather than in a footnote. Both are inferences — turnover from
 * weight×AUM deltas across snapshots, duration weighted from holding maturities
 * when the AMC did not disclose it — and a reader comparing two funds needs to
 * know which of the two numbers is a measurement.
 */

export function PortfolioCharacteristics({ profile }: { profile: MfCurrentProfile | null }) {
  if (profile === null) {
    return (
      <section data-testid="mf-portfolio-characteristics">
        <SectionHeading>Portfolio</SectionHeading>
        <SectionUnavailable
          title="No portfolio disclosure on file"
          reason="We have not ingested a monthly portfolio snapshot for this scheme, so holdings, sector weights and the credit profile cannot be shown. This is a coverage gap on our side, not an empty portfolio."
        />
      </section>
    );
  }

  const lag = daysSince(profile.snapshotAsOf);
  const stale = lag !== null && lag > HOLDINGS_STALE_AFTER_DAYS;
  const snapshotLabel = formatIsoDate(profile.snapshotAsOf);

  return (
    <section data-testid="mf-portfolio-characteristics" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading>Portfolio</SectionHeading>
        {snapshotLabel === null ? (
          <span
            data-holdings-freshness="unknown"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] text-muted-foreground"
          >
            Disclosure date unknown — treat these weights as undated
          </span>
        ) : (
          <span
            data-holdings-freshness={stale ? 'stale' : 'fresh'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]',
              stale
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-700'
                : 'border-border bg-muted text-muted-foreground',
            )}
          >
            {stale && <AlertTriangle className="h-3.5 w-3.5" />}
            Portfolio as of {snapshotLabel}
          </span>
        )}
      </div>

      {/* `asOf` is when we computed this profile; `snapshotAsOf` above is when
          the AMC disclosed the portfolio. Showing both makes the lag legible
          rather than leaving the reader to assume they are the same date. */}
      <p className="text-[11px] text-muted-foreground">
        Computed {formatIsoDate(profile.asOf) ?? profile.asOf}
        {lag !== null && ` · disclosure is ${lag} days old`}
      </p>

      <Card tone="flat">
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-3 lg:grid-cols-4">
          <MetricStat label="Holdings">
            <CountValue value={profile.numHoldings} path="numHoldings" profile={profile} />
          </MetricStat>
          <MetricStat label="Top 10 weight">
            <PctStat value={profile.top10WeightPct} path="top10WeightPct" profile={profile} />
          </MetricStat>
          <MetricStat label="Concentration (HHI)">
            <RatioStat value={profile.hhi} path="hhi" profile={profile} digits={4} />
          </MetricStat>
          <MetricStat label="Effective holdings" hint="1 / HHI — diversification net of weights">
            <RatioStat value={profile.effectiveHoldings} path="effectiveHoldings" profile={profile} digits={1} />
          </MetricStat>
          <MetricStat label="Cash">
            <PctStat value={profile.cashPct} path="cashPct" profile={profile} />
          </MetricStat>
          <MetricStat label="Active share">
            <RatioStat value={profile.activeShare} path="activeShare" profile={profile} />
          </MetricStat>
          <MetricStat
            label="Turnover"
            hint={
              profile.turnoverIsEstimated
                ? 'Estimated from weight × AUM deltas across snapshots, not disclosed by the AMC'
                : undefined
            }
          >
            <PctStat value={profile.turnoverPct} path="turnoverPct" profile={profile} />
          </MetricStat>
          <MetricStat label="Style drift">
            <RatioStat value={profile.styleDrift} path="styleDrift" profile={profile} />
          </MetricStat>
        </CardContent>
      </Card>

      {profile.styleBox && (
        <p className="text-[12px] text-muted-foreground">
          Style box:{' '}
          <span className="font-medium text-foreground">
            {profile.styleBox.cap.toLowerCase()} cap
            {profile.styleBox.style ? ` / ${profile.styleBox.style.toLowerCase()}` : ''}
          </span>
          {profile.styleBox.style === null && ' — value/growth tilt could not be classified'}
        </p>
      )}

      <MarketCapSplitCard split={profile.marketCapSplit} />
      <SectorWeights weights={profile.sectorWeights} active={profile.sectorActiveWeights} />
      <TopHoldings holdings={profile.topHoldings} />
      <DebtProfile profile={profile} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Small value wrappers — each resolves against `MfCurrentProfile.fieldStatus`
// ---------------------------------------------------------------------------

function PctStat({
  value,
  path,
  profile,
}: {
  value: Pct | null;
  path: string;
  profile: MfCurrentProfile;
}) {
  const r = resolveMetric(value, path, profile);
  return (
    <MetricValue value={r.value} status={r.status} reason={r.reason} format={(v) => formatPct(v, 2)} />
  );
}

function RatioStat({
  value,
  path,
  profile,
  digits = 2,
}: {
  value: string | null;
  path: string;
  profile: MfCurrentProfile;
  digits?: number;
}) {
  const r = resolveMetric(value, path, profile);
  return (
    <MetricValue
      value={r.value}
      status={r.status}
      reason={r.reason}
      format={(v) => formatRatio(v, digits)}
    />
  );
}

/**
 * Counts are integers by nature and carry no precision risk, so they are plain
 * `number | null` on the contract. The null handling is identical to a Decimal
 * field's: a fund with an unknown holding count is not a fund with no holdings.
 */
function CountValue({
  value,
  path,
  profile,
}: {
  value: number | null;
  path: string;
  profile: MfCurrentProfile;
}) {
  const status = profile.fieldStatus[path];
  if (value === null || (status !== undefined && status !== 'OK')) {
    return (
      <MetricValue
        value={null}
        status={status ?? 'INSUFFICIENT_DATA'}
        reason={status === undefined ? 'the disclosure did not report it' : statusReasonText(status)}
        format={(v) => v}
      />
    );
  }
  return (
    <span data-metric-value data-status="OK" className="numeric tabular-nums">
      {value}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Splits and lists
// ---------------------------------------------------------------------------

const MARKET_CAP_LABEL: Record<keyof MfMarketCapSplit, string> = {
  large: 'Large cap',
  mid: 'Mid cap',
  small: 'Small cap',
  unclassified: 'Unclassified',
};

function MarketCapSplitCard({ split }: { split: MfMarketCapSplit | null }) {
  if (split === null) {
    return (
      <div>
        <SubHeading>Market-cap split</SubHeading>
        <SectionUnavailable
          title="Market-cap split not available"
          reason="The holdings in this snapshot could not be placed on the AMFI market-cap list, so no split can be stated."
        />
      </div>
    );
  }
  return (
    <div>
      <SubHeading>Market-cap split</SubHeading>
      <Card tone="flat">
        <CardContent className="grid grid-cols-2 gap-5 p-5 sm:grid-cols-4">
          {(Object.keys(MARKET_CAP_LABEL) as Array<keyof MfMarketCapSplit>).map((k) => (
            <MetricStat
              key={k}
              label={MARKET_CAP_LABEL[k]}
              // `unclassified` is reported, never folded into another bucket —
              // hiding it would silently inflate whichever bucket absorbed it.
              hint={k === 'unclassified' ? 'ISINs we could not place, reported rather than hidden' : undefined}
            >
              {split[k] === null ? (
                <span
                  data-metric-value
                  data-status="INSUFFICIENT_DATA"
                  className="text-[12px] text-muted-foreground"
                >
                  Not available — not disclosed
                </span>
              ) : (
                <span data-metric-value data-status="OK" className="numeric tabular-nums">
                  {formatPct(split[k]!, 1)}
                </span>
              )}
            </MetricStat>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SectorWeights({
  weights,
  active,
}: {
  weights: Record<string, Pct> | null;
  active: Record<string, Pct> | null;
}) {
  if (weights === null || Object.keys(weights).length === 0) {
    return (
      <div>
        <SubHeading>Sector weights</SubHeading>
        <SectionUnavailable
          title="Sector weights not available"
          reason="The snapshot for this scheme carries no sector classification for its holdings."
        />
      </div>
    );
  }
  // Sorting needs a numeric comparison; geometry-only use of the Decimal value,
  // and every weight rendered below is formatted from the string.
  const rows = Object.entries(weights).sort(
    (a, b) => ratioToChartNumber(b[1]) - ratioToChartNumber(a[1]),
  );
  const top = ratioToChartNumber(rows[0]?.[1] ?? null);

  return (
    <div>
      <SubHeading>Sector weights</SubHeading>
      <Card tone="flat">
        <CardContent className="space-y-2 p-5">
          {rows.map(([sector, weight]) => {
            const activeWeight = active?.[sector];
            return (
              <div key={sector} className="flex items-center gap-3" data-sector={sector}>
                <span className="w-40 shrink-0 truncate text-[12px] text-foreground">{sector}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span
                    className="block h-full rounded-full bg-accent/60"
                    style={{ width: top > 0 ? `${(ratioToChartNumber(weight) / top) * 100}%` : '0%' }}
                  />
                </span>
                <span
                  data-metric-value
                  data-status="OK"
                  className="w-16 shrink-0 text-right numeric tabular-nums text-[12px]"
                >
                  {formatPct(weight, 1)}
                </span>
                <span className="w-24 shrink-0 text-right text-[11px] text-muted-foreground">
                  {activeWeight === undefined ? (
                    'no active wt.'
                  ) : (
                    <>vs bench {formatPct(activeWeight, 1)}</>
                  )}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function TopHoldings({ holdings }: { holdings: MfCurrentProfile['topHoldings'] }) {
  if (holdings.length === 0) {
    return (
      <div>
        <SubHeading>Top holdings</SubHeading>
        <SectionUnavailable
          title="Top holdings not available"
          reason="No security-level lines were present in the snapshot we hold for this scheme."
        />
      </div>
    );
  }
  return (
    <div>
      <SubHeading>Top holdings</SubHeading>
      <Card tone="flat">
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead>
              <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Security</th>
                <th className="px-4 py-2.5 font-medium">Kind</th>
                <th className="px-4 py-2.5 font-medium">Sector</th>
                <th className="px-4 py-2.5 font-medium">Cap</th>
                <th className="px-4 py-2.5 text-right font-medium">Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {holdings.map((h, i) => (
                <tr key={`${h.isin ?? h.securityName}-${i}`} data-holding={h.securityName}>
                  <td className="px-4 py-2">
                    <span className="font-medium text-foreground">{h.securityName}</span>
                    {h.isin && (
                      <span className="ml-2 text-[11px] text-muted-foreground">{h.isin}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{h.kind}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {h.sector ?? <span className="italic">unclassified</span>}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {h.marketCapBucket ?? <span className="italic">unclassified</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span data-metric-value data-status="OK" className="numeric tabular-nums">
                      {formatPct(h.weightPct, 2)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

const CREDIT_LABEL: Record<keyof MfCreditQualitySplit, string> = {
  sov: 'Sovereign',
  aaa: 'AAA',
  aaPlus: 'AA+',
  aa: 'AA',
  aaMinus: 'AA-',
  aAndBelow: 'A and below',
  unrated: 'Unrated',
};

/**
 * Debt-only block. Rendered only when the fund actually reports debt
 * characteristics — an equity fund has no duration, and stating "Not available"
 * for one would be as misleading as stating zero.
 */
function DebtProfile({ profile }: { profile: MfCurrentProfile }) {
  const hasDebt =
    profile.modifiedDuration !== null ||
    profile.averageMaturityYears !== null ||
    profile.ytmPct !== null ||
    profile.creditQualitySplit !== null;
  if (!hasDebt) return null;

  const split = profile.creditQualitySplit;
  return (
    <div data-testid="mf-debt-profile">
      <SubHeading>Debt profile</SubHeading>
      <Card tone="flat">
        <CardContent className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
            <MetricStat
              label="Modified duration"
              hint={
                profile.durationIsApproximated
                  ? 'Weighted from holding maturities — the AMC did not disclose it'
                  : undefined
              }
            >
              <RatioStat value={profile.modifiedDuration} path="modifiedDuration" profile={profile} />
            </MetricStat>
            <MetricStat label="Average maturity">
              <RatioStat
                value={profile.averageMaturityYears}
                path="averageMaturityYears"
                profile={profile}
              />
            </MetricStat>
            <MetricStat label="YTM">
              <PctStat value={profile.ytmPct} path="ytmPct" profile={profile} />
            </MetricStat>
            <MetricStat label="Below AA">
              <PctStat value={profile.belowAAPct} path="belowAAPct" profile={profile} />
            </MetricStat>
            <MetricStat label="Largest issuer">
              <PctStat value={profile.topIssuerPct} path="topIssuerPct" profile={profile} />
            </MetricStat>
          </div>

          {split === null ? (
            <p
              data-metric-value
              data-status="INSUFFICIENT_DATA"
              className="text-[12px] text-muted-foreground"
            >
              Not available — the snapshot carries no credit-rating breakdown
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
              {(Object.keys(CREDIT_LABEL) as Array<keyof MfCreditQualitySplit>).map((k) => (
                <MetricStat key={k} label={CREDIT_LABEL[k]}>
                  {split[k] === null ? (
                    <span
                      data-metric-value
                      data-status="INSUFFICIENT_DATA"
                      className="text-[11px] text-muted-foreground"
                    >
                      Not available — not disclosed
                    </span>
                  ) : (
                    <span data-metric-value data-status="OK" className="numeric tabular-nums text-[13px]">
                      {formatPct(split[k]!, 1)}
                    </span>
                  )}
                </MetricStat>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="font-display text-[22px] leading-none text-foreground">{children}</h2>;
}

function SubHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}
