import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDateOnly, formatINR, type EmiWarning } from '@everypaisa/shared';
import { money } from './emiState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CalcMode, CalcOutcome } from './emiState';

type Ok = Extract<CalcOutcome, { ok: true }>;

const WARNING_TEXT: Record<EmiWarning, string> = {
  PREPAYMENT_CAPPED: 'A prepayment was larger than the balance - it was capped and closes the loan.',
  NEGATIVE_AMORTISATION_AVOIDED: 'After a rate rise the old EMI would not cover the interest, so the EMI was raised.',
  PREPAYMENT_AFTER_CLOSE: 'Some prepayments fall after the loan is already repaid and were ignored.',
  RATE_CHANGE_AFTER_CLOSE: 'Some rate changes fall after the loan is already repaid and were ignored.',
};

function Tile({ label, value, testId, strong }: { label: string; value: string; testId?: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div data-testid={testId} className={strong ? 'text-2xl font-semibold tabular-nums' : 'text-base font-medium tabular-nums'}>{value}</div>
    </div>
  );
}

export function EmiResults({ outcome, mode, baseline }: { outcome: Ok; mode: CalcMode; baseline: Ok | null }) {
  const s = outcome.summary;
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {mode === 'MAX_LOAN' && <Tile label="You can borrow" value={money(outcome.principal)} testId="max-loan-value" strong />}
          {mode === 'TENURE' && <Tile label="Loan paid off in" value={tenureText} testId="tenure-value" strong />}
          <Tile label="Monthly EMI" value={money(s.emi)} testId="emi-value" strong={mode === 'EMI'} />
          <Tile label="Total interest" value={money(s.totalInterest)} />
          <Tile label="Total paid" value={money(s.totalPaid)} />
          {mode !== 'TENURE' && <Tile label="Tenure" value={tenureText} />}
          {s.fees.total.gt(0) && <Tile label="Fees + GST" value={money(s.fees.total)} />}
          <Tile label="APR (true yearly cost)" value={`${s.aprPct.toFixed(2)}%`} />
          {saved && saved.gt(0) && <Tile label="Interest saved by prepaying" value={money(saved)} testId="interest-saved" />}
          {s.tax && <Tile label="Tax saved" value={money(s.tax.totalTaxSaved)} />}
          {s.postTaxCost && <Tile label="Cost after tax" value={money(s.postTaxCost)} />}
        </div>
        {s.tax?.note && <p className="text-xs text-muted-foreground">{s.tax.note}</p>}
        {s.warnings.map((w) => <p key={w} className="text-xs text-amber-600 dark:text-amber-400">{WARNING_TEXT[w]}</p>)}

        <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" stroke="none">
                  <Cell fill="hsl(var(--primary))" />
                  <Cell fill="hsl(var(--muted-foreground) / 0.45)" />
                </Pie>
                <Tooltip formatter={(v: number) => formatINR(String(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="h-48 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={balance} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={40} />
                <YAxis tick={{ fontSize: 10 }} width={56} tickFormatter={(v: number) => `${Math.round(v / 100000)}L`} />
                <Tooltip formatter={(v: number) => formatINR(String(v))} />
                <Area dataKey="balance" name="Balance" type="monotone" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
