import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { UploadCloud, Trash2, RefreshCw, FileText, CheckCircle2, XCircle, Loader2, AlertTriangle, Inbox, Download, Lock, KeyRound, Square, CheckSquare } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/common/EmptyState';
import { importsApi } from '@/api/imports.api';
import { portfoliosApi } from '@/api/portfolios.api';
import { apiErrorMessage } from '@/api/client';
import type { ImportJobDTO, ImportStatus } from '@portfolioos/shared';
import { IMPORT_STATUS_LABELS } from '@portfolioos/shared';
import { ImportErrorDialog } from './ImportErrorDialog';
import { ImportDropzone } from './ImportDropzone';

const STATUS_STYLES: Record<ImportStatus, string> = {
  PENDING: 'bg-muted text-muted-foreground',
  PROCESSING: 'bg-blue-500/10 text-blue-600',
  COMPLETED: 'bg-positive/10 text-positive',
  COMPLETED_WITH_ERRORS: 'bg-amber-500/10 text-amber-700',
  FAILED: 'bg-negative/10 text-negative',
};

const STATUS_ICONS: Record<ImportStatus, typeof FileText> = {
  PENDING: Loader2,
  PROCESSING: Loader2,
  COMPLETED: CheckCircle2,
  COMPLETED_WITH_ERRORS: AlertTriangle,
  FAILED: XCircle,
};

function isPasswordError(j: ImportJobDTO): boolean {
  return (
    j.status === 'FAILED' &&
    (j.errorLog?.parserWarnings ?? []).some((w) =>
      w.toLowerCase().includes('password'),
    )
  );
}

