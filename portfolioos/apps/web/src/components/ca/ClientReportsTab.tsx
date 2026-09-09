import { useState } from 'react';
import { FileDown, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/cn';
import { getApiBaseUrl } from '@/api/baseUrl';
import { useAuthStore } from '@/stores/auth.store';
import { currentReportTheme } from '@/lib/reportTheme';
import { REPORTS, type ReportDef } from '@/pages/reports/TaxMisDownloads';

/**
 * The report catalogue, run for a client.
 *
 * Every download carries `clientId`, which the server resolves through
 * `getCaScope` before it decides whose rows to read. The CA's own session
 * identity is never swapped for the client's: the reports reach the client's
 * data through the `app_is_active_ca_for` read policies instead. That is the
 * difference between a CA seeing a client and a CA becoming one — the second
 * would also hand them the client's family-shared portfolios.
 *
 * This is the same REPORTS catalogue the user's own Reports page renders, not
 * a parallel list, so a report added there appears here without anyone
 * remembering to.
 */

function currentFy(): string {
  const now = new Date();
  // Indian financial year runs April–March.
  const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function fyOptions(): string[] {
  const [start] = currentFy().split('-').map(Number);
  return Array.from({ length: 6 }, (_, i) => {
    const y = start! - i;
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  });
}

export function ClientReportsTab({ clientId }: { clientId: string }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const today = new Date().toISOString().slice(0, 10);

  const [fy, setFy] = useState(currentFy());
  const [asOf, setAsOf] = useState(today);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  /** Shared fetch-and-save for the endpoints that aren't in the catalogue. */
  async function downloadRaw(path: string, filename: string, key: string) {
    setBusy(key);
    try {
      const sep = path.includes('?') ? '&' : '?';
      const r = await fetch(`${getApiBaseUrl()}${path}${sep}theme=${currentReportTheme()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert((e as Error).message || 'Download failed');
    } finally {
      setBusy(null);
    }
  }

  async function download(report: ReportDef, format: 'pdf' | 'xlsx' | 'xml') {
    setBusy(`${report.key}-${format}`);
    try {
      const params = new URLSearchParams({ format, clientId, theme: currentReportTheme() });
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
      alert((e as Error).message || 'Download failed');
    } finally {
      setBusy(null);
    }
  }

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? REPORTS.filter(
        (r) =>
          r.title.toLowerCase().includes(needle) || r.description.toLowerCase().includes(needle),
      )
    : REPORTS;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="grid grid-cols-2 gap-3 sm:contents">
            <div>
              <Label>Financial year</Label>
              <Select
                className="mt-1 w-full sm:w-32"
                value={fy}
                onChange={(e) => setFy(e.target.value)}
              >
                {fyOptions().map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>As-of date</Label>
              <Input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                className="mt-1 w-full sm:w-40"
              />
            </div>
            <div>
              <Label>From</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 w-full sm:w-40"
              />
            </div>
            <div>
              <Label>To</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 w-full sm:w-40"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground sm:ml-auto sm:max-w-sm">
            Each report uses whichever of these it needs. Everything here is your client&apos;s
            data, and every download is recorded.
          </p>
        </CardContent>
      </Card>

      {/* Two exports that are not in the catalogue: the provident-fund
          statement, which had no export at all until now, and the whole-year
          archive that composes the rest. */}
      <Card>
        <CardContent className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[13.5px] font-medium text-foreground">Whole year, one archive</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
              Every statement for {fy}, zipped. If a report fails it is named inside the archive
              rather than quietly left out.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                void downloadRaw(
                  `/api/reports/statement/provident-fund?format=xlsx&clientId=${clientId}`,
                  `provident-fund-${fy}.xlsx`,
                  'pf',
                )
              }
            >
              {busy === 'pf' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
              Provident fund
            </Button>
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                void downloadRaw(
                  `/api/reports/fy-bundle?fy=${fy}&clientId=${clientId}`,
                  `FY${fy}-bundle.zip`,
                  'bundle',
                )
              }
            >
              {busy === 'bundle' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
              Everything for {fy}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={1.7}
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reports"
          className="pl-9"
        />
      </div>

      {shown.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground">No report matches that.</p>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {shown.map((r) => (
              <div
                key={r.key}
                className="flex flex-col gap-2 border-b border-border/50 px-4 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium text-foreground">{r.title}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground text-pretty">
                    {r.description}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {(r.formats ?? ['pdf', 'xlsx']).map((f) => (
                    <Button
                      key={f}
                      variant="outline"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void download(r, f)}
                      className={cn(busy === `${r.key}-${f}` && 'opacity-70')}
                    >
                      {busy === `${r.key}-${f}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileDown className="h-3.5 w-3.5" />
                      )}
                      {f.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
