import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, Loader2, Receipt } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toDecimal } from '@portfolioos/shared';
import { taxApi } from '@/api/tax.api';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/cn';

// Derives the current Indian financial year as "YYYY-YY"
function currentFy(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

export function DashboardTaxStrip() {
  const fy = currentFy();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [downloading, setDownloading] = useState(false);

  const { data: summary, isLoading } = useQuery({
    queryKey: ['tax-summary-strip', fy],
    queryFn: () => taxApi.summary(fy),
    // Stale after 10 minutes — tax summary doesn't change often during the day
    staleTime: 10 * 60 * 1000,
  });

  // Don't render while loading or if there are no realised gains this FY
  if (isLoading) return null;
  if (!summary) return null;

  const totalGain = toDecimal(summary.totalRealisedGain);
  const totalTax = toDecimal(summary.totalEstimatedTax);

  // Hide strip entirely when there are no realised gains — nothing useful to show
  if (totalGain.isZero() && totalTax.isZero()) return null;

  const isGainPositive = !totalGain.isNegative();
  const isTaxPositive = totalTax.greaterThan(0);

  // Format as Indian lakhs/crores
  function fmtINR(d: ReturnType<typeof toDecimal>): string {
    const abs = d.abs();
    const neg = d.isNegative();
    let formatted: string;
    if (abs.gte(10_000_000)) {
      formatted = `₹${abs.dividedBy(10_000_000).toDecimalPlaces(2)}Cr`;
    } else if (abs.gte(100_000)) {
      formatted = `₹${abs.dividedBy(100_000).toDecimalPlaces(2)}L`;
    } else {
      formatted = `₹${abs.toDecimalPlaces(0).toNumber().toLocaleString('en-IN')}`;
    }
    return neg ? `-${formatted}` : formatted;
  }

  async function downloadReport() {
    if (!accessToken || downloading) return;
    const url = taxApi.capitalGainsTaxReportUrl(fy);
    setDownloading(true);
    try {
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `capital-gains-tax-${fy}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      // Silently fail on the strip — user can download from the Tax page
    } finally {
      setDownloading(false);
    }
  }

  const stcgGain = toDecimal(summary.capitalGains.section111A_stcgEquity.gain);
  const ltcgGain = toDecimal(summary.capitalGains.section112A_ltcgEquity.gain);
  const ltcgExemption = toDecimal(summary.rates.ltcgEquityExemption);
  const ltcgExemptUsed = ltcgGain.gt(0)
    ? ltcgGain.gte(ltcgExemption) ? ltcgExemption : ltcgGain
    : toDecimal(0);
  const ltcgExemptPct = ltcgExemption.gt(0)
    ? ltcgExemptUsed.dividedBy(ltcgExemption).times(100).toDecimalPlaces(0).toNumber()
    : 0;

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/60 px-3 py-2.5 text-xs">
      {/* Left — icon + label */}
      <div className="flex items-center gap-2 shrink-0">
        <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
          Tax · FY {fy}
        </span>
      </div>

      {/* Middle — stats */}
      <div className="flex items-center gap-4 overflow-x-auto flex-1 min-w-0">
        {/* Realised gain */}
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="text-muted-foreground">Realised gain</span>
          <span className={cn('font-mono tabular-nums font-medium',
            isGainPositive ? 'text-positive' : 'text-negative'
          )}>
            {fmtINR(totalGain)}
          </span>
        </span>

        {/* Divider */}
        <span className="text-border shrink-0">·</span>

        {/* Estimated tax */}
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="text-muted-foreground">Est. tax</span>
          <span className={cn('font-mono tabular-nums font-medium',
            isTaxPositive ? 'text-foreground' : 'text-muted-foreground'
          )}>
            {fmtINR(totalTax)}
          </span>
        </span>

        {/* LTCG exemption used — only show if any LTCG exists */}
        {ltcgGain.gt(0) && (
          <>
            <span className="text-border shrink-0">·</span>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="text-muted-foreground">LTCG exempt</span>
              <span className={cn(
                'font-mono tabular-nums',
                ltcgExemptPct >= 90 ? 'text-amber-600 dark:text-amber-400 font-medium'
                  : ltcgExemptPct >= 100 ? 'text-negative font-medium'
                  : 'text-foreground'
              )}>
                {fmtINR(ltcgExemptUsed)}
                <span className="text-muted-foreground font-normal">
                  {' '}/ {fmtINR(ltcgExemption)}
                </span>
              </span>
            </span>
          </>
        )}

        {/* STCG this FY — only if non-zero */}
        {stcgGain.gt(0) && (
          <>
            <span className="text-border shrink-0">·</span>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="text-muted-foreground">STCG</span>
              <span className="font-mono tabular-nums text-foreground">{fmtINR(stcgGain)}</span>
            </span>
          </>
        )}
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Download PDF */}
        <button
          type="button"
          onClick={downloadReport}
          disabled={downloading}
          title="Download CA-ready tax report (PDF)"
          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium
            border border-border bg-background hover:bg-muted/60 transition-colors
            disabled:opacity-50"
        >
          {downloading
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <FileDown className="h-3 w-3" />
          }
          Report
        </button>

        {/* Link to Tax page */}
        <Link
          to="/tax"
          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium
            border border-border bg-background hover:bg-muted/60 transition-colors"
        >
          Details
          <span className="text-muted-foreground">→</span>
        </Link>
      </div>
    </div>
  );
}
