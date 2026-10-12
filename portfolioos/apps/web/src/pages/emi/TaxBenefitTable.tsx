import type { EmiTaxSummary } from '@everypaisa/shared';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CARRIED_FORWARD_LABEL, moneyWhole } from './emiState';

/** Per-FY tax benefit: a small table from `sm` up, stacked rows below so nothing scrolls sideways. */
export function TaxBenefitTable({ tax, letOut }: { tax: EmiTaxSummary; letOut: boolean }) {
  const wide = useMediaQuery('(min-width: 640px)');
  return (
    <Card data-testid="tax-table" className="overflow-hidden">
      <CardHeader className="pb-2"><CardTitle className="text-base">Tax benefit by year</CardTitle></CardHeader>
      <CardContent className="p-0 pb-2">
        {wide ? (
          <table className="w-full table-fixed text-sm tabular-nums">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-2 py-2 text-left font-medium">FY</th>
                <th className="px-2 py-2 text-right font-medium">Interest deduction</th>
                <th className="px-2 py-2 text-right font-medium">Principal (80C)</th>
                <th className="px-2 py-2 text-right font-medium">Tax saved</th>
                {letOut && <th className="px-2 py-2 text-right font-medium">{CARRIED_FORWARD_LABEL}</th>}
              </tr>
            </thead>
            <tbody>
              {tax.years.map((y) => (
                <tr key={y.fy} className="border-b last:border-b-0">
                  <td className="whitespace-nowrap px-2 py-1.5">FY {y.fy}</td>
                  <td className="px-2 py-1.5 text-right">{moneyWhole(y.interestDeduction)}</td>
                  <td className="px-2 py-1.5 text-right">{moneyWhole(y.principalDeduction)}</td>
                  <td className="px-2 py-1.5 text-right">{moneyWhole(y.taxSaved)}</td>
                  {letOut && <td className="px-2 py-1.5 text-right">{moneyWhole(y.carriedForward)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <ul className="divide-y text-xs tabular-nums">
            {tax.years.map((y) => (
              <li key={y.fy} className="space-y-0.5 px-3 py-2">
                <div className="flex justify-between gap-2 text-sm"><span className="font-medium">FY {y.fy}</span><span><span className="mr-1 text-xs text-muted-foreground">Tax saved</span>{moneyWhole(y.taxSaved)}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Interest deduction</span><span>{moneyWhole(y.interestDeduction)}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Principal (80C)</span><span>{moneyWhole(y.principalDeduction)}</span></div>
                {letOut && <div className="flex justify-between gap-2"><span className="min-w-0 text-muted-foreground">{CARRIED_FORWARD_LABEL}</span><span>{moneyWhole(y.carriedForward)}</span></div>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
