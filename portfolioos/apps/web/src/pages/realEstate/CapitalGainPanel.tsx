import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { realEstateApi } from '@/api/realEstate.api';
import { Decimal, formatINR } from '@portfolioos/shared';

interface Props {
  propertyId: string;
}

export function CapitalGainPanel({ propertyId }: Props) {
  const { data: cg, isLoading } = useQuery({
    queryKey: ['real-estate-cg', propertyId],
    queryFn: () => realEstateApi.getCapitalGain(propertyId),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">Computing…</CardContent>
      </Card>
    );
  }

  if (!cg) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Capital gain unavailable — sale or purchase data missing.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Sale price" value={formatINR(cg.salePrice)} />
          <Stat label="Net proceeds" value={formatINR(cg.netSaleProceeds)} sub="after brokerage" />
          <Stat label="Total cost basis" value={formatINR(cg.totalCostBasis)} sub="incl. duties + fees" />
          <Stat
            label="Holding period"
            value={`${cg.holdingMonths} months`}
            sub={cg.isLongTerm ? 'Long-term (≥ 24 mo)' : 'Short-term'}
          />
          <Stat
            label="Owner's share"
            value={`${new Decimal(cg.ownershipShare).times(100).toFixed(0)}%`}
          />
        </div>

        {cg.isLongTerm && cg.hasIndexationChoice ? (
          <>
            <p className="text-xs text-muted-foreground border-t pt-3">
              Bought on or before 23-Jul-2024. Finance Act 2024 lets you choose either method:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <RegimeBox
                title="Option A — Indexed @ 20%"
                gainLabel="Indexed gain"
                gain={cg.indexedGain}
                tax={cg.estimatedTaxIndexed}
                note={
                  cg.ciiBuyYear && cg.ciiSellYear
                    ? `CII ${cg.buyFY} = ${cg.ciiBuyYear} → ${cg.sellFY} = ${cg.ciiSellYear}. Indexed cost: ${formatINR(cg.indexedCost ?? '0')}`
                    : 'CII data unavailable'
                }
              />
              <RegimeBox
                title="Option B — Non-indexed @ 12.5%"
                gainLabel="Gain"
                gain={cg.nonIndexedGain}
                tax={cg.estimatedTaxNonIndexed}
                note="Flat 12.5% rate, no CII adjustment"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Pick whichever produces the lower tax. Final liability depends on surcharge, cess, and your other income — figures here are estimates only.
            </p>
          </>
        ) : cg.isLongTerm ? (
          <>
            <p className="text-xs text-muted-foreground border-t pt-3">
              Bought after 23-Jul-2024 — indexation no longer applies. Flat 12.5% rate under section 112.
            </p>
            <RegimeBox
              title="LTCG @ 12.5%"
              gainLabel="Gain"
              gain={cg.nonIndexedGain}
              tax={cg.estimatedTaxNonIndexed}
              note="No CII indexation post Finance Act 2024"
            />
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground border-t pt-3">
              Short-term (held &lt; 24 months). Taxed at slab rate.
            </p>
            <RegimeBox
              title="STCG (slab rate)"
              gainLabel="Gain"
              gain={cg.nonIndexedGain}
              tax={cg.estimatedTaxNonIndexed}
              note="Estimate at 30% top bracket — actual depends on your slab"
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-base font-semibold tabular-nums mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function RegimeBox({
  title,
  gainLabel,
  gain,
  tax,
  note,
}: {
  title: string;
  gainLabel: string;
  gain: string | null;
  tax: string | null;
  note: string;
}) {
  const isNegative = gain ? new Decimal(gain).isNegative() : false;
  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-1">
      <p className="text-sm font-semibold">{title}</p>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{gainLabel}</span>
        <span className={`tabular-nums ${isNegative ? 'text-negative' : 'text-positive'}`}>
          {gain ? formatINR(gain) : '—'}
        </span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Estimated tax</span>
        <span className="tabular-nums font-medium">{tax ? formatINR(tax) : '—'}</span>
      </div>
      <p className="text-xs text-muted-foreground pt-1">{note}</p>
    </div>
  );
}
