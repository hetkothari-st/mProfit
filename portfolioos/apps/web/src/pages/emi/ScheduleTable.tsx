import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatDateOnly, groupScheduleByFy, type LoanSummary } from '@everypaisa/shared';
import { money } from './emiState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ScheduleTable({ summary }: { summary: LoanSummary }) {
  const groups = groupScheduleByFy(summary.schedule);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (fy: string) => setOpen((o) => { const n = new Set(o); if (n.has(fy)) n.delete(fy); else n.add(fy); return n; });
  const hasPrepay = summary.totalPrepaid.gt(0);

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Repayment schedule</CardTitle></CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[560px] text-sm tabular-nums">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 text-left font-medium">Period</th>
              <th className="px-3 py-2 text-right font-medium">EMI paid</th>
              <th className="px-3 py-2 text-right font-medium">Interest</th>
              <th className="px-3 py-2 text-right font-medium">Principal</th>
              {hasPrepay && <th className="px-3 py-2 text-right font-medium">Prepaid</th>}
              <th className="px-3 py-2 text-right font-medium">Balance</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <FyRows key={g.fy} group={g} open={open.has(g.fy)} onToggle={() => toggle(g.fy)} hasPrepay={hasPrepay} />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function FyRows({ group: g, open, onToggle, hasPrepay }: { group: ReturnType<typeof groupScheduleByFy>[number]; open: boolean; onToggle: () => void; hasPrepay: boolean }) {
  return (
    <>
      <tr className="border-b bg-muted/40">
        <td className="px-3 py-2">
          <button type="button" onClick={onToggle} aria-expanded={open} className="flex items-center gap-1 font-medium">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            FY {g.fy}
          </button>
        </td>
        <td className="px-3 py-2 text-right">{money(g.emi)}</td>
        <td className="px-3 py-2 text-right">{money(g.interest)}</td>
        <td className="px-3 py-2 text-right">{money(g.principal)}</td>
        {hasPrepay && <td className="px-3 py-2 text-right">{money(g.prepayment)}</td>}
        <td className="px-3 py-2 text-right">{money(g.closing)}</td>
      </tr>
      {open && g.rows.map((r) => (
        <tr key={r.month} className="border-b text-xs">
          <td className="px-3 py-1.5 pl-9">{formatDateOnly(r.date)}</td>
          <td className="px-3 py-1.5 text-right">{money(r.emi)}</td>
          <td className="px-3 py-1.5 text-right">{money(r.interest)}</td>
          <td className="px-3 py-1.5 text-right">{money(r.principal)}</td>
          {hasPrepay && <td className="px-3 py-1.5 text-right">{money(r.prepayment)}</td>}
          <td className="px-3 py-1.5 text-right">{money(r.closing)}</td>
        </tr>
      ))}
    </>
  );
}
