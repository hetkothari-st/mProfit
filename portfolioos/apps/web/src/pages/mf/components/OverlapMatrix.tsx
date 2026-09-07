import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { MfHeldFundDto, MfOverlapPair, MfPortfolioAnalysisDto } from '@portfolioos/shared';
import { Card, CardContent } from '@/components/ui/card';
import { SectionUnavailable } from './MetricValue';
import { PctCell } from './MetricCells';
import { formatIsoDate, known } from '../mfFormat';

/**
 * Pairwise holdings overlap (`04 §2`).
 *
 * ⚠ **`MfOverlapPair.overlapPct` is a `Pct`, not a `Ratio`.** `55.000000` means
 * 55% and is formatted with `formatPct` — no ×100. Its neighbour on the same
 * screen, `MfPortfolioTotals.redundancyScore`, is a `Ratio` and IS a fraction,
 * formatted with `formatRatioAsPct`. The contract says so in as many words on
 * `MfOverlapPair`, because an earlier version of that comment got it backwards.
 * The two never share a formatter here; they do not even share a cell component.
 *
 * The "not comparable" note under the table is the honesty state this section
 * needs and the DTO cannot state directly. `overlap.pairs` contains only pairs
 * the service could actually compute — both funds need a `MfPortfolioSnapshot`
 * at a comparable date — so a fund whose holdings we have never ingested simply
 * does not appear, and its absence reads exactly like "it overlaps with
 * nothing". Those are opposite claims. The note names the funds, so a small
 * table is legible as small evidence rather than as a clean bill of health.
 */
export function OverlapMatrix({
  overlap,
  funds,
}: {
  overlap: MfPortfolioAnalysisDto['overlap'];
  funds: MfHeldFundDto[];
}) {
  const compared = new Set<string>();
  for (const p of [...overlap.pairs, ...overlap.debtPairs]) {
    compared.add(p.schemeCodeA);
    compared.add(p.schemeCodeB);
  }
  const uncompared = funds.filter((f) => !compared.has(f.schemeCode));

  const hasPairs = overlap.pairs.length > 0 || overlap.debtPairs.length > 0;

  return (
    <section data-testid="mf-overlap" className="space-y-4">
      <h2 className="font-display text-[22px] leading-none text-foreground">Overlap</h2>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        For each pair of funds, the share of their portfolios made up of the same securities —
        Σ min(weight in A, weight in B) over common holdings. Two funds in the same sub-category
        that overlap heavily are one position wearing two names, and you pay two expense ratios
        for it.
      </p>

      {!hasPairs ? (
        <SectionUnavailable
          title="No pair could be compared"
          reason="Overlap needs a holdings disclosure for both funds in a pair, at dates close enough to compare. We hold that for fewer than two of your funds, so no pair exists to measure — this is a gap in the snapshots we have ingested, not a finding that your funds are unrelated."
        />
      ) : (
        <>
          {overlap.pairs.length > 0 && (
            <PairTable
              title="Equity funds"
              caption="Common ISINs across the two portfolios."
              pairs={overlap.pairs}
              testId="mf-overlap-equity"
            />
          )}
          {overlap.debtPairs.length > 0 && (
            <PairTable
              title="Debt funds"
              caption="Same formula, computed by issuer rather than by security."
              pairs={overlap.debtPairs}
              testId="mf-overlap-debt"
            />
          )}
        </>
      )}

      {uncompared.length > 0 && (
        <p
          data-testid="mf-overlap-uncompared"
          className="rounded-md border border-dashed border-border/70 bg-muted/30 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground"
        >
          <strong className="font-medium text-foreground">
            {uncompared.length === 1 ? 'One fund is' : `${uncompared.length} funds are`} missing from
            this comparison
          </strong>{' '}
          because we hold no usable holdings disclosure for{' '}
          {uncompared.length === 1 ? 'it' : 'them'}:{' '}
          {uncompared.map((f) => f.meta.schemeName).join(', ')}. Their overlap with the rest of your
          book is unknown, not zero — every figure above is therefore a lower bound on how much
          duplication you actually hold.
        </p>
      )}
    </section>
  );
}

function PairTable({
  title,
  caption,
  pairs,
  testId,
}: {
  title: string;
  caption: string;
  pairs: MfOverlapPair[];
  testId: string;
}) {
  return (
    <div data-testid={testId}>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <p className="mb-2 text-[11.5px] text-muted-foreground">{caption}</p>
      <Card tone="flat">
        <CardContent className="p-0">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Pair</th>
                <th className="px-4 py-2.5 text-right font-medium">Overlap</th>
                <th className="px-4 py-2.5 font-medium">Snapshots</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {pairs.map((pair) => (
                <PairRow key={`${pair.schemeCodeA}-${pair.schemeCodeB}`} pair={pair} />
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function PairRow({ pair }: { pair: MfOverlapPair }) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <>
      <tr data-overlap-pair={`${pair.schemeCodeA}|${pair.schemeCodeB}`}>
        <td className="px-4 py-2.5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-start gap-1.5 text-left"
            aria-expanded={open}
          >
            <Chevron className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span>
              <span className="font-medium text-foreground">{pair.schemeNameA}</span>
              <span className="text-muted-foreground"> &amp; </span>
              <span className="font-medium text-foreground">{pair.schemeNameB}</span>
              {pair.sameSubCategory && (
                <span className="ml-2 rounded-full border border-amber-400/50 bg-amber-400/10 px-1.5 py-px text-[9.5px] font-medium uppercase tracking-kerned text-amber-700 dark:text-amber-300">
                  Same sub-category
                </span>
              )}
            </span>
          </button>
        </td>
        <td className="px-4 py-2.5 text-right">
          {/* Pct in, Pct out. See the module header. */}
          <PctCell resolved={known(pair.overlapPct)} fractionDigits={1} />
        </td>
        <td className="px-4 py-2.5 text-[11px] text-muted-foreground">
          {/* Both dates, always. The formula compares two portfolios as
              disclosed on possibly different days; hiding that would present a
              near-match as an exact one. */}
          {formatIsoDate(pair.snapshotAsOfA) ?? pair.snapshotAsOfA} ·{' '}
          {formatIsoDate(pair.snapshotAsOfB) ?? pair.snapshotAsOfB}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={3} className="bg-muted/30 px-4 py-3">
            {pair.topShared.length === 0 ? (
              <p className="text-[12px] text-muted-foreground">
                The two portfolios share no security above the reporting threshold, yet the pair was
                still measurable — the overlap figure above is the whole of it.
              </p>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-1 font-medium">Shared holding</th>
                    <th className="py-1 text-right font-medium">Weight in {pair.schemeNameA}</th>
                    <th className="py-1 text-right font-medium">Weight in {pair.schemeNameB}</th>
                  </tr>
                </thead>
                <tbody>
                  {pair.topShared.map((h, i) => (
                    <tr key={`${h.isin ?? h.securityName}-${i}`}>
                      <td className="py-1 text-foreground">
                        {h.securityName}
                        {h.isin && <span className="ml-2 text-muted-foreground">{h.isin}</span>}
                      </td>
                      <td className="py-1 text-right">
                        <PctCell resolved={known(h.weightInA)} fractionDigits={2} />
                      </td>
                      <td className="py-1 text-right">
                        <PctCell resolved={known(h.weightInB)} fractionDigits={2} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
