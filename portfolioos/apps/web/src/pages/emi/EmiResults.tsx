import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDateOnly, formatINR, type EmiWarning } from '@everypaisa/shared';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { compactInr, money, moneyWhole } from './emiState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CalcMode, CalcOutcome } from './emiState';

const TOOLTIP_PROPS = {
  contentStyle: { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12, padding: '10px 12px' },
  labelStyle: { color: 'hsl(var(--muted-foreground))', marginBottom: 4, fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.1em' },
  itemStyle: { color: 'hsl(var(--foreground))' },
};

type Ok = Extract<CalcOutcome, { ok: true }>;

const WARNING_TEXT: Record<EmiWarning, string> = {
  PREPAYMENT_CAPPED: 'A prepayment was larger than the balance - it was capped and closes the loan.',
  NEGATIVE_AMORTISATION_AVOIDED: 'After a rate rise the old EMI would not cover the interest, so the EMI was raised.',
  PREPAYMENT_AFTER_CLOSE: 'Some prepayments fall after the loan is already repaid and were ignored.',
  RATE_CHANGE_AFTER_CLOSE: 'Some rate changes fall after the loan is already repaid and were ignored.',
  TENURE_CAPPED: 'The rate rise would stretch the loan past 40 years, so the EMI was raised to finish by then.',
};

function Tile({ label, value, testId, strong, sub }: { label: string; value: string; testId?: string; strong?: boolean; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        data-testid={testId}
        title={value}
        className={`overflow-hidden text-ellipsis whitespace-nowrap tabular-nums ${strong ? 'text-lg font-semibold sm:text-xl xl:text-2xl' : 'text-base font-medium'}`}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground tabular-nums">{sub}</div>}
    </div>
  );
}

export function EmiResults({ outcome, mode, baseline }: { outcome: Ok; mode: CalcMode; baseline: Ok | null }) {
  const s = outcome.summary;
  // Phones get whole rupees so crore-size tiles fit; paise from `sm` up.
  const tileMoney = useMediaQuery('(min-width: 640px)') ? money : moneyWhole;
  const years = Math.floor(s.months / 12);
  const rest = s.months % 12;
  const tenureText = `${years ? `${years} yr ` : ''}${rest ? `${rest} mo` : ''}`.trim();
  const saved = baseline ? baseline.summary.totalInterest.minus(s.totalInterest) : null;
  const pie = [
    { name: 'Principal', value: outcome.principal.toNumber() },
    { name: 'Interest', value: s.totalInterest.toNumber() },
  ];
  // Chart coordinates only; every displayed figure comes from Decimal.
  const balance = s.schedule.filter((_, i) => i % 3 === 0 || i === s.schedule.length - 1)
    .map((r) => ({ date: formatDateOnly(r.date), balance: r.closing.toNumber() }));

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Result</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {mode === 'MAX_LOAN' && <Tile label="You can borrow" value={tileMoney(outcome.principal)} testId="max-loan-value" strong />}
          {mode === 'TENURE' && <Tile label="Loan paid off in" value={tenureText} testId="tenure-value" strong />}
          <Tile label="Monthly EMI" value={tileMoney(s.emi)} testId="emi-value" strong={mode === 'EMI'} />
          <Tile label="Total interest" value={tileMoney(s.totalInterest)} />
          <Tile label="Total paid" value={tileMoney(s.totalPaid)} />
          {mode !== 'TENURE' && <Tile label="Tenure" value={tenureText} />}
          {s.fees.total.gt(0) && <Tile label="Fees + GST" value={tileMoney(s.fees.total)} />}
          <Tile label="APR (true yearly cost)" value={`${s.aprPct.toFixed(2)}%`} sub={`nominal ${s.nominalPct.toFixed(2)}% p.a.`} testId="apr-value" />
          {saved && saved.gt(0) && <Tile label="Interest saved by prepaying" value={tileMoney(saved)} testId="interest-saved" />}
          {s.tax && <Tile label="Tax saved" value={tileMoney(s.tax.totalTaxSaved)} />}
          {s.postTaxCost && <Tile label="Cost after tax" value={tileMoney(s.postTaxCost)} />}
        </div>
        {s.tax?.note && <p className="text-xs text-muted-foreground">{s.tax.note}</p>}
        {s.warnings.map((w) => <p key={w} className="text-xs text-amber-600 dark:text-amber-400">{WARNING_TEXT[w]}</p>)}

        <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
          <div>
            <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" stroke="none">
                  <Cell fill="hsl(var(--primary))" />
                  <Cell fill="hsl(var(--muted-foreground) / 0.45)" />
                </Pie>
                <Tooltip {...TOOLTIP_PROPS} formatter={(v: number) => formatINR(String(v))} />
              </PieChart>
            </ResponsiveContainer>
            </div>
            <ul className="mt-2 space-y-1 text-xs">
              <li className="flex items-center justify-between gap-2 whitespace-nowrap"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: 'hsl(var(--primary))' }} />Principal</span><span className="tabular-nums">{money(outcome.principal)}</span></li>
              <li className="flex items-center justify-between gap-2 whitespace-nowrap"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: 'hsl(var(--muted-foreground) / 0.45)' }} />Interest</span><span className="tabular-nums">{money(s.totalInterest)}</span></li>
            </ul>
          </div>
          <div className="h-48 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={balance} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10 }} width={56} tickFormatter={compactInr} />
                <Tooltip {...TOOLTIP_PROPS} formatter={(v: number) => formatINR(String(v))} />
                <Area dataKey="balance" name="Balance" type="monotone" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
