/**
 * Insurance statement renderer — covers both life-insurance and
 * general-insurance txn formats. Both arrays share `txnId`, `amount`,
 * `narration`, `type`, `transactionDateTime`.
 */

import { useMemo } from 'react';
import {
  asArray,
  asNumber,
  asString,
  fmtDateTime,
  fmtMoney,
  IntTile,
  isObj,
  MoneyTile,
  Pill,
  SectionHeader,
} from '@/pages/mutualFunds/finvu/shared';

type Tone = 'positive' | 'negative' | 'neutral' | 'accent';
const TYPE_TONES: Record<string, Tone> = {
  PREMIUM_PAYMENT: 'negative',
  DEBIT: 'negative',
  BONUS: 'positive',
  CREDIT: 'positive',
  CLAIM: 'positive',
  REFUND: 'positive',
};

export function InsuranceStatementView({ data, label }: { data: unknown; label: string }) {
  const rows = useMemo(() => {
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    if (isObj(data) && Array.isArray(data['rows'])) return data['rows'] as Record<string, unknown>[];
    return [];
  }, [data]);

  const totals = useMemo(() => {
    let debits = 0;
    let credits = 0;
    let debitAmt = 0;
    let creditAmt = 0;
    for (const r of rows) {
      const t = (asString(r['type']) ?? '').toUpperCase();
      const amt = asNumber(r['amount']) ?? 0;
      const tone = TYPE_TONES[t] ?? 'neutral';
      if (tone === 'negative') {
        debits += 1;
        debitAmt += amt;
      } else if (tone === 'positive') {
        credits += 1;
        creditAmt += amt;
      }
    }
    return { debits, credits, debitAmt, creditAmt };
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-border/70 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
        No transactions in this response.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <SectionHeader title={`${label} statement`} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <IntTile label="Total txns" value={rows.length} />
          <MoneyTile label="Premiums / debits" value={totals.debitAmt} hint={`${totals.debits} rows`} />
          <MoneyTile label="Credits / bonuses" value={totals.creditAmt} hint={`${totals.credits} rows`} />
          <MoneyTile
            label="Net flow"
            value={totals.creditAmt - totals.debitAmt}
            hint="credits − debits"
          />
        </div>
      </div>

      <div className="rounded-xl border border-border/70 overflow-hidden bg-card/40">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-[10.5px] uppercase tracking-kerned text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Narration</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <Row key={asString(r['txnId']) ?? i} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Row({ row }: { row: Record<string, unknown> }) {
  const t = (asString(row['type']) ?? '').toUpperCase();
  const tone: Tone = TYPE_TONES[t] ?? 'neutral';
  return (
    <tr className="border-b last:border-0 hover:bg-muted/20">
      <td className="px-3 py-2.5 align-top">
        <div className="text-sm">{fmtDateTime(row['transactionDateTime'])}</div>
        <div className="text-[10.5px] text-muted-foreground font-mono">
          {asString(row['txnId']) ?? ''}
        </div>
      </td>
      <td className="px-3 py-2.5 align-top">
        <Pill tone={tone} size="xs">{t || '—'}</Pill>
      </td>
      <td className="px-3 py-2.5 align-top">
        <div className="text-foreground">{asString(row['narration']) ?? '—'}</div>
      </td>
      <td className="px-3 py-2.5 text-right align-top">
        <div
          className={`tabular-nums font-medium ${
            tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : ''
          }`}
        >
          {fmtMoney(row['amount'])}
        </div>
      </td>
    </tr>
  );
}
