import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Calculator, Loader2, TrendingDown } from 'lucide-react';
import { formatDateIST, type LoanMarketCheckWire, type LoanRateType } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loansApi, type LoanDTO } from '@/api/loans/loans.api';
import { apiErrorMessage } from '@/api/client';
import { moneyWhole } from '@/pages/emi/emiState';
import { DEFAULT_SWITCHING_INPUT, benchmarkLine, calculatorHref, cardModel, type SwitchingInput } from './marketCheck';

/** spec s6.2: the loan against today's lowest market rate, net of switching costs. ACTIVE loans only. */
export function MarketCheckCard({ loan }: { loan: Pick<LoanDTO, 'id' | 'status'> }) {
  const qc = useQueryClient();
  const active = loan.status === 'ACTIVE';
  const [costs, setCosts] = useState<SwitchingInput>(DEFAULT_SWITCHING_INPUT);
  const query = useQuery({
    queryKey: ['loan-market-check', loan.id],
    queryFn: () => loansApi.getMarketCheck(loan.id),
    enabled: active,
  });
  const setRateType = useMutation({
    mutationFn: (rateType: LoanRateType) => loansApi.update(loan.id, { rateType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loan', loan.id] });
      qc.invalidateQueries({ queryKey: ['loan-market-check', loan.id] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Couldn't save the rate type")),
  });

  if (!active) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-accent-ink/70" />
          <CardTitle className="text-xl sm:text-2xl">Compare with market</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {query.isLoading ? (
          <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : query.isError || !query.data ? (
          <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
            <span>Couldn't load market rates.</span>
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}>Try again</Button>
          </div>
        ) : (
          <CardBody
            check={query.data}
            costs={costs}
            onCosts={setCosts}
            onRateType={(t) => setRateType.mutate(t)}
            savingRateType={setRateType.isPending}
          />
        )}
      </CardContent>
    </Card>
  );
}

function CardBody({ check, costs, onCosts, onRateType, savingRateType }: {
  check: LoanMarketCheckWire;
  costs: SwitchingInput;
  onCosts: (c: SwitchingInput) => void;
  onRateType: (t: LoanRateType) => void;
  savingRateType: boolean;
}) {
  const model = cardModel(check, costs);
  const href = calculatorHref(check, costs);
  const showCosts = model.kind === 'READY' || model.kind === 'INVALID_COSTS';
  return (
    <>
      <RateTypeLine check={check} onRateType={onRateType} saving={savingRateType} />

      {model.kind === 'NO_MARKET_DATA' && <p data-testid="market-empty" className="text-muted-foreground">No market data for this loan type.</p>}
      {model.kind === 'NO_RATES' && <p data-testid="market-empty" className="text-muted-foreground">Market rates are not available yet.</p>}
      {model.kind === 'CLOSED' && <p data-testid="market-empty" className="text-muted-foreground">Nothing left to refinance on this loan.</p>}

      {(model.kind === 'AT_OR_BELOW' || model.kind === 'INVALID_COSTS' || model.kind === 'READY') && (
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          <p>Your rate <span className="font-medium tabular-nums">{model.current.toFixed(2)}%</span></p>
          <p data-testid="market-rate" className="text-muted-foreground">
            {`Market from ${model.market.minRatePct}% (${model.market.lender}, as of ${formatDateIST(model.market.asOf)})`}
          </p>
        </div>
      )}
      {model.kind === 'AT_OR_BELOW' && (
        <p data-testid="market-empty" className="text-muted-foreground">Your rate is already at or below the lowest market rate.</p>
      )}

      {showCosts && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="switch-processing">Processing fee (%)</Label>
            <Input id="switch-processing" inputMode="decimal" className="mt-1" value={costs.processingPct}
              onChange={(e) => onCosts({ ...costs, processingPct: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="switch-other">Other charges (₹)</Label>
            <Input id="switch-other" inputMode="decimal" className="mt-1" value={costs.otherCharges}
              onChange={(e) => onCosts({ ...costs, otherCharges: e.target.value })} />
          </div>
          {model.kind === 'INVALID_COSTS' && <p className="text-xs text-negative sm:col-span-2">{model.message}</p>}
        </div>
      )}

      {model.kind === 'READY' && (
        <dl className="grid grid-cols-1 gap-x-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-y-1">
          <dt className="mt-1 text-muted-foreground sm:mt-0">New EMI</dt>
          <dd data-testid="market-new-emi" className="tabular-nums sm:text-right">
            {`${moneyWhole(model.result.newEmi)} (now ${moneyWhole(model.result.currentEmi)}) over ${check.remainingMonths} months`}
          </dd>
          <dt className="mt-1 text-muted-foreground sm:mt-0">Interest saved</dt>
          <dd data-testid="market-gross" className="tabular-nums sm:text-right">{moneyWhole(model.result.grossSaving)}</dd>
          <dt className="mt-1 text-muted-foreground sm:mt-0">Switching costs</dt>
          <dd data-testid="market-costs" className="tabular-nums sm:text-right">{moneyWhole(model.result.switchingCost)}</dd>
          <dt className="mt-1 font-medium sm:mt-0">Net saving</dt>
          <dd data-testid="market-net" className={`font-medium tabular-nums sm:text-right ${model.result.netSaving.greaterThan(0) ? 'text-positive' : 'text-negative'}`}>
            {moneyWhole(model.result.netSaving)}
          </dd>
          <dt className="mt-1 text-muted-foreground sm:mt-0">Break-even</dt>
          <dd data-testid="market-break-even" className="sm:text-right">
            {model.result.breakEvenMonth !== null ? `Break-even in month ${model.result.breakEvenMonth}` : 'Switching would not pay off at these costs'}
          </dd>
        </dl>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className="text-[11px] text-muted-foreground">Indicative. Lenders price by credit score, amount and tenure; switching costs are estimates.</p>
        {href !== null && model.kind !== 'INVALID_COSTS' && (
          <Button asChild size="sm" variant="outline">
            <Link to={href}><Calculator className="mr-1 h-4 w-4" />Open in calculator</Link>
          </Button>
        )}
      </div>
    </>
  );
}

function RateTypeLine({ check, onRateType, saving }: { check: LoanMarketCheckWire; onRateType: (t: LoanRateType) => void; saving: boolean }) {
  if (check.rateType === 'UNKNOWN') {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-3 py-2">
        <span>Fixed or floating?</span>
        <Button size="sm" variant="outline" disabled={saving} onClick={() => onRateType('FIXED')}>Fixed</Button>
        <Button size="sm" variant="outline" disabled={saving} onClick={() => onRateType('FLOATING')}>Floating</Button>
        <span className="basis-full text-[11px] text-muted-foreground">Floating loans get an alert when the repo rate or your lender's MCLR changes.</span>
      </div>
    );
  }
  if (check.rateType === 'FIXED') return <p className="text-muted-foreground">Fixed rate - no benchmark alerts.</p>;
  if (check.benchmark === null) {
    // e.g. an MCLR loan with LIC Housing Finance: a tracked lender that publishes no MCLR series.
    return check.rateBenchmark === 'REPO' || check.rateBenchmark === 'MCLR'
      ? <p data-testid="benchmark-line" className="text-muted-foreground">No benchmark data yet.</p>
      : <p className="text-muted-foreground">Set what the rate is linked to (repo or MCLR) in Edit to get change alerts.</p>;
  }
  return (
    <div>
      <p data-testid="benchmark-line">{benchmarkLine(check.benchmark)}</p>
      {check.rateBenchmark === 'MCLR' && check.benchmark.kind === 'REPO' && (
        <p className="text-[11px] text-muted-foreground">Your lender isn't on our MCLR list, so this shows the repo rate.</p>
      )}
    </div>
  );
}
