import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { formatINR } from '@portfolioos/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { analyticsApi, type MfSchemeRow, type PlanType } from '@/api/analytics.api';

const PLAN_TONE: Record<PlanType, string> = {
  DIRECT: 'text-positive border-positive/30',
  REGULAR: 'text-amber-600 border-amber-300',
  UNKNOWN: 'text-muted-foreground border-muted',
};

export function MfOverlapCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['mf-overlap'],
    queryFn: () => analyticsApi.mfOverlap(),
  });
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin inline" /> Loading overlap analysis…
        </CardContent>
      </Card>
    );
  }

  if (!data || data.summary.schemeCount === 0) return null;

  const { summary, overlapGroups, schemes } = data;
  const hasAnyDuplicate = summary.directRegularDuplicates > 0 || summary.overlapGroupCount > 0;

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-accent-ink/80 mb-1">
            Plan analysis
          </p>
          <CardTitle className="text-base">Direct vs Regular &amp; overlap</CardTitle>
        </div>
        {hasAnyDuplicate && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600">
            <AlertTriangle className="h-3.5 w-3.5" />
            Possible duplicates
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Tile label="Schemes" value={String(summary.schemeCount)} />
          <Tile label="Direct" value={String(summary.directCount)} tone="positive" />
          <Tile label="Regular" value={String(summary.regularCount)} tone="amber" />
          <Tile label="MF value" value={formatINR(summary.totalMfValue)} />
        </div>

        {summary.directRegularDuplicates > 0 && (
          <div className="rounded-md border border-amber-300/50 bg-amber-50/40 dark:bg-amber-950/20 px-3 py-2 mb-4 text-sm">
            <div className="font-medium flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              {summary.directRegularDuplicates} fund family held in both Direct and Regular plans
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Switching to Direct plans can save ~1% per year in expense-ratio drag.
            </p>
          </div>
        )}

        {overlapGroups.length > 0 && (
          <div className="mb-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Overlap groups
            </div>
            <div className="divide-y border rounded-md">
              {overlapGroups.map((g) => (
                <div key={g.canonicalName}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-muted/40"
                    onClick={() =>
                      setExpandedGroup((e) => (e === g.canonicalName ? null : g.canonicalName))
                    }
                  >
                    {expandedGroup === g.canonicalName ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    <span className="flex-1 text-sm font-medium capitalize">{g.canonicalName}</span>
                    {g.hasDirectAndRegular && (
                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                        Direct + Regular
                      </Badge>
                    )}
                    <span className="text-sm tabular-nums">{formatINR(g.totalValue)}</span>
                  </button>
                  {expandedGroup === g.canonicalName && (
                    <div className="bg-muted/20 px-3 pb-2">
                      {g.schemes.map((s) => (
                        <SchemeRowDisplay key={s.fundId} row={s} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            All MF schemes ({schemes.length})
          </div>
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-sm rtable">
              <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-1.5">Scheme</th>
                  <th className="text-left px-3 py-1.5">AMC</th>
                  <th className="text-left px-3 py-1.5">Plan</th>
                  <th className="text-right px-3 py-1.5">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {schemes.map((s) => (
                  <tr key={s.fundId} className="hover:bg-muted/30">
                    <td data-label="Scheme" className="px-3 py-1.5">{s.schemeName}</td>
                    <td data-label="AMC" className="px-3 py-1.5 text-muted-foreground">{s.amcName}</td>
                    <td data-label="Plan" className="px-3 py-1.5">
                      <Badge variant="outline" className={`text-[10px] ${PLAN_TONE[s.planType]}`}>
                        {s.planType}
                      </Badge>
                    </td>
                    <td data-label="Value" className="px-3 py-1.5 text-right tabular-nums">{formatINR(s.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'positive' | 'amber';
}) {
  const colorClass = tone === 'positive' ? 'text-positive' : tone === 'amber' ? 'text-amber-600' : 'text-foreground';
  return (
    <div className="border rounded-md px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${colorClass}`}>{value}</div>
    </div>
  );
}

function SchemeRowDisplay({ row }: { row: MfSchemeRow }) {
  return (
    <div className="flex items-center gap-3 py-1.5 text-sm">
      <Badge variant="outline" className={`text-[10px] ${PLAN_TONE[row.planType]}`}>
        {row.planType}
      </Badge>
      <span className="flex-1 truncate">{row.schemeName}</span>
      <span className="tabular-nums text-muted-foreground">{formatINR(row.totalValue)}</span>
    </div>
  );
}
