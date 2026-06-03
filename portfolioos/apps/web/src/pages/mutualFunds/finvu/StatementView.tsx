/**
 * /user-account-statement renderer — KPI tiles + filter chips + txn
 * table with BUY/SELL pills. Aggregates total buy/sell/SIP/lump-sum
 * volume from the raw rows for at-a-glance context.
 */

import { useMemo, useState } from 'react';
import {
  asArray,
  asNumber,
  asString,
  fmtDateTime,
  fmtMoney,
  IntTile,
  isObj,
  KpiTile,
  MoneyTile,
  Pill,
  SectionHeader,
} from './shared';

type TxnFilter = 'ALL' | 'BUY' | 'SELL' | 'SIP_ONLY' | 'DEMAT' | 'SOA';

export function StatementView({ data }: { data: unknown }) {
  const rows = useMemo(() => {
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    if (isObj(data) && Array.isArray(data['rows']))
      return data['rows'] as Record<string, unknown>[];
    if (isObj(data) && Array.isArray(data['transactions']))
      return data['transactions'] as Record<string, unknown>[];
    return [];
  }, [data]);

  const [filter, setFilter] = useState<TxnFilter>('ALL');

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const type = asString(r['type'])?.toUpperCase();
      const mode = asString(r['mode'])?.toUpperCase();
      const isSip = r['isSip'] === true;
      if (filter === 'BUY' && type !== 'BUY') return false;
      if (filter === 'SELL' && type !== 'SELL') return false;
      if (filter === 'SIP_ONLY' && !isSip) return false;
      if (filter === 'DEMAT' && mode !== 'DEMAT') return false;
      if (filter === 'SOA' && mode !== 'SOA') return false;
      return true;
    });
  }, [rows, filter]);

  const totals = useMemo(() => {
    let buys = 0;
    let sells = 0;
    let buyAmt = 0;
    let sellAmt = 0;
    let sipCount = 0;
    for (const r of rows) {
      const type = asString(r['type'])?.toUpperCase();
      const amt = asNumber(r['amount']) ?? 0;
      if (type === 'BUY') {
        buys++;
        buyAmt += amt;
      } else if (type === 'SELL') {
        sells++;
        sellAmt += amt;
      }
      if (r['isSip'] === true) sipCount++;
    }
    return { buys, sells, buyAmt, sellAmt, sipCount };
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
        <SectionHeader title="Statement overview" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <IntTile label="Total txns" value={rows.length} />
          <MoneyTile label="Net buys" value={totals.buyAmt} hint={`${totals.buys} BUY rows`} />
          <MoneyTile
            label="Net sells"
            value={totals.sellAmt}
            hint={`${totals.sells} SELL rows`}
          />
          <KpiTile
            label="Net flow"
            value={fmtMoney(totals.buyAmt - totals.sellAmt)}
            tone={totals.buyAmt - totals.sellAmt >= 0 ? 'positive' : 'negative'}
          />
          <IntTile label="SIP txns" value={totals.sipCount} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['ALL', 'BUY', 'SELL', 'SIP_ONLY', 'DEMAT', 'SOA'] as TxnFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`text-[11px] uppercase tracking-wide px-2.5 py-1 rounded-full border transition-colors ${
              filter === f
                ? 'bg-accent/15 text-accent-ink ring-1 ring-accent/40 border-transparent font-medium'
                : 'border-border text-muted-foreground hover:bg-muted/50'
            }`}
          >
            {f === 'SIP_ONLY' ? 'SIP only' : f === 'ALL' ? 'All' : f}
          </button>
        ))}
        <span className="text-[11px] text-muted-foreground ml-auto">
          {filtered.length} of {rows.length} shown
        </span>
      </div>

      <div className="rounded-xl border border-border/70 overflow-hidden bg-card/40">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-[10.5px] uppercase tracking-kerned text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Scheme</th>
                <th className="px-3 py-2 text-right font-medium">Units</th>
                <th className="px-3 py-2 text-right font-medium">NAV</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-left font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <TxnRow key={asString(r['txnId']) ?? i} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TxnRow({ row }: { row: Record<string, unknown> }) {
  const type = asString(row['type'])?.toUpperCase() ?? 'OTHER';
  const subType = asString(row['subType']);
  const mode = asString(row['mode']);
  const isSip = row['isSip'] === true;
  const tone = type === 'BUY' ? 'positive' : type === 'SELL' ? 'negative' : 'neutral';
  return (
    <tr className="border-b last:border-0 hover:bg-muted/20">
      <td className="px-3 py-2.5 align-top">
        <div className="text-sm">{fmtDateTime(row['transactionDateTime'])}</div>
        <div className="text-[10.5px] text-muted-foreground font-mono">
          {asString(row['txnId']) ?? ''}
        </div>
      </td>
      <td className="px-3 py-2.5 align-top">
        <div className="flex flex-col gap-1">
          <Pill tone={tone} size="xs">
            {type}
          </Pill>
          {subType && (
            <span className="text-[10px] text-muted-foreground uppercase">{subType}</span>
          )}
          {isSip && (
            <Pill tone="accent" size="xs">
              SIP
            </Pill>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5 align-top">
        <div className="text-sm font-medium">
          {asString(row['isinDescription']) ?? asString(row['amc']) ?? '—'}
        </div>
        <div className="text-[10.5px] font-mono text-muted-foreground">
          {asString(row['isin']) ?? ''}
          {asString(row['folioNo']) ? ` · ${asString(row['folioNo'])}` : ''}
        </div>
        {asString(row['narration']) && (
          <div className="text-[10.5px] text-muted-foreground italic mt-1 max-w-md truncate">
            {asString(row['narration'])}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums align-top">
        {asNumber(row['units'])?.toFixed(4) ?? '—'}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums align-top">{fmtMoney(row['nav'])}</td>
      <td className="px-3 py-2.5 text-right align-top">
        <div
          className={`tabular-nums font-medium ${
            tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : ''
          }`}
        >
          {fmtMoney(row['amount'])}
        </div>
        {(asNumber(row['totalTax']) ?? 0) > 0 && (
          <div className="text-[10px] text-muted-foreground">tax {fmtMoney(row['totalTax'])}</div>
        )}
      </td>
      <td className="px-3 py-2.5 align-top">
        <div className="flex flex-col gap-1 items-start">
          {mode && (
            <Pill tone="neutral" size="xs">
              {mode}
            </Pill>
          )}
          {asString(row['dataSource']) && (
            <span className="text-[10px] text-muted-foreground">
              {asString(row['dataSource'])}
            </span>
          )}
          {asString(row['brokerCode']) && (
            <span className="text-[10px] font-mono text-muted-foreground">
              {asString(row['brokerCode'])}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
