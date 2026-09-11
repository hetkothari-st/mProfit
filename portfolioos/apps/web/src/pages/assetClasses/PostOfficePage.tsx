import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ChevronDown, Landmark, Plus, ArrowUpRight } from 'lucide-react';
import { Decimal, formatINR, type AssetClass, type HoldingRow } from '@everypaisa/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { DownloadReportButton } from '@/components/reports/DownloadReportButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/EmptyState';
import { portfoliosApi } from '@/api/portfolios.api';
import { SCHEMES, SCHEME_ORDER, PO_ASSET_CLASSES, type SchemeType } from '@/lib/poSchemes';
import { PostOfficeFormDialog } from './PostOfficeFormDialog';

type POHolding = HoldingRow & { portfolioName: string; portfolioId: string };

const PO_CLASS_SET = new Set<string>(PO_ASSET_CLASSES);

interface SectionAgg {
  scheme: SchemeType;
  holdings: POHolding[];
  invested: Decimal;
  current: Decimal;
  pnl: Decimal;
}

export function PostOfficePage() {
  const navigate = useNavigate();
  const [formOpen, setFormOpen] = useState(false);
  const [addScheme, setAddScheme] = useState<SchemeType>('NSC');
  const [expanded, setExpanded] = useState<Set<SchemeType> | null>(null);

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: portfoliosApi.list,
  });

  const holdingsQueries = useQueries({
    queries: (portfolios ?? []).map((p) => ({
      queryKey: ['portfolio-holdings', p.id],
      queryFn: () => portfoliosApi.holdings(p.id),
    })),
  });

  const isLoading = !portfolios || holdingsQueries.some((q) => q.isLoading);

  // Flatten PO holdings across portfolios.
  const allHoldings: POHolding[] = useMemo(() => {
    const rows: POHolding[] = [];
    (portfolios ?? []).forEach((p, i) => {
      const hs: HoldingRow[] = holdingsQueries[i]?.data ?? [];
      hs.filter((h) => PO_CLASS_SET.has(h.assetClass))
        .forEach((h) => rows.push({ ...h, portfolioName: p.name, portfolioId: p.id }));
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolios, holdingsQueries.map((q) => q.dataUpdatedAt).join(',')]);

  // Group by scheme, in canonical order, with aggregates.
  const sections: SectionAgg[] = useMemo(() => {
    return SCHEME_ORDER.map((scheme) => {
      const ac = SCHEMES[scheme].assetClass;
      const holdings = allHoldings.filter((h) => h.assetClass === ac);
      const invested = holdings.reduce((s, h) => s.plus(new Decimal(h.totalCost)), new Decimal(0));
      const current = holdings.reduce((s, h) => (h.currentValue ? s.plus(new Decimal(h.currentValue)) : s), new Decimal(0));
      return { scheme, holdings, invested, current, pnl: current.minus(invested) };
    });
  }, [allHoldings]);

  // Default open state: sections with holdings expanded, empty ones collapsed.
  const openSet = expanded ?? new Set<SchemeType>(sections.filter((s) => s.holdings.length > 0).map((s) => s.scheme));

  function toggle(scheme: SchemeType) {
    const next = new Set(openSet);
    if (next.has(scheme)) next.delete(scheme);
    else next.add(scheme);
    setExpanded(next);
  }

  function openAdd(scheme: SchemeType) {
    setAddScheme(scheme);
    setFormOpen(true);
  }

  const totalInvested = sections.reduce((s, sec) => s.plus(sec.invested), new Decimal(0));
  const totalCurrent = sections.reduce((s, sec) => s.plus(sec.current), new Decimal(0));
  const totalPnL = totalCurrent.minus(totalInvested);
  const pnlPct = totalInvested.isZero() ? null : totalPnL.div(totalInvested).times(100).toNumber();
  const totalCount = allHoldings.length;

  return (
    <div>
      <PageHeader
        title="Post Office Schemes"
        description="NSC, KVP, SCSS, SSY, MIS, RD, TD and Savings — all India Post investments in one place."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <DownloadReportButton type="holdings" assetClasses={PO_ASSET_CLASSES} />
            <Button onClick={() => openAdd('NSC')}>
              <Plus className="h-4 w-4" /> Add scheme
            </Button>
          </div>
        }
      />

      {/* Summary strip */}
      {!isLoading && totalCount > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {([
            { label: 'Invested', value: formatINR(totalInvested.toString()), sub: `${totalCount} account${totalCount === 1 ? '' : 's'}`, cls: '' },
            { label: 'Current value', value: formatINR(totalCurrent.toString()), sub: 'across all schemes', cls: '' },
            {
              label: 'Unrealised P&L',
              value: `${totalPnL.gte(0) ? '+' : ''}${formatINR(totalPnL.toString())}${pnlPct != null ? ` (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)` : ''}`,
              sub: 'interest accrual',
              cls: totalPnL.gte(0) ? 'text-positive' : 'text-negative',
            },
          ]).map((m) => (
            <Card key={m.label}>
              <CardContent className="px-4 py-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{m.label}</p>
                <p className={`text-lg sm:text-xl font-semibold tabular-nums mt-1 break-words ${m.cls}`}>{m.value}</p>
                <p className="text-xs text-muted-foreground">{m.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Card key={i} className="h-16 animate-pulse bg-muted/60" />)}
        </div>
      )}

      {!isLoading && totalCount === 0 && (
        <EmptyState
          icon={Landmark}
          title="No Post Office schemes yet"
          description="Add an NSC, KVP, SCSS, SSY, MIS, RD, TD or Savings account to start tracking."
          action={<Button onClick={() => openAdd('NSC')}><Plus className="h-4 w-4" /> Add first scheme</Button>}
        />
      )}

      {/* Accordion of all 8 schemes */}
      {!isLoading && (
        <div className="space-y-2.5">
          {sections.map((sec) => {
            const cfg = SCHEMES[sec.scheme];
            const isOpen = openSet.has(sec.scheme);
            const isEmpty = sec.holdings.length === 0;

            // Empty schemes: thin "add first" affordance, always collapsed.
            if (isEmpty) {
              return (
                <button
                  key={sec.scheme}
                  type="button"
                  onClick={() => openAdd(sec.scheme)}
                  className="w-full flex items-center justify-between rounded-lg border border-dashed border-border/70 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors group"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Landmark className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="text-sm font-medium text-foreground/80">{cfg.label}</span>
                      <span className="text-xs text-muted-foreground ml-2 truncate">{cfg.fullName}</span>
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground group-hover:text-foreground flex items-center gap-1 shrink-0">
                    <Plus className="h-3.5 w-3.5" /> Add first {cfg.label}
                  </span>
                </button>
              );
            }

            return (
              <Card key={sec.scheme} className="overflow-hidden">
                {/* Header */}
                <button
                  type="button"
                  onClick={() => toggle(sec.scheme)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10 ring-1 ring-accent/25 text-accent">
                    <Landmark className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{cfg.label}</span>
                      <span className="text-xs text-muted-foreground">({sec.holdings.length})</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{cfg.fullName}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-6 text-right shrink-0">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Invested</p>
                      <p className="text-sm font-medium tabular-nums">{formatINR(sec.invested.toString())}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current</p>
                      <p className="text-sm font-medium tabular-nums">{formatINR(sec.current.toString())}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">P&L</p>
                      <p className={`text-sm font-medium tabular-nums ${sec.pnl.gte(0) ? 'text-positive' : 'text-negative'}`}>
                        {sec.pnl.gte(0) ? '+' : ''}{formatINR(sec.pnl.toString())}
                      </p>
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Expanded body */}
                {isOpen && (
                  <div className="border-t">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm rtable">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Account</th>
                            <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">Portfolio</th>
                            <th className="text-right px-4 py-2 font-medium text-muted-foreground">Invested</th>
                            <th className="text-right px-4 py-2 font-medium text-muted-foreground hidden sm:table-cell">Current</th>
                            <th className="text-right px-4 py-2 font-medium text-muted-foreground">P&L</th>
                            <th className="px-4 py-2 w-8" />
                          </tr>
                        </thead>
                        <tbody>
                          {sec.holdings.map((h) => {
                            const pnl = h.currentValue ? new Decimal(h.currentValue).minus(new Decimal(h.totalCost)) : null;
                            return (
                              <tr
                                key={h.id}
                                className="border-b last:border-0 hover:bg-muted/20 transition-colors cursor-pointer"
                                onClick={() => navigate(`/post-office/${h.id}`, { state: { holding: h } })}
                              >
                                <td data-label="Account" className="px-4 py-3">
                                  <p className="font-medium truncate max-w-[200px]">{h.assetName}</p>
                                  {h.isin && <p className="text-xs text-muted-foreground">{h.isin}</p>}
                                </td>
                                <td data-label="Portfolio" className="px-4 py-3 hidden md:table-cell text-muted-foreground text-xs">{h.portfolioName}</td>
                                <td data-label="Invested" className="px-4 py-3 text-right tabular-nums font-medium">{formatINR(h.totalCost)}</td>
                                <td data-label="Current" className="px-4 py-3 text-right tabular-nums hidden sm:table-cell">{h.currentValue ? formatINR(h.currentValue) : '—'}</td>
                                <td data-label="P&L" className="px-4 py-3 text-right tabular-nums">
                                  {pnl ? (
                                    <span className={pnl.gte(0) ? 'text-positive' : 'text-negative'}>
                                      {pnl.gte(0) ? '+' : ''}{formatINR(pnl.toString())}
                                    </span>
                                  ) : '—'}
                                </td>
                                <td data-fullrow className="px-4 py-3 text-right">
                                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/60 inline" />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-4 py-2.5 border-t bg-muted/20">
                      <Button variant="outline" size="sm" onClick={() => openAdd(sec.scheme)}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add {cfg.label}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <PostOfficeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={null}
        defaultPortfolioId={portfolios?.[0]?.id}
        defaultAssetClass={SCHEMES[addScheme].assetClass as AssetClass}
      />
    </div>
  );
}
