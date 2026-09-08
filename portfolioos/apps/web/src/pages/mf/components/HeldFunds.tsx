import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import type { MfHeldFundDto, MfSchemeScoreDto } from '@portfolioos/shared';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { SectionUnavailable } from './MetricValue';
import { Riskometer } from './Riskometer';
import {
  MoneyCell,
  NullablePctCell,
  NullableRatioPctCell,
  RatioPctCell,
  UnitsCell,
} from './MetricCells';
import { formatRatio, known, resolveWithStatus } from '../mfFormat';

/**
 * Every scheme held, with the comparison that is the point of this page:
 * **the user's own XIRR beside the fund's CAGR over the same window.**
 *
 * No fund website can show that pairing, because none of them know when the
 * user actually bought. The gap between the two is `timingGap`, and the
 * contract is emphatic about how it must be presented: *"Reported, never
 * moralised"* (`MfHeldFundDto.timingGap`, `04 §1`). So the column is labelled
 * "timing", carries a plain explanation of what a negative number means, and
 * gets no red styling, no warning icon and no verb. A fund that fell and was
 * bought into on the way down produces a negative gap; telling the holder they
 * were wrong to average down is a judgement this page has no basis for.
 *
 * `userXirr` arrives with `userXirrStatus` + `userXirrStatusReason` rather than
 * as a bare nullable, because "the solver did not converge" and "you have only
 * ever bought, so there are no flows of opposite sign" are different facts and
 * a reader can act on the difference. `fundCagrSamePeriod` has no status field —
 * it is null when we have no NAV at the user's first purchase date — so the
 * reason is stated at the call site, quoting what the null means.
 */