function PasswordUnlockRow({
  job,
  onDone,
}: {
  job: ImportJobDTO;
  onDone: () => void;
}) {
  const [pw, setPw] = useState('');
  const queryClient = useQueryClient();
  const mut = useMutation({
    mutationFn: async () => {
      if (!pw.trim()) throw new Error('Enter a password');
      await importsApi.reprocess(job.id, pw.trim());
    },
    onSuccess: () => {
      toast.success('Password accepted — reprocessing');
      queryClient.invalidateQueries({ queryKey: ['imports'] });
      onDone();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed')),
  });

  return (
    <div className="flex items-center gap-2 mt-1.5 pl-2">
      <KeyRound className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span className="text-[11px] text-amber-600 shrink-0 whitespace-nowrap">PDF password:</span>
      <Input
        className="h-7 text-xs w-40 font-mono"
        placeholder="PAN or custom password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && mut.mutate()}
        autoFocus
      />
      <Button
        size="sm"
        className="h-7 px-3 text-xs shrink-0"
        onClick={() => mut.mutate()}
        disabled={mut.isPending || !pw.trim()}
      >
        {mut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Retry'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs shrink-0"
        onClick={onDone}
      >
        Cancel
      </Button>
    </div>
  );
}

export function ImportPage() {
  const queryClient = useQueryClient();
  const [portfolioId, setPortfolioId] = useState<string>('');
  const [viewError, setViewError] = useState<ImportJobDTO | null>(null);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
  });

  const jobsQuery = useQuery({
    queryKey: ['imports'],
    queryFn: () => importsApi.list(),
    refetchInterval: (query) => {
      const anyRunning = query.state.data?.some(
        (j) => j.status === 'PENDING' || j.status === 'PROCESSING',
      );
      return anyRunning ? 2000 : false;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      importsApi.upload({ file, portfolioId: portfolioId || null }),
    onSuccess: () => {
      toast.success('File uploaded — import running in background');
      queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Upload failed')),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => importsApi.remove(id),
    onSuccess: () => {
      toast.success('Import removed');
      queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Remove failed')),
  });

  const reprocessMutation = useMutation({
    mutationFn: (id: string) => importsApi.reprocess(id),
    onSuccess: () => {
      toast.success('Reprocessing started');
      queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Reprocess failed')),
  });

  const jobs = jobsQuery.data ?? [];

  const allIds = jobs.map((j) => j.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  async function bulkDelete() {
    if (!confirm(`Delete ${selected.size} import record(s)? Transactions will be kept.`)) return;
    setBulkDeleting(true);
    const ids = [...selected];
    const results = await Promise.allSettled(ids.map((id) => importsApi.remove(id)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    setBulkDeleting(false);
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ['imports'] });
    if (failed > 0) toast.error(`${failed} deletions failed`);
    else toast.success(`Deleted ${ids.length} import${ids.length === 1 ? '' : 's'}`);
  }

  return (
    <div>
      <PageHeader
        title="Import"
        description="Upload contract notes, CAS statements, back-office CSVs or Excel files. Transactions will be parsed and added to your portfolio automatically."
      />

      <div className="flex justify-end mb-3">
        <Link to="/import/failures">
          <Button variant="outline" size="sm">
            <Inbox className="h-3 w-3" /> View failures
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Upload a file</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-3">
              <label className="text-xs text-muted-foreground block mb-1">Target portfolio (optional)</label>
              <Select value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)} className="max-w-md">
                <option value="">Default / first portfolio</option>
                {portfolios?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <ImportDropzone
              onUpload={(file) => uploadMutation.mutate(file)}
              uploading={uploadMutation.isPending}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Supported formats</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <div><span className="font-medium">PDF:</span> Zerodha contract notes, CAMS/KFintech CAS, NSDL/CDSL depository CAS</div>
            <div><span className="font-medium">Excel:</span> Broker back-office XLSX, generic workbooks</div>
            <div><span className="font-medium">CSV/TSV:</span> Generic transaction exports</div>
            <div className="pt-2 text-xs text-muted-foreground">
              Password-protected PDFs: enter your PAN when prompted after upload.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Import history</CardTitle>
          <div className="flex items-center gap-2">
            {someSelected && (
              <>
                <span className="text-xs text-muted-foreground">{selected.size} selected</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={bulkDelete}
                  disabled={bulkDeleting}
                >
                  {bulkDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Delete selected
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['imports'] })}
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {jobsQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading imports…</div>
          ) : jobs.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={UploadCloud}
                title="No imports yet"
                description="Drag & drop a contract note or CAS PDF above to get started."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 w-8">
                      <button onClick={toggleAll} className="flex items-center text-muted-foreground hover:text-foreground">
                        {allSelected
                          ? <CheckSquare className="h-4 w-4" />
                          : <Square className="h-4 w-4" />}
                      </button>
                    </th>
                    <th className="text-left font-medium px-4 py-2">File</th>
                    <th className="text-left font-medium px-4 py-2">Type</th>
                    <th className="text-left font-medium px-4 py-2">Status</th>
                    <th className="text-right font-medium px-4 py-2">Rows</th>
                    <th className="text-right font-medium px-4 py-2">Success</th>
                    <th className="text-right font-medium px-4 py-2">Failed</th>
                    <th className="text-left font-medium px-4 py-2">Uploaded</th>
                    <th className="text-right font-medium px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {jobs.map((j) => {
                    const pwErr = isPasswordError(j);
                    const status = j.status as ImportStatus;
                    const Icon = pwErr ? Lock : STATUS_ICONS[status];
                    const isRunning = status === 'PROCESSING' || status === 'PENDING';
                    const isUnlocking = unlockingId === j.id;
                    return (
                      <tr key={j.id} className={`hover:bg-muted/30 ${selected.has(j.id) ? 'bg-accent/20' : ''}`}>
                        <td className="px-4 py-2 w-8">
                          <button onClick={() => toggleOne(j.id)} className="flex items-center text-muted-foreground hover:text-foreground">
                            {selected.has(j.id)
                              ? <CheckSquare className="h-4 w-4 text-primary" />
                              : <Square className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="px-4 py-2">
                          <div className="max-w-xs">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="font-medium truncate">{j.fileName}</span>
                            </div>
                            {isUnlocking && (
                              <PasswordUnlockRow
                                job={j}
                                onDone={() => setUnlockingId(null)}
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {j.type.replace(/_/g, ' ')}
                        </td>
                        <td className="px-4 py-2">
                          {pwErr ? (
                            <button
                              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 transition-colors"
                              onClick={() => setUnlockingId(isUnlocking ? null : j.id)}
                              title="Click to enter PDF password"
                            >
                              <Lock className="h-3 w-3" />
                              Password protected
                            </button>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
                            >
                              <Icon className={`h-3 w-3 ${isRunning ? 'animate-spin' : ''}`} />
                              {IMPORT_STATUS_LABELS[status]}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{j.totalRows ?? '—'}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-positive">
                          {j.successRows ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-negative">
                          {j.failedRows ?? '—'}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {new Date(j.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-end gap-1">
                            {!pwErr && ((j.failedRows ?? 0) > 0 || (j.errorLog?.parserWarnings?.length ?? 0) > 0 || (j.errorLog?.rowErrors?.length ?? 0) > 0) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setViewError(j)}
                              >
                                <AlertTriangle className="h-3 w-3" />
                                {(j.failedRows ?? 0) > 0 || (j.errorLog?.rowErrors?.length ?? 0) > 0 ? 'Errors' : 'Warnings'}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => importsApi.download(j.id, j.fileName)}
                              title="Download source file"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={reprocessMutation.isPending}
                              onClick={() => reprocessMutation.mutate(j.id)}
                              title="Reprocess"
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={removeMutation.isPending}
                              onClick={() => {
                                if (confirm('Delete this import record? Transactions will be kept.')) {
                                  removeMutation.mutate(j.id);
                                }
                              }}
                            >
                              <Trash2 className="h-3 w-3 text-negative" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ImportErrorDialog job={viewError} onClose={() => setViewError(null)} />
    </div>
  );
}
