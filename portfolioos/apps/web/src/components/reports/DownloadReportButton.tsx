import { useState } from 'react';
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
import toast from 'react-hot-toast';
import { apiErrorMessage } from '@/api/client';
import { useReportablePortfolios } from '@/hooks/useReportablePortfolios';
import { useDownloadReport, type ReportFormat } from '@/hooks/useDownloadReport';
import { useThemeStore } from '@/stores/theme.store';
import { useReportSubject } from './useReportSubject';

type ReportTheme = 'light' | 'dark';

export type ReportType = 'holdings' | 'dashboard' | 'vehicles' | 'insurance' | 'loans' | 'credit-cards' | 'rental' | 'real-estate';

type SectionReportType = 'vehicles' | 'insurance' | 'loans' | 'credit-cards' | 'rental' | 'real-estate';
const SECTION_TYPES: SectionReportType[] = ['vehicles', 'insurance', 'loans', 'credit-cards', 'rental', 'real-estate'];

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
  const [scope, setScope]         = useState<'all' | 'single'>('all');
  const [format, setFormat]       = useState<ReportFormat>('pdf');
  const appIsDark                 = useThemeStore(s => s.dark);
  // Starts on the app's current theme; the picker below overrides it for
  // just this download, same as `format` does.
  const [theme, setTheme]         = useState<ReportTheme>(appIsDark ? 'dark' : 'light');
  const { download, loading }     = useDownloadReport();
  const reportSubject             = useReportSubject();

  // Only the caller's own books: in a family view the full list also carries
  // other members' portfolios, which the export refuses for a self report.
  const { data: portfolios } = useReportablePortfolios();
  // A report about someone else always spans all of THEIR portfolios — the
  // picker lists the caller's books, which can never narrow a member's report.
  const forOther = reportSubject.subject !== 'self';
  const onError = (err: unknown) => toast.error(apiErrorMessage(err, 'Download failed'));

  const isDashboard = type === 'dashboard';
  const isSection   = (SECTION_TYPES as string[]).includes(type);

  function sectionFilename(): string {
    const who = reportSubject.filenameSuffix;
    if (isDashboard) return `everypaisa-dashboard-report${who}.${format}`;
    if (isSection)   return `everypaisa-${type}-report${who}.${format}`;
    if (assetClasses && assetClasses.length > 0) {
      const slug = assetClasses.map(c => c.toLowerCase().replace(/_/g, '-')).join('_');
      return `everypaisa-${slug}-report${who}.${format}`;
    }
    return `everypaisa-holdings-report${who}.${format}`;
  }

  function handleDownload() {
    const filename = sectionFilename();

    if (isDashboard) {
      download(
        '/api/reports/dashboard-export',
        {
          format,
          theme,
          scope: forOther ? 'all' : scope,
          ...(!forOther && scope === 'single' && portfolioId ? { portfolioId } : {}),
          ...reportSubject.params,
        },
        filename,
      ).then(() => setOpen(false)).catch(onError);
      return;
    }

    if (isSection) {
      download(
        '/api/reports/section-export',
        { format, theme, section: type, ...reportSubject.params },
        filename,
      ).then(() => setOpen(false)).catch(onError);
      return;
    }

    // Holdings report. "All portfolios" is sent as the `all` token, which the
    // server resolves against whoever the report is about. Sending every id
    // in the list used to include other members' books in a family view and
    // was refused outright.
    const resolvedIds = forOther || portfolioId === '' || portfolioId === 'all'
      ? ['all']
      : [portfolioId];

    download(
      '/api/reports/holdings-export',
      {
        format,
        theme,
        portfolioIds: resolvedIds,
        ...(assetClasses && assetClasses.length > 0 ? { assetClasses } : {}),
        ...reportSubject.params,
      },
      filename,
    ).then(() => setOpen(false)).catch(onError);
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
              <FileDown className="h-4 w-4 text-accent-ink" />
              Download Report
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Whose data. Holdings and dashboard exports compose a workbook
                rather than a section list, so they take one person at a
                time; the household versions of those live under
                Reports → Statements. */}
            {reportSubject.enabled && (
              <div className="space-y-1.5">
                <Label>Report for</Label>
                <Select
                  value={reportSubject.subject}
                  onChange={e => reportSubject.setSubject(e.target.value)}
                >
                  {reportSubject.options
                    .filter(o => (isDashboard || (!isDashboard && !isSection)) ? o.value !== 'family' : true)
                    .map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </Select>
              </div>
            )}

            {/* Portfolio picker — only for holdings reports */}
            {!isDashboard && !isSection && (
              <div className="space-y-1.5">
                <Label>Portfolio</Label>
                {forOther ? (
                  <p className="text-xs text-muted-foreground">
                    Covers all of their portfolios.
                  </p>
                ) : (
                  <Select
                    value={portfolioId}
                    onChange={e => setPortfolioId(e.target.value)}
                  >
                    <option value="">All portfolios</option>
                    {portfolios?.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </Select>
                )}
              </div>
            )}

            {/* Dashboard scope picker */}
            {isDashboard && !forOther && (
              <div className="space-y-1.5">
                <Label>Scope</Label>
                <Select
                  value={scope}
                  onChange={e => setScope(e.target.value as 'all' | 'single')}
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
                        ? 'border-accent bg-accent/10 text-accent-ink'
                        : 'border-border text-muted-foreground hover:border-accent/50 hover:text-foreground',
                    )}
                  >
                    {f === 'pdf' ? 'PDF' : 'Excel (.xlsx)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme picker — starts on the app's own theme, overridable
                for just this download. */}
            <div className="space-y-1.5">
              <Label>Appearance</Label>
              <div className="grid grid-cols-2 gap-2">
                {(['dark', 'light'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTheme(t)}
                    className={cn(
                      'rounded-md border py-2.5 text-sm font-medium transition-colors',
                      theme === t
                        ? 'border-accent bg-accent/10 text-accent-ink'
                        : 'border-border text-muted-foreground hover:border-accent/50 hover:text-foreground',
                    )}
                  >
                    {t === 'dark' ? 'Dark' : 'Light (print)'}
                    {t === (appIsDark ? 'dark' : 'light') ? ' · current' : ''}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={handleDownload}
              disabled={loading || (isDashboard && !forOther && scope === 'single' && !portfolioId)}
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