export function HeldFunds({ funds }: { funds: MfHeldFundDto[] }) {
  if (funds.length === 0) {
    return (
      <section data-testid="mf-held-funds">
        <SectionHeading>Funds you hold</SectionHeading>
        <SectionUnavailable
          title="No mutual fund holdings in this view"
          reason="Nothing on this page is computed from an empty book — the totals above are zero because there is nothing to total, not because a figure could not be measured. Import a CAS or add a fund transaction to populate it."
        />
      </section>
    );
  }

  return (
    <section data-testid="mf-held-funds" className="space-y-3">
      <SectionHeading>Funds you hold</SectionHeading>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        <strong className="font-medium text-foreground">Your XIRR</strong> is computed from your
        actual cash flows — every purchase, SIP instalment, redemption and payout — with today&apos;s
        value as the closing flow.{' '}
        <strong className="font-medium text-foreground">Fund CAGR</strong> is what a single lump sum
        on the day you first bought would have returned. The difference is timing, and it is stated
        rather than judged: buying into a fall depresses it and says nothing about whether the
        decision was sound.
      </p>

      <Card tone="flat">
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[1040px] text-[13px]">
            <thead>
              <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Scheme</th>
                <th className="px-4 py-2.5 font-medium">Score</th>
                <th className="px-4 py-2.5 text-right font-medium">Units</th>
                <th className="px-4 py-2.5 text-right font-medium">Invested</th>
                <th className="px-4 py-2.5 text-right font-medium">Value</th>
                <th className="px-4 py-2.5 text-right font-medium">Gain</th>
                <th className="px-4 py-2.5 text-right font-medium">Your XIRR</th>
                <th className="px-4 py-2.5 text-right font-medium">Fund CAGR</th>
                <th className="px-4 py-2.5 text-right font-medium">Timing</th>
                <th className="px-4 py-2.5 text-right font-medium">Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {funds.map((fund) => (
                <FundRow key={fund.schemeCode} fund={fund} />
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </section>
  );
}

function FundRow({ fund }: { fund: MfHeldFundDto }) {
  const userXirr = resolveWithStatus(
    fund.userXirr,
    fund.userXirrStatus,
    fund.userXirrStatusReason,
  );

  return (
    <tr data-scheme={fund.schemeCode} className="align-top">
      <td className="px-4 py-2.5">
        {/* The scheme code, not a holding id — same param the fund detail
            route takes, so the two pages agree on what identifies a fund. */}
        <Link
          to={`/mutual-funds/${encodeURIComponent(fund.schemeCode)}`}
          className="font-medium text-foreground hover:text-accent-ink"
        >
          {fund.meta.schemeName}
        </Link>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {fund.meta.amcName} · {fund.meta.planType} plan
          {fund.sipActive && ' · SIP active'}
          {' · held '}
          {fund.holdingPeriodDays} days
        </p>
      </td>
      <td className="px-4 py-2.5">
        <ScoreChip score={fund.score} />
        {/* `06 §4`: the risk-o-meter must be displayed wherever a scheme is
            presented, and a score is the most prominent presentation this layer
            produces. It is taken from the score's denormalised copy where there
            is one — that is the disclosure which travelled WITH the rating —
            and from the meta otherwise. `null` renders as "not published", not
            as nothing: a risk disclosure that silently disappears reads as a
            low-risk fund. */}
        <Riskometer
          band={fund.score?.riskometer ?? fund.meta.riskometer}
          className="mt-1 flex-wrap gap-1 text-[11px]"
        />
      </td>
      <td className="px-4 py-2.5 text-right">
        <UnitsCell value={fund.units} />
      </td>
      <td className="px-4 py-2.5 text-right">
        <MoneyCell resolved={known(fund.investedValue)} />
      </td>
      <td className="px-4 py-2.5 text-right">
        <MoneyCell resolved={known(fund.currentValue)} />
      </td>
      <td className="px-4 py-2.5 text-right">
        <MoneyCell resolved={known(fund.absoluteGain)} />
        <div className="mt-0.5 text-[11px]">
          <NullablePctCell
            value={fund.absoluteGainPct}
            reason="the invested cost of the open lots is zero, so a percentage of it has no value"
            fractionDigits={1}
            showSign
          />
        </div>
      </td>
      <td className="px-4 py-2.5 text-right">
        <RatioPctCell resolved={userXirr} fractionDigits={2} showSign />
      </td>
      <td className="px-4 py-2.5 text-right">
        <NullableRatioPctCell
          value={fund.fundCagrSamePeriod}
          reason="we hold no NAV for this scheme on the day you first bought it, so there is no like-for-like window"
          fractionDigits={2}
          showSign
        />
      </td>
      <td className="px-4 py-2.5 text-right">
        {/* No colour, no icon. `timingGap` is descriptive by contract. */}
        <NullableRatioPctCell
          value={fund.timingGap}
          reason="one of the two returns it compares could not be computed"
          fractionDigits={2}
          showSign
        />
      </td>
      <td className="px-4 py-2.5 text-right">
        <NullablePctCell
          value={fund.weightInMfPortfolio}
          reason="the mutual fund book has no value to take a share of"
          fractionDigits={1}
        />
        <div className="mt-0.5 text-[11px]">
          <span className="text-muted-foreground">of net worth </span>
          <NullablePctCell
            value={fund.weightInNetWorth}
            // The service leaves this null when the net-worth denominator is
            // unknown or capped. Rendering a share of an unknown whole would
            // be a fabricated ratio, not a small omission.
            reason="your net worth is not fully visible in this view, so a share of it cannot be stated"
            fractionDigits={1}
          />
        </div>
      </td>
    </tr>
  );
}

/**
 * The compact form of `ScoreCard`'s four `ratingStatus` branches.
 *
 * It is a separate component rather than a reuse because a chip and a card are
 * different affordances — the card explains, the chip labels — but the BRANCHES
 * are the same four and none may collapse into "Unrated". A bare "Unrated" does
 * not tell the reader whether to wait six months (`INSUFFICIENT_HISTORY`), look
 * at a different category (`CATEGORY_TOO_SMALL`), or that the scheme is scored
 * elsewhere (`NOT_APPLICABLE`, an IDCW option scored on its growth sibling).
 * The full sentence for each lives on the fund page this chip links to; the
 * chip carries the distinguishing word and the tooltip carries the reason.
 *
 * A null composite is never rendered as 0. `composite` is 0-100 and 0 is a
 * legitimate, catastrophic score.
 */
function ScoreChip({ score }: { score: MfSchemeScoreDto | null }) {
  if (score === null) {
    return (
      <ChipShell status="NOT_SCORED" title="The scoring job has not covered this scheme yet. That is our coverage, not a judgement on the fund.">
        Not scored
      </ChipShell>
    );
  }

  if (score.ratingStatus === 'RATED' && score.composite !== null) {
    return (
      <span className="inline-flex items-center gap-2" data-rating-status="RATED">
        <span className="numeric tabular-nums text-[15px] font-medium text-foreground">
          {formatRatio(score.composite, 1)}
        </span>
        <Stars rating={score.rating} />
      </span>
    );
  }

  if (score.ratingStatus === 'INSUFFICIENT_HISTORY') {
    return (
      <ChipShell
        status="INSUFFICIENT_HISTORY"
        title="Too little NAV history for a rating. The fund page states how many months it has and the date it becomes ratable."
      >
        Unrated · young
      </ChipShell>
    );
  }

  if (score.ratingStatus === 'CATEGORY_TOO_SMALL') {
    return (
      <ChipShell
        status="CATEGORY_TOO_SMALL"
        title="Its SEBI category has too few peers for a percentile to mean anything. The fund's own metrics are unaffected."
      >
        Unrated · thin category
      </ChipShell>
    );
  }

  if (score.ratingStatus === 'NOT_APPLICABLE') {
    return (
      <ChipShell
        status="NOT_APPLICABLE"
        title="Not scored by construction — an IDCW option shares its portfolio with the growth option and is scored once, there."
      >
        Not rated
      </ChipShell>
    );
  }

  // RATED with a null composite is a contract violation. It must not become
  // "0", which reads as the worst fund in the category.
  return (
    <ChipShell
      status="RATED_NO_COMPOSITE"
      title="The score was marked rated but carried no composite. That is a server-side contract violation, not a low score."
    >
      Unavailable
    </ChipShell>
  );
}

function ChipShell({
  status,
  title,
  children,
}: {
  status: string;
  title: string;
  children: string;
}) {
  return (
    <span
      data-rating-status={status}
      title={title}
      className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-px text-[10.5px] text-muted-foreground"
    >
      {children}
    </span>
  );
}

function Stars({ rating }: { rating: MfSchemeScoreDto['rating'] }) {
  if (rating === null) return null;
  return (
    <span className="inline-flex items-center gap-px" aria-label={`${rating} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn('h-3 w-3', n <= rating ? 'fill-accent text-accent' : 'text-muted-foreground/35')}
        />
      ))}
    </span>
  );
}

function SectionHeading({ children }: { children: string }) {
  return <h2 className="font-display text-[22px] leading-none text-foreground">{children}</h2>;
}
