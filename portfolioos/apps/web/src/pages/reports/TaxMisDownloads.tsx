/**
 * Tax / MIS downloads — one tab housing every tax-and-statement report
 * the user asked for, rendered as PDF + Excel download cards. No inline
 * views: each report is shaped to look right in print form (mProfit-
 * style layout) and would be visually noisy in-app.
 */

import { useState } from 'react';
import { Loader2, FileDown, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { getApiBaseUrl } from '@/api/baseUrl';
import { useAuthStore } from '@/stores/auth.store';

type Param = 'fy' | 'asOf' | 'from' | 'to';

interface ReportDef {
  key: string;
  title: string;
  description: string;
  endpoint: string; // /api/reports/download/<...>
  params: Param[]; // params this report accepts
  filename: string;
}

const REPORTS: ReportDef[] = [
  {
    key: 'grandfathering',
    title: 'Grandfathering LTCG (Sec 112A)',
    description:
      'Pre-31-Jan-2018 equity / equity-MF sales with FMV substitution. Picks the FMV from your stored bhav copy where available; falls back to actual cost.',
    endpoint: 'grandfathering',
    params: ['fy'],
    filename: 'grandfathering-ltcg',
  },
  {
    key: 'demat-holdings',
    title: 'Demat Account-wise Holdings',
    description:
      'Current scheme balances grouped by broker / demat account, with optional dated movement history (opening + in + out + running balance).',
    endpoint: 'demat-holdings',
    params: [],
    filename: 'demat-holdings',
  },
  {
    key: 'm2m',
    title: 'M2M Report — Equity + F&O',
    description:
      'Per-lot unrealised G/L marked against the latest bhav / NAV. Includes Actual / Monthly / Annual ROI and CAGR per open lot.',
    endpoint: 'm2m',
    params: ['asOf'],
    filename: 'm2m',
  },
  {
    key: 'short-long-spec',
    title: 'Short Term / Long Term / Speculation',
    description:
      'Combined capital gain report covering intraday speculation, short-term and long-term equity in one PDF — exactly as the legacy desktop layout.',
    endpoint: 'short-long-spec',
    params: ['fy'],
    filename: 'short-long-speculation',
  },
  {
    key: 'schedule-112a',
    title: 'Income Tax — Schedule 112A',
    description:
      'ITR-2 / ITR-3 ready Schedule 112A export: one row per LTCG sale of listed equity / equity-MF, in the columns the income-tax portal expects.',
    endpoint: 'schedule-112a',
    params: ['fy'],
    filename: 'itr-schedule-112a',
  },
  {
    key: 'mf-capital-gain',
    title: 'Mutual Fund Capital Gain (Short + Long)',
    description:
      'Mutual-fund-only capital-gain ledger split by holding term, with STCG / LTCG / total in the footer.',
    endpoint: 'mf-capital-gain',
    params: ['fy'],
    filename: 'mf-capital-gain',
  },
  {
    key: 'trial-balance',
    title: 'Trial Balance',
    description:
      'Code · particulars · opening · debit · credit · closing for every account. Balanced double-entry view ready for audit hand-off.',
    endpoint: 'trial-balance',
    params: ['asOf'],
    filename: 'trial-balance',
  },
  {
    key: 'account-ledger',
    title: 'Account Ledger — All Accounts',
    description:
      'Voucher-by-voucher ledger for every account between two dates, with running balance and per-account opening / closing.',
    endpoint: 'account-ledger',
    params: ['from', 'to'],
    filename: 'account-ledger',
  },
  {
    key: 'profit-loss',
    title: 'Profit & Loss Statement',
    description:
      'Classic two-column "To / By" P&L for the period. Adds debit (expenses) and credit (income) sides plus a Net Profit / Loss footer.',
    endpoint: 'profit-loss',
    params: ['from', 'to'],
    filename: 'profit-loss',
  },
  {
    key: 'balance-sheet',
    title: 'Balance Sheet',
    description:
      'Liabilities + Equity vs Assets at a single date. Retained earnings included automatically; totals reconcile at the bottom.',
    endpoint: 'balance-sheet',
    params: ['asOf'],
    filename: 'balance-sheet',
  },
  {
    key: 'daily-transactions',
    title: 'Daily Transactions — Broker Bill Register',
    description:
      'Date-ordered transaction log grouped by broker. Use to reconcile against contract notes and intraday-trading slips.',
    endpoint: 'daily-transactions',
    params: ['from', 'to'],
    filename: 'broker-bill-register',
  },
  {
    key: 'income-report',
    title: 'Income Statement',
    description:
      'Dividends, interest and maturity credits split by category. Backbone of the ITR "Income from other sources" schedule.',
    endpoint: 'income-report',
    params: ['fy'],
    filename: 'income-report',
  },
  {
    key: 'holdings-summary',
    title: 'Portfolio Holdings Summary',
    description:
      'Cross-asset valuation as-of-today — equity, MF, FD, bonds, gold, crypto in one banded report with per-class subtotals and grand total.',
    endpoint: 'holdings-summary',
    params: [],
    filename: 'holdings-summary',
  },
  {
    key: 'performance',
    title: 'XIRR / TWR Performance',
    description:
      'Per-portfolio invested vs current value with absolute return, XIRR and Modified Dietz TWR. Last row rolls up the whole user.',
    endpoint: 'performance',
    params: [],
    filename: 'performance-xirr',
  },
  {
    key: 'tax-summary',
    title: 'Tax Summary (Form 16 helper)',
    description:
      'Annual rollup of intraday, STCG, LTCG, Sec 112A and IFOS income mapped to the cells of ITR-2 / ITR-3.',
    endpoint: 'tax-summary',
    params: ['fy'],
    filename: 'tax-summary',
  },
  {
    key: 'cash-flow',
    title: 'Cash Flow Statement',
    description:
      'Period inflows vs outflows by category. T-account layout with net cash surplus / deficit balancing entry, so both sides tally.',
    endpoint: 'cash-flow',
    params: ['from', 'to'],
    filename: 'cash-flow',
  },
];

function currentFy(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

function fyOptions(): string[] {
  const arr: string[] = [];
  const now = new Date();
  const start = now.getUTCMonth() + 1 >= 4 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  for (let y = start; y >= start - 7; y--) {
    arr.push(`${y}-${String(y + 1).slice(2)}`);
  }
  return arr;
}

export function TaxMisDownloads({ fy: defaultFy }: { fy: string }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const today = new Date().toISOString().slice(0, 10);
  const [fy, setFy] = useState(defaultFy || currentFy());
  const [asOf, setAsOf] = useState(today);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState<string | null>(null);

  async function download(report: ReportDef, format: 'pdf' | 'xlsx') {
    if (!accessToken) {
      alert('Not signed in');
      return;
    }
    setBusy(`${report.key}-${format}`);
    try {
      const params = new URLSearchParams({ format });
      if (report.params.includes('fy') && fy) params.set('fy', fy);
      if (report.params.includes('asOf') && asOf) params.set('asOf', asOf);
      if (report.params.includes('from') && from) params.set('from', from);
      if (report.params.includes('to') && to) params.set('to', to);
      const url = `${getApiBaseUrl()}/api/reports/download/${report.endpoint}?${params.toString()}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${report.filename}-${fy}.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert((e as Error).message ?? 'Download failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="pt-4 flex flex-wrap items-end gap-3">
          <div>
            <Label>Financial year</Label>
            <Select className="mt-1 w-32" value={fy} onChange={(e) => setFy(e.target.value)}>
              {fyOptions().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>As-of date</Label>
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="mt-1 w-40" />
          </div>
          <div>
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-40" />
          </div>
          <div>
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-40" />
          </div>
          <p className="text-[11px] text-muted-foreground ml-auto max-w-md">
            Each report uses whichever subset of these inputs applies to it (shown in the card). Leave any field
            blank to use the report's default range.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {REPORTS.map((r) => (
          <Card key={r.key}>
            <CardContent className="px-5 py-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="grid h-9 w-9 place-items-center rounded-md bg-accent/10 text-accent shrink-0">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">{r.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{r.description}</p>
                  {r.params.length > 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Uses:{' '}
                      {r.params
                        .map((p) =>
                          p === 'fy'
                            ? `FY ${fy}`
                            : p === 'asOf'
                            ? `As of ${asOf || today}`
                            : p === 'from'
                            ? `From ${from || '—'}`
                            : `To ${to || today}`,
                        )
                        .join(' · ')}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === `${r.key}-pdf`}
                  onClick={() => download(r, 'pdf')}
                >
                  {busy === `${r.key}-pdf` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5" />
                  )}
                  PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy === `${r.key}-xlsx`}
                  onClick={() => download(r, 'xlsx')}
                >
                  {busy === `${r.key}-xlsx` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5" />
                  )}
                  Excel
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
