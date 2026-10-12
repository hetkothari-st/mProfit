import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { TaxInputWire } from '@everypaisa/shared';
import { Download, FileSpreadsheet, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { emiApi } from '@/api/emi.api';
import { copyText } from '@/pages/split/clipboard';
import { apiErrorMessage } from '@/api/client';
import { CalculateTab } from './CalculateTab';
import { CompareTab } from './CompareTab';
import { defaultCalcState, defaultCompareState, type CalcOutcome, type CalcState, type CompareState } from './emiState';
import { decodeEmiUrl, encodeEmiUrl, type EmiTab } from './emiUrl';

export function EmiCalculatorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initial = useRef(decodeEmiUrl(location.search));
  const [tab, setTab] = useState<EmiTab>(initial.current.tab);
  const [calc, setCalc] = useState<CalcState>(initial.current.calc ?? defaultCalcState());
  const [compare, setCompare] = useState<CompareState>(initial.current.compare ?? defaultCompareState());
  const [outcome, setOutcome] = useState<CalcOutcome | null>(null);
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);

  useEffect(() => {
    if (initial.current.error) toast.error(initial.current.error);
  }, []);

  // Keep the address bar shareable without adding history entries per keystroke.
  useEffect(() => {
    const t = setTimeout(() => navigate({ search: `?${encodeEmiUrl(tab, calc, compare)}` }, { replace: true }), 400);
    return () => clearTimeout(t);
  }, [tab, calc, compare, navigate]);

  const onOutcome = useCallback((o: CalcOutcome) => setOutcome(o), []);
  // Stable identity so CompareTab's memo does not recompute every render.
  const compareTax = useMemo<TaxInputWire | undefined>(
    () => (calc.taxOn ? { regime: calc.regime, loanKind: calc.loanKind, slabPct: calc.slabPct, remaining80C: calc.remaining80C } : undefined),
    [calc.taxOn, calc.regime, calc.loanKind, calc.slabPct, calc.remaining80C],
  );

  async function share() {
    const url = `${window.location.origin}/emi?${encodeEmiUrl(tab, calc, compare)}`;
    const ok = await copyText(url);
    if (ok) toast.success('Link copied');
    else toast.error("Couldn't copy - copy the address bar instead");
  }

  async function doExport(format: 'pdf' | 'xlsx') {
    if (!outcome?.ok) return;
    setExporting(format);
    try {
      await emiApi.export(format, { input: outcome.wire, tax: outcome.taxWire, title: 'Loan' });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Couldn't create the file"));
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        title="EMI Calculator"
        description="Plan a loan: EMI, prepayments, rate changes, fees, tax benefit and offers side by side."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={share}><Link2 className="mr-1 h-4 w-4" />Share</Button>
            <Button type="button" variant="outline" size="sm" disabled={!outcome?.ok || exporting !== null || tab !== 'calculate'} onClick={() => doExport('pdf')}>
              <Download className="mr-1 h-4 w-4" />PDF
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!outcome?.ok || exporting !== null || tab !== 'calculate'} onClick={() => doExport('xlsx')}>
              <FileSpreadsheet className="mr-1 h-4 w-4" />Excel
            </Button>
          </div>
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as EmiTab)}>
        <TabsList>
          <TabsTrigger value="calculate">Calculate</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
        </TabsList>
        <TabsContent value="calculate" className="mt-4">
          <CalculateTab state={calc} onChange={setCalc} onOutcome={onOutcome} />
        </TabsContent>
        <TabsContent value="compare" className="mt-4">
          <CompareTab state={compare} firstEmiDate={calc.firstEmiDate} tax={compareTax} onChange={setCompare} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
