import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { portfoliosApi } from '@/api/portfolios.api';
import { useDownloadReport, type ReportFormat } from '@/hooks/useDownloadReport';

export type ReportType = 'holdings' | 'dashboard' | 'vehicles' | 'insurance' | 'loans' | 'credit-cards' | 'rental';

type SectionReportType = 'vehicles' | 'insurance' | 'loans' | 'credit-cards' | 'rental';
const SECTION_TYPES: SectionReportType[] = ['vehicles', 'insurance', 'loans', 'credit-cards', 'rental'];

interface Props {
  /** Which report endpoint to hit */
  type: ReportType;
  /** Pre-filter asset classes for holdings reports (comma-joined on the wire) */
  assetClasses?: string[];
  /** Label shown on the button; defaults to "Download" */
  label?: string;
  /** Extra className on the trigger button */
  className?: string;
}

export function DownloadReportButton({ type, assetClasses, label, className }: Props) {
  const [open, setOpen]           = useState(false);
  const [portfolioId, setPortfolioId] = useState<string>('');
  const [scope, setScope]         = useState<'all' | 'single' | 'per-portfolio'>('all');
  const [format, setFormat]       = useState<ReportFormat>('pdf');
  const { download, loading }     = useDownloadReport();

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
    staleTime: 60_000,
  });

  const isDashboard = type === 'dashboard';
  const isSection   = (SECTION_TYPES as string[]).includes(type);

  function handleDownload() {
    const filename = `portfolioos-${type}-report.${format}`;

    if (isDashboard) {
      download(
        '/api/reports/dashboard-export',
        {
          format,
          scope,
          ...(scope === 'single' && portfolioId ? { portfolioId } : {}),
        },
        filename,
      ).then(() => setOpen(false)).catch(err => alert(String(err)));
      return;
    }

    if (isSection) {
      download(
        '/api/reports/section-export',
        { format, section: type },
        filename,
      ).then(() => setOpen(false)).catch(err => alert(String(err)));
      return;
    }

    // Holdings report
    const resolvedIds = portfolioId === '' || portfolioId === 'all'
      ? (portfolios?.map(p => p.id) ?? [])
      : [portfolioId];

    download(
      '/api/reports/holdings-export',
      {
        format,
        portfolioIds: resolvedIds,
        ...(assetClasses && assetClasses.length > 0 ? { assetClasses } : {}),
      },
      filename,
    ).then(() => setOpen(false)).catch(err => alert(String(err)));
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn('gap-1.5', className)}
        onClick={() => setOpen(true)}
      >
        <FileDown className="h-3.5 w-3.5" />
        {label ?? 'Download'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="h-4 w-4 text-accent" />
              Download Report
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Portfolio picker — only for holdings reports */}
            {!isDashboard && !isSection && (
              <div className="space-y-1.5">
                <Label>Portfolio</Label>
                <Select
                  value={portfolioId}
                  onChange={e => setPortfolioId(e.target.value)}
                >
                  <option value="">All portfolios</option>
                  {portfolios?.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
            )}

            {/* Dashboard scope picker */}
            {isDashboard && (
              <div className="space-y-1.5">
                <Label>Scope</Label>
                <Select
                  value={scope}
                  onChange={e => setScope(e.target.value as typeof scope)}
                >
                  <option value="all">All portfolios combined</option>
                  <option value="single">Specific portfolio</option>
                </Select>
                {scope === 'single' && (
                  <Select
                    className="mt-2"
                    value={portfolioId}
                    onChange={e => setPortfolioId(e.target.value)}
                  >
                    <option value="">— pick portfolio —</option>
                    {portfolios?.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </Select>
                )}
              </div>
            )}

            {/* Format picker */}
            <div className="space-y-1.5">
              <Label>Format</Label>
              <div className="grid grid-cols-2 gap-2">
                {(['pdf', 'xlsx'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className={cn(
                      'rounded-md border py-2.5 text-sm font-medium transition-colors',
                      format === f
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-muted-foreground hover:border-accent/50 hover:text-foreground',
                    )}
                  >
                    {f === 'pdf' ? 'PDF' : 'Excel (.xlsx)'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={handleDownload}
              disabled={loading || (isDashboard && scope === 'single' && !portfolioId)}
            >
              {loading ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing…</>
              ) : (
                <><FileDown className="h-3.5 w-3.5" /> Download</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
