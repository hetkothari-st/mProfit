import { useState } from 'react';
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LineChart, RefreshCw, Plus, Loader2, Pencil, Upload, Download, CheckCircle2, XCircle, AlertTriangle, FileText, Trash2, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ImportJobDTO, ImportStatus } from '@portfolioos/shared';
import { IMPORT_STATUS_LABELS } from '@portfolioos/shared';
import { ImportErrorDialog } from '@/pages/imports/ImportErrorDialog';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { portfoliosApi } from '@/api/portfolios.api';
import { assetsApi } from '@/api/assets.api';
import { transactionsApi } from '@/api/transactions.api';
import { apiErrorMessage } from '@/api/client';
import { importsApi } from '@/api/imports.api';
import { useScan } from '@/context/ScanContext';
import { TransactionFormDialog } from '@/pages/transactions/TransactionFormDialog';
import { ImportDropzone } from '@/pages/imports/ImportDropzone';
import { MFCasparserDialog } from '@/pages/mutualFunds/MFCasparserDialog';
import { MFCasMailbackDialog } from '@/pages/mutualFunds/MFCasMailbackDialog';
import { PasswordPromptDialog } from '@/components/upload/PasswordPromptDialog';
import { useUploadWithPasswordRetry } from '@/hooks/useUploadWithPasswordRetry';
import { formatINR, formatPercent, Decimal, toDecimal } from '@portfolioos/shared';
import type { HoldingRow, TransactionDTO } from '@portfolioos/shared';

const TXN_TYPE_LABELS: Record<string, string> = {
  BUY: 'Buy', SELL: 'Sell / Redeem', DIVIDEND: 'Dividend',
  DEPOSIT: 'SIP/Deposit', WITHDRAWAL: 'Withdrawal',
};

