import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Download, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { fmtDate } from '@/components/ca/accessModel';
import {
  FILING_STATUSES,
  FILING_STATUS_LABEL,
  caClientListApi,
  dueLabel,
  filingYearOptions,
  type ClientOverviewRow,
  type FilingStatus,
} from '@/api/caClientList.api';

const ACCESS_LABEL = { VIEW: 'View only', PARTIAL: 'Some changes', FULL: 'Keeps the books' } as const;
const PAGE_SIZE = 50;

/**
 * The practice's client list, built for hundreds of clients: search (name,
 * email, PAN), filter by where the return stands, sort by due date, page
 * through, change a return's status in place, and export the lot.
 */
export function ClientListTable({
  onCloseEngagement,
  closing,
}: {
  onCloseEngagement: (clientId: string) => void;
  closing: boolean;
}) {
  const years = filingYearOptions();
  const [fy, setFy] = useState(years[0]!);
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<FilingStatus | undefined>();
  const [sort, setSort] = useState<'due' | 'name' | 'status'>('due');
  const [page, setPage] = useState(1);

  // Search on the server once typing pauses, back to the first page.
  useEffect(() => {
    const id = setTimeout(() => {
      setQ(typed.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(id);
  }, [typed]);

  const params = { fy, q: q || undefined, status, sort, page, limit: PAGE_SIZE };
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ca', 'clients', 'overview', params],
    queryFn: () => caClientListApi.overview(params),
    placeholderData: keepPreviousData,
  });

  const setFiling = useMutation({
    mutationFn: (v: { clientId: string; status: FilingStatus }) =>
      caClientListApi.setFiling(v.clientId, fy, { status: v.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ca', 'clients', 'overview'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const [exporting, setExporting] = useState(false);
  async function exportCsv() {
    setExporting(true);
    try {
      await caClientListApi.downloadCsv(fy);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search clients"
            placeholder="Search name, email or PAN"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="pl-8"
          />
        </div>
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          FY
          <select
            aria-label="Financial year"
            value={fy}
            onChange={(e) => {
              setFy(e.target.value);
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-background px-2 text-[13px] text-foreground"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          Sort
          <select
            aria-label="Sort clients"
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="h-9 rounded-md border border-input bg-background px-2 text-[13px] text-foreground"
          >
            <option value="due">Due date</option>
            <option value="name">Name</option>
            <option value="status">Return status</option>
          </select>
        </label>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={exporting}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {data && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by return status">
          <StatusChip active={!status} onClick={() => { setStatus(undefined); setPage(1); }}>
            All {Object.values(data.counts).reduce((a, b) => a + b, 0)}
          </StatusChip>
          {FILING_STATUSES.map((s) => (
            <StatusChip key={s} active={status === s} onClick={() => { setStatus(s); setPage(1); }}>
              {`${FILING_STATUS_LABEL[s]} ${data.counts[s]}`}
            </StatusChip>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl border border-border/60 bg-muted/20" />
      ) : isError || !data ? (
        <p className="rounded-xl border p-4 text-[13px] text-muted-foreground">The client list could not load. Try again in a minute.</p>
      ) : data.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-[13px] text-muted-foreground">
          {q || status ? 'No client matches that.' : 'No active clients yet.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/70">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead className="bg-muted/30 text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Client</th>
                <th className="px-3 py-2 font-medium">PAN</th>
                <th className="px-3 py-2 font-medium">Access</th>
                <th className="px-3 py-2 font-medium">Return (FY {data.fy})</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {data.rows.map((r) => (
                <ClientRow
                  key={r.clientId}
                  row={r}
                  saving={setFiling.isPending && setFiling.variables?.clientId === r.clientId}
                  onStatus={(s) => setFiling.mutate({ clientId: r.clientId, status: s })}
                  onClose={() => onCloseEngagement(r.clientId)}
                  closing={closing}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && pages > 1 && (
        <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
          <span>
            {(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.total)} of {data.total}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'focus-ring rounded-full border px-2.5 py-1 text-[12px]',
        active ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function ClientRow({
  row: r,
  saving,
  onStatus,
  onClose,
  closing,
}: {
  row: ClientOverviewRow;
  saving: boolean;
  onStatus: (s: FilingStatus) => void;
  onClose: () => void;
  closing: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const late = r.filing.daysLeft !== null && r.filing.daysLeft < 0;
  return (
    <tr className="align-middle">
      <td className="px-3 py-2.5">
        <p className="font-medium text-foreground">{r.name}</p>
        <p className="text-[12px] text-muted-foreground">{r.email ?? 'No email on record'}</p>
      </td>
      <td className="numeric px-3 py-2.5 text-muted-foreground">{r.panMasked ?? '—'}</td>
      <td className="px-3 py-2.5 text-muted-foreground">
        {ACCESS_LABEL[r.access]}
        {r.accessUntil && <span className="block text-[11.5px]">until {fmtDate(r.accessUntil)}</span>}
      </td>
      <td className="px-3 py-2.5">
        <select
          aria-label={`Return status for ${r.name}`}
          value={r.filing.status}
          disabled={saving}
          onChange={(e) => onStatus(e.target.value as FilingStatus)}
          className="h-8 rounded-md border border-input bg-background px-2 text-[12.5px] text-foreground"
        >
          {FILING_STATUSES.map((s) => (
            <option key={s} value={s}>
              {FILING_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {r.filing.itrForm && <span className="ml-2 text-[12px] text-muted-foreground">{r.filing.itrForm}</span>}
      </td>
      <td className="px-3 py-2.5">
        <p className="numeric text-foreground">{fmtDate(r.filing.dueDate)}</p>
        <p className={cn('text-[12px]', late ? 'text-negative' : 'text-muted-foreground')}>
          {r.filing.filedOn ? `Filed ${fmtDate(r.filing.filedOn)}` : dueLabel(r.filing.daysLeft)}
        </p>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-1.5">
          {confirming ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Keep
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={closing}
                onClick={onClose}
                className="border-negative/40 text-negative hover:bg-negative/10"
              >
                Close engagement
              </Button>
            </>
          ) : (
            <>
              <Button asChild size="sm" variant="outline">
                <Link to={`/ca/clients/${r.clientId}`}>
                  <BookOpen className="h-3.5 w-3.5" /> Open books
                </Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} className="text-muted-foreground">
                Close
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
