import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatDateOnly, groupScheduleByFy, type Decimal, type LoanSummary } from '@everypaisa/shared';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { moneyWhole } from './emiState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Group = ReturnType<typeof groupScheduleByFy>[number];
/** Tailwind `sm`: a table from here up, stacked cards below, so nothing scrolls sideways. */
const SM_QUERY = '(min-width: 640px)';

export function ScheduleTable({ summary }: { summary: LoanSummary }) {
  const groups = groupScheduleByFy(summary.schedule);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (fy: string) => setOpen((o) => { const n = new Set(o); if (n.has(fy)) n.delete(fy); else n.add(fy); return n; });
  const hasPrepay = summary.totalPrepaid.gt(0);
  const wide = useMediaQuery(SM_QUERY);

  return (
    <Card data-testid="schedule-card" className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Repayment schedule</CardTitle>
        <p className="text-xs text-muted-foreground">Whole rupees on screen; the PDF and Excel files show paise.</p>
      </CardHeader>
      <CardContent className="p-0">
        {wide ? (
          <table data-testid="schedule-table" className="w-full table-fixed text-sm tabular-nums">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="w-[22%] px-2 py-2 text-left font-medium">Period</th>
                <th className="px-2 py-2 text-right font-medium">EMI paid</th>
                <th className="px-2 py-2 text-right font-medium">Interest</th>
                <th className="px-2 py-2 text-right font-medium">Principal</th>
                {hasPrepay && <th className="px-2 py-2 text-right font-medium">Prepaid</th>}
                <th className="px-2 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <FyRows key={g.fy} group={g} open={open.has(g.fy)} onToggle={() => toggle(g.fy)} hasPrepay={hasPrepay} />
              ))}
            </tbody>
          </table>
        ) : (
          <ul data-testid="schedule-cards" className="divide-y text-sm tabular-nums">
            {groups.map((g) => (
              <FyCards key={g.fy} group={g} open={open.has(g.fy)} onToggle={() => toggle(g.fy)} hasPrepay={hasPrepay} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function FyToggle({ fy, open, onToggle }: { fy: string; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} className="flex items-center gap-1 whitespace-nowrap font-medium">
      {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
      FY {fy}
    </button>
  );
}

function FyRows({ group: g, open, onToggle, hasPrepay }: { group: Group; open: boolean; onToggle: () => void; hasPrepay: boolean }) {
  return (
    <>
      <tr className="border-b bg-muted/40">
        <td className="px-2 py-1.5"><FyToggle fy={g.fy} open={open} onToggle={onToggle} /></td>
        <td className="px-2 py-1.5 text-right">{moneyWhole(g.emi)}</td>
        <td className="px-2 py-1.5 text-right">{moneyWhole(g.interest)}</td>
        <td className="px-2 py-1.5 text-right">{moneyWhole(g.principal)}</td>
        {hasPrepay && <td className="px-2 py-1.5 text-right">{moneyWhole(g.prepayment)}</td>}
        <td className="px-2 py-1.5 text-right">{moneyWhole(g.closing)}</td>
      </tr>
      {open && g.rows.map((r) => (
        <tr key={r.month} className="border-b text-xs">
          <td className="px-2 py-1 pl-7">{formatDateOnly(r.date)}</td>
          <td className="px-2 py-1 text-right">{moneyWhole(r.emi)}</td>
          <td className="px-2 py-1 text-right">{moneyWhole(r.interest)}</td>
          <td className="px-2 py-1 text-right">{moneyWhole(r.principal)}</td>
          {hasPrepay && <td className="px-2 py-1 text-right">{moneyWhole(r.prepayment)}</td>}
          <td className="px-2 py-1 text-right">{moneyWhole(r.closing)}</td>
        </tr>
      ))}
    </>
  );
}

interface Figures { emi: Decimal; interest: Decimal; principal: Decimal; prepayment: Decimal; closing: Decimal }

/** One stacked card: period + balance on the first line, the rest in a 2-column grid. */
function StackedRow({ period, figures, hasPrepay, group }: { period: ReactNode; figures: Figures; hasPrepay: boolean; group?: boolean }) {
  const cell = (k: string, v: Decimal) => (
    <div className="flex min-w-0 justify-between gap-2"><span className="text-muted-foreground">{k}</span><span>{moneyWhole(v)}</span></div>
  );
  return (
    <div className={`space-y-1 px-3 py-2 ${group ? 'bg-muted/40' : 'text-xs'}`}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">{period}</div>
        <div className="whitespace-nowrap"><span className="mr-1 text-xs text-muted-foreground">Balance</span>{moneyWhole(figures.closing)}</div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
        {cell('EMI', figures.emi)}
        {cell('Interest', figures.interest)}
        {cell('Principal', figures.principal)}
        {hasPrepay && cell('Prepaid', figures.prepayment)}
      </div>
    </div>
  );
}

function FyCards({ group: g, open, onToggle, hasPrepay }: { group: Group; open: boolean; onToggle: () => void; hasPrepay: boolean }) {
  return (
    <li>
      <StackedRow period={<FyToggle fy={g.fy} open={open} onToggle={onToggle} />} figures={g} hasPrepay={hasPrepay} group />
      {open && (
        <ul className="divide-y border-t">
          {g.rows.map((r) => (
            <li key={r.month}>
              <StackedRow period={<span className="pl-5">{formatDateOnly(r.date)}</span>} figures={r} hasPrepay={hasPrepay} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