export function MutualFundsPage() {
  const [formOpen, setFormOpen] = useState(false);
  const [editTxn, setEditTxn] = useState<TransactionDTO | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [mailbackOpen, setMailbackOpen] = useState(false);
  const [viewError, setViewError] = useState<ImportJobDTO | null>(null);
  const [confirmDeleteImportId, setConfirmDeleteImportId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const passwordRetry = useUploadWithPasswordRetry({
    retryFn: async (jobId, password, save) => importsApi.reprocess(jobId, password, save),
    onSuccess: () => {
      toast.success('Password accepted — reprocessing');
      queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed')),
  });

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
  });

  const holdingsQueries = useQueries({
    queries:
      portfolios?.map((p) => ({
        queryKey: ['portfolio-holdings', p.id],
        queryFn: () => portfoliosApi.holdings(p.id),
      })) ?? [],
  });

  const txnQuery = useQuery({
    queryKey: ['transactions', 'MUTUAL_FUND'],
    queryFn: () => transactionsApi.list({ assetClass: 'MUTUAL_FUND', pageSize: 200 }),
  });

  const syncMutation = useMutation({
    mutationFn: () => assetsApi.amfiSync(),
    onSuccess: (r) => {
      toast.success(`AMFI sync: ${r.navsUpserted} NAVs upserted, ${r.mastersCreated} new schemes`);
      queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-summary'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'AMFI sync failed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => transactionsApi.remove(id),
    onSuccess: () => {
      toast.success('Transaction deleted');
      setConfirmDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to delete')),
  });

  const deleteImportMutation = useMutation({
    mutationFn: (id: string) => importsApi.remove(id),
    onSuccess: () => {
      toast.success('Import removed');
      setConfirmDeleteImportId(null);
      queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Failed to remove import')),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      importsApi.upload({ file, portfolioId: null }),
    onSuccess: () => {
      toast.success('CAS uploaded — parsing in background. Status will update below.');
      queryClient.invalidateQueries({ queryKey: ['imports'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Upload failed')),
  });

  const { scanning, triggerScan } = useScan();

  const importsQuery = useQuery({
    queryKey: ['imports'],
    queryFn: () => importsApi.list(),
    refetchInterval: (query) => {
      const anyRunning = query.state.data?.some(
        (j) => j.status === 'PENDING' || j.status === 'PROCESSING',
      );
      // On any terminal-state transition in the last 5s, invalidate holdings
      // and transactions so the table updates regardless of success/failure.
      const justFinished = query.state.data?.some(
        (j) =>
          (j.status === 'COMPLETED' ||
            j.status === 'COMPLETED_WITH_ERRORS' ||
            j.status === 'FAILED') &&
          j.completedAt &&
          Date.now() - new Date(j.completedAt).getTime() < 5000,
      );
      if (justFinished) {
        queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
      }
      return anyRunning ? 2000 : false;
    },
  });

  const recentImports = (importsQuery.data ?? [])
    .filter((j) => j.type === 'MF_CAS_PDF' || j.type === 'MF_CAS_EXCEL')
    .slice(0, 5);

  const STATUS_STYLES: Record<ImportStatus, string> = {
    PENDING: 'bg-muted text-muted-foreground',
    PROCESSING: 'bg-blue-500/10 text-blue-600',
    COMPLETED: 'bg-positive/10 text-positive',
    COMPLETED_WITH_ERRORS: 'bg-amber-500/10 text-amber-700',
    FAILED: 'bg-negative/10 text-negative',
    NEEDS_PASSWORD: 'bg-amber-500/10 text-amber-700',
  };
  const STATUS_ICONS: Record<ImportStatus, typeof FileText> = {
    PENDING: Loader2,
    PROCESSING: Loader2,
    COMPLETED: CheckCircle2,
    COMPLETED_WITH_ERRORS: AlertTriangle,
    FAILED: XCircle,
    NEEDS_PASSWORD: Lock,
  };

  const all = holdingsQueries.flatMap((q, idx) =>
    (q.data ?? []).map((h) => ({
      ...h,
      portfolioId: portfolios?.[idx]?.id ?? '',
      portfolioName: portfolios?.[idx]?.name ?? '',
    })),
  );
  const mfs = all.filter((h) => h.assetClass === 'MUTUAL_FUND');

  const allTransactions: TransactionDTO[] = (txnQuery.data?.items ?? [])
    .slice()
    .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));

  const totalValueD = mfs.reduce(
    (s, h) => (h.currentValue !== null ? s.plus(toDecimal(h.currentValue)) : s),
    new Decimal(0),
  );
  const totalCostD = mfs.reduce((s, h) => s.plus(toDecimal(h.totalCost)), new Decimal(0));
  const totalPnLD = totalValueD.minus(totalCostD);
  const totalPnLPct = totalCostD.greaterThan(0)
    ? totalPnLD.dividedBy(totalCostD).times(100).toNumber()
    : 0;

  function openEdit(txn: TransactionDTO) { setEditTxn(txn); setFormOpen(true); }
  function openAdd() { setEditTxn(null); setFormOpen(true); }
  function scrollToUpload() {
    document.getElementById('automated-cas-import')?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div>
      <PageHeader
        title="Mutual Funds"
        description="MF holdings across all portfolios, priced from AMFI NAV"
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setSyncDialogOpen(true)}>
              <Download className="h-4 w-4" /> Sync MF via CASParser
            </Button>
            <Button variant="outline" onClick={() => setMailbackOpen(true)}>
              <RefreshCw className="h-4 w-4" /> Sync via CAMS / KFintech
            </Button>
            <Button
              variant="outline"
              onClick={triggerScan}
              disabled={scanning}
              title="Check Gmail for new CAS emails now"
            >
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Scan inbox
            </Button>
            <Button variant="outline" onClick={scrollToUpload}><Upload className="h-4 w-4" /> Import CAS PDF</Button>
            <Button variant="outline" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync AMFI NAV
            </Button>
            <Button variant="outline" onClick={openAdd}><Plus className="h-4 w-4" /> Add transaction</Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6" id="automated-cas-import">
        <Card className="lg:col-span-3">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium mb-2">Automated CAS Import</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Upload your CAMS or KFintech CAS PDF. We'll automatically extract all mutual fund transactions.
            </p>
            <ImportDropzone
              onUpload={(file) => uploadMutation.mutate(file)}
              uploading={uploadMutation.isPending}
            />
          </CardContent>
        </Card>
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="p-4 text-xs space-y-2">
            <p className="font-semibold">Pro Tips:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Password-protected PDFs: we'll prompt you for the password if needed.</li>
              <li>We auto-try your PAN, email & phone from Settings.</li>
              <li>Consolidated CAS (Demat + MF) is supported.</li>
              <li>Only MF transactions will be extracted.</li>
              <li>New transactions append to your history.</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {recentImports.length > 0 && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Recent imports</h3>
              <Link to="/import" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>
            <div className="space-y-2">
              {recentImports.map((j) => {
                const status = j.status as ImportStatus;
                const Icon = STATUS_ICONS[status];
                const isRunning = status === 'PENDING' || status === 'PROCESSING';
                const hasError =
                  status === 'FAILED' ||
                  (j.failedRows ?? 0) > 0 ||
                  (j.errorLog?.parserWarnings?.length ?? 0) > 0;
                const isConfirmingDelete = confirmDeleteImportId === j.id;
                const isDeletingThis = deleteImportMutation.isPending && confirmDeleteImportId === j.id;
                const firstWarning = j.errorLog?.parserWarnings?.[0] ?? j.errorLog?.general ?? null;
                const needsPassword = status === 'NEEDS_PASSWORD';
                const isEmptyCas =
                  status === 'COMPLETED' &&
                  (j.totalRows ?? 0) === 0 &&
                  firstWarning?.toLowerCase().includes('no mutual fund transactions');
                return (
                  <div
                    key={j.id}
                    className="rounded border bg-muted/20 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate font-medium">{j.fileName}</span>
                    {needsPassword ? (
                      <button
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]} hover:bg-amber-500/20 transition-colors`}
                        onClick={() => passwordRetry.openForJob(j.id, j.fileName)}
                        title="Click to enter PDF password"
                      >
                        <Lock className="h-3 w-3" />
                        {IMPORT_STATUS_LABELS[status]}
                      </button>
                    ) : (
                      <span
                        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
                      >
                        <Icon className={`h-3 w-3 ${isRunning ? 'animate-spin' : ''}`} />
                        {IMPORT_STATUS_LABELS[status]}
                      </span>
                    )}
                    {!isRunning && (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {j.totalRows != null ? `${j.successRows ?? 0}/${j.totalRows} rows` : '—'}
                      </span>
                    )}
                    {hasError && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewError(j)}
                        className="h-7 px-2 text-xs"
                      >
                        <AlertTriangle className="h-3 w-3" /> View
                      </Button>
                    )}
                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">Remove?</span>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={isDeletingThis}
                          onClick={() => deleteImportMutation.mutate(j.id)}
                        >
                          {isDeletingThis ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setConfirmDeleteImportId(null)}
                        >
                          No
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setConfirmDeleteImportId(j.id)}
                        title="Remove from list"
                        disabled={isRunning}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                    </div>
                    {isEmptyCas && (
                      <p className="text-[11px] text-muted-foreground mt-1.5 pl-7">
                        CAS confirmed — no MF transactions in this period. If you have holdings, request a wider date range.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {recentImports.some((j) => j.status === 'PROCESSING' || j.status === 'PENDING') && (
              <p className="text-[10px] text-muted-foreground mt-3">
                Parsing in progress — this can take 10-30 seconds for large CAS files.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {mfs.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title="No mutual fund holdings"
          description="Sync AMFI NAV first, then add a BUY or SIP transaction on a scheme."
          action={<Button onClick={openAdd}><Plus className="h-4 w-4" /> Add transaction</Button>}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Current value', value: formatINR(totalValueD.toFixed(4)) },
              { label: 'Invested', value: formatINR(totalCostD.toFixed(4)) },
              {
                label: 'Unrealised P&L',
                value: formatINR(totalPnLD.toFixed(4)),
                cls: totalPnLD.greaterThan(0) ? 'text-positive' : totalPnLD.isNegative() ? 'text-negative' : '',
              },
              {
                label: 'Return',
                value: formatPercent(totalPnLPct),
                cls: totalPnLD.greaterThan(0) ? 'text-positive' : totalPnLD.isNegative() ? 'text-negative' : '',
              },
            ].map((m) => (
              <Card key={m.label}>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">{m.label}</div>
                  <div className={`text-xl font-semibold mt-1 tabular-nums ${m.cls ?? ''}`}>{m.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Holdings */}
          <Card className="mb-8">
            <CardContent className="p-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b">
                    <th className="py-2 pr-4">Scheme</th>
                    <th className="py-2 pr-4 text-right">Units</th>
                    <th className="py-2 pr-4 text-right">Avg cost</th>
                    <th className="py-2 pr-4 text-right">NAV</th>
                    <th className="py-2 pr-4 text-right">Value</th>
                    <th className="py-2 pr-4 text-right">P&L</th>
                    <th className="py-2 pr-4 text-right">%</th>
                    <th className="py-2 pr-4">Portfolio</th>
                  </tr>
                </thead>
                <tbody>
                  {mfs.map((h: HoldingRow & { portfolioName: string; portfolioId: string }) => (
                    <tr key={h.id} className="border-b last:border-0 hover:bg-accent/20">
                      <td className="py-2 pr-4">
                        <div className="font-medium truncate max-w-sm">{h.assetName}</div>
                        <div className="text-xs text-muted-foreground">{h.symbol ?? h.isin ?? ''}</div>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{h.quantity}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatINR(h.avgCostPrice)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{h.currentPrice != null ? formatINR(h.currentPrice) : '—'}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{h.currentValue != null ? formatINR(h.currentValue) : '—'}</td>
                      <td className={`py-2 pr-4 text-right tabular-nums ${h.unrealisedPnL && toDecimal(h.unrealisedPnL).greaterThan(0) ? 'text-positive' : h.unrealisedPnL && toDecimal(h.unrealisedPnL).isNegative() ? 'text-negative' : ''}`}>
                        {h.unrealisedPnL != null ? formatINR(h.unrealisedPnL) : '—'}
                      </td>
                      <td className={`py-2 pr-4 text-right tabular-nums ${(h.unrealisedPnLPct ?? 0) > 0 ? 'text-positive' : (h.unrealisedPnLPct ?? 0) < 0 ? 'text-negative' : ''}`}>
                        {h.unrealisedPnLPct != null ? formatPercent(h.unrealisedPnLPct) : '—'}
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{h.portfolioName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Transactions */}
      {allTransactions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Transactions</h3>
          <div className="rounded-md border overflow-x-auto overflow-y-auto max-h-[600px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm shadow-sm">
                <tr className="border-b">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Scheme</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Type</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Units</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground hidden md:table-cell">NAV</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Amount</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {allTransactions.map((txn) => {
                  const amount = new Decimal(txn.quantity).times(new Decimal(txn.price));
                  const isConfirmDelete = confirmDeleteId === txn.id;
                  const isDeleting = deleteMutation.isPending && confirmDeleteId === txn.id;
                  return (
                    <tr key={txn.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{txn.tradeDate}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium truncate max-w-[180px]">{txn.assetName ?? '—'}</p>
                        {txn.isin && <p className="text-xs text-muted-foreground">{txn.isin}</p>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${['BUY','DEPOSIT','DIVIDEND_PAYOUT','DIVIDEND_REINVEST','SIP','BONUS'].includes(txn.transactionType) ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                          {TXN_TYPE_LABELS[txn.transactionType] ?? txn.transactionType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums hidden sm:table-cell text-muted-foreground">{new Decimal(txn.quantity).toFixed(3)}</td>
                      <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell text-muted-foreground">{formatINR(txn.price)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{formatINR(amount.toString())}</td>
                      <td className="px-4 py-3">
                        {isConfirmDelete ? (
                          <div className="flex items-center gap-1 justify-end">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Sure?</span>
                            <Button type="button" variant="destructive" size="sm" className="h-7 px-2 text-xs" disabled={isDeleting} onClick={() => deleteMutation.mutate(txn.id)}>
                              {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Yes'}
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setConfirmDeleteId(null)}>No</Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 justify-end">
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(txn)} title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDeleteId(txn.id)} title="Delete">
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <TransactionFormDialog
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditTxn(null); }}
        initial={editTxn}
      />

      {/* Old Playwright-driven CAMS + KFin dialog — kept as fallback when
          casparser credits are exhausted. To re-enable, swap the dialog
          below with MFCasMailbackDialog and uncomment the import above.
      <MFCasMailbackDialog
        open={syncDialogOpen}
        onOpenChange={setSyncDialogOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
          queryClient.invalidateQueries({ queryKey: ['transactions', 'MUTUAL_FUND'] });
        }}
      /> */}

      <MFCasparserDialog
        open={syncDialogOpen}
        onOpenChange={setSyncDialogOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
          queryClient.invalidateQueries({ queryKey: ['transactions', 'MUTUAL_FUND'] });
        }}
      />

      <MFCasMailbackDialog
        open={mailbackOpen}
        onOpenChange={setMailbackOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['portfolio-holdings'] });
          queryClient.invalidateQueries({ queryKey: ['transactions', 'MUTUAL_FUND'] });
        }}
      />

      <ImportErrorDialog job={viewError} onClose={() => setViewError(null)} />
      <PasswordPromptDialog {...passwordRetry.dialogProps} />
    </div>
  );
}
